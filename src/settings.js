import { __awaiter } from "tslib";
// settings.ts
import { PluginSettingTab, Setting, debounce, Notice, normalizePath, // <--- ДОДАНО ІМПОРТ
 } from "obsidian";
import { LogLevel } from "./Logger"; // Імпортуємо LogLevel та LoggerSettings
// --- Мови ---
export const LANGUAGES = {
    af: "Afrikaans",
    sq: "Albanian",
    am: "Amharic",
    ar: "Arabic",
    hy: "Armenian",
    az: "Azerbaijani",
    eu: "Basque",
    be: "Belarusian",
    bn: "Bengali",
    bs: "Bosnian",
    bg: "Bulgarian",
    ca: "Catalan",
    ceb: "Cebuano",
    ny: "Chichewa",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    co: "Corsican",
    hr: "Croatian",
    cs: "Czech",
    da: "Danish",
    nl: "Dutch",
    en: "English",
    eo: "Esperanto",
    et: "Estonian",
    tl: "Filipino",
    fi: "Finnish",
    fr: "French",
    fy: "Frisian",
    gl: "Galician",
    ka: "Georgian",
    de: "German",
    el: "Greek",
    gu: "Gujarati",
    ht: "Haitian Creole",
    ha: "Hausa",
    haw: "Hawaiian",
    iw: "Hebrew",
    he: "Hebrew",
    hi: "Hindi",
    hmn: "Hmong",
    hu: "Hungarian",
    is: "Icelandic",
    ig: "Igbo",
    id: "Indonesian",
    ga: "Irish",
    it: "Italian",
    ja: "Japanese",
    jw: "Javanese",
    kn: "Kannada",
    kk: "Kazakh",
    km: "Khmer",
    rw: "Kinyarwanda",
    ko: "Korean",
    ku: "Kurdish (Kurmanji)",
    ky: "Kyrgyz",
    lo: "Lao",
    la: "Latin",
    lv: "Latvian",
    lt: "Lithuanian",
    lb: "Luxembourgish",
    mk: "Macedonian",
    mg: "Malagasy",
    ms: "Malay",
    ml: "Malayalam",
    mt: "Maltese",
    mi: "Maori",
    mr: "Marathi",
    mn: "Mongolian",
    my: "Myanmar (Burmese)",
    ne: "Nepali",
    no: "Norwegian",
    or: "Odia (Oriya)",
    ps: "Pashto",
    fa: "Persian",
    pl: "Polish",
    pt: "Portuguese",
    pa: "Punjabi",
    ro: "Romanian",
    ru: "Russian",
    sm: "Samoan",
    gd: "Scots Gaelic",
    sr: "Serbian",
    st: "Sesotho",
    sn: "Shona",
    sd: "Sindhi",
    si: "Sinhala",
    sk: "Slovak",
    sl: "Slovenian",
    so: "Somali",
    es: "Spanish",
    su: "Sundanese",
    sw: "Swahili",
    sv: "Swedish",
    tg: "Tajik",
    ta: "Tamil",
    tt: "Tatar",
    te: "Telugu",
    th: "Thai",
    tr: "Turkish",
    tk: "Turkmen",
    uk: "Ukrainian",
    ur: "Urdu",
    ug: "Uyghur",
    uz: "Uzbek",
    vi: "Vietnamese",
    cy: "Welsh",
    xh: "Xhosa",
    yi: "Yiddish",
    yo: "Yoruba",
    zu: "Zulu",
};
// --- Значення за замовчуванням ---
export const DEFAULT_SETTINGS = {
    // Connection & Model
    ollamaServerUrl: "http://localhost:11434",
    modelName: "",
    temperature: 0.7,
    contextWindow: 4096,
    // Roles
    userRolesFolderPath: "ai-forge/roles", // Кращий шлях за замовчуванням у Vault
    selectedRolePath: "",
    followRole: true,
    // Storage & History
    saveMessageHistory: true,
    chatHistoryFolderPath: "ai-forge/chats", // Кращий шлях за замовчуванням у Vault
    chatExportFolderPath: "ai-forge/exports", // Кращий шлях за замовчуванням у Vault
    // View Behavior
    openChatInTab: false,
    maxMessageHeight: 300,
    sidebarWidth: undefined, // Або null. Означає, що ширина не встановлена користувачем
    // Appearance
    userAvatarType: "initials",
    userAvatarContent: "U",
    aiAvatarType: "icon",
    aiAvatarContent: "bot",
    fixBrokenEmojis: true,
    // RAG
    ragEnabled: false,
    ragFolderPath: "ai-forge/rag", // Кращий шлях за замовчуванням у Vault
    ragEnableSemanticSearch: true,
    ragEmbeddingModel: "nomic-embed-text", // Популярна модель для вбудовувань
    ragChunkSize: 512,
    ragSimilarityThreshold: 0.5,
    ragTopK: 3,
    maxCharsPerDoc: 1500,
    ragAutoIndexOnStartup: true,
    // Productivity
    enableProductivityFeatures: false,
    dailyTaskFileName: "Tasks_Today.md",
    // Advanced Context Management (Summarization)
    useAdvancedContextStrategy: false,
    enableSummarization: false,
    summarizationPrompt: "Summarize the key points discussed so far in this conversation:\n\n{text_to_summarize}",
    keepLastNMessagesBeforeSummary: 10,
    summarizationChunkSize: 1500,
    summarizationModelName: "", // Залишаємо порожнім, вимагає вибору
    fallbackSummarizationModelName: "gemma2:2b", // Приклад fallback моделі
    // Speech & Translation
    googleApiKey: "", // Speech-to-Text
    speechLanguage: "uk-UA", // Ukrainian
    enableTranslation: false, // Застаріле поле, буде контролюватись translationProvider
    translationTargetLanguage: "uk", // Ukrainian
    googleTranslationApiKey: "", // Google Translate
    translationProvider: 'none', // За замовчуванням вимкнено
    ollamaTranslationModel: '', // Залишаємо порожнім
    // Tools/Agents
    enableToolUse: true,
    // Weather Agent Settings (ЗНАЧЕННЯ ЗА ЗАМОВЧУВАННЯМ ДЛЯ НОВИХ ПОЛІВ!)
    openWeatherMapApiKey: "YOUR_OPENWEATHERMAP_API_KEY", // Плейсхолдер!
    weatherDefaultLocation: "Kyiv", // Приклад локації за замовчуванням
    // Logger Settings
    consoleLogLevel: "INFO",
    fileLoggingEnabled: false,
    fileLogLevel: "WARN",
    logCallerInfo: false,
    logFilePath: "", // Logger сам підставить шлях до папки плагіна
    logFileMaxSizeMB: 5,
};
// --- Клас вкладки налаштувань ---
export class OllamaSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        // ... (існуючі debounced функції залишаються без змін)
        this.debouncedUpdateChatPath = debounce(() => __awaiter(this, void 0, void 0, function* () {
            this.plugin.logger.debug("Debounced: Updating chat path and ensuring folder exists...");
            if (this.plugin.chatManager) {
                this.plugin.chatManager.updateChatsFolderPath();
                yield this.plugin.chatManager.ensureFoldersExist();
            }
        }), 1000, true);
        this.debouncedUpdateRolePath = debounce(() => __awaiter(this, void 0, void 0, function* () {
            this.plugin.logger.debug("Debounced: Refreshing role list due to path change...");
            yield this.plugin.listRoleFiles(true);
            this.plugin.emit("roles-updated");
        }), 1000, true);
        this.debouncedUpdateRagPath = debounce(() => __awaiter(this, void 0, void 0, function* () {
            this.plugin.logger.debug("Debounced: Re-indexing RAG due to path change...");
            if (this.plugin.settings.ragEnabled && this.plugin.ragService) {
                yield this.plugin.ragService.indexDocuments();
            }
        }), 1000, true);
    }
    // Допоміжна функція для створення заголовків секцій
    createSectionHeader(text) {
        this.containerEl.createEl("h3", { text }).addClass("ai-forge-settings-header");
    }
    // Нова допоміжна функція для створення підзаголовків груп
    createGroupHeader(text) {
        this.containerEl.createEl("h4", { text }).addClass("ai-forge-settings-group-header");
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "AI Forge Settings" });
        // --- НОВА СТРУКТУРА СЕКЦІЙ ---
        // 1. General
        this.createSectionHeader("General");
        // Connection & Model Defaults (переміщено)
        this.createGroupHeader("Connection & Model Defaults");
        // ... (існуючі налаштування ollamaServerUrl, modelName, temperature, contextWindow, enableToolUse)
        new Setting(containerEl)
            .setName("Ollama Server URL")
            .setDesc("The URL of your running Ollama server (e.g., http://localhost:11434 or http://192.168.X.X:11434).")
            .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.ollamaServerUrl)
            .setValue(this.plugin.settings.ollamaServerUrl)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            let url = value.trim();
            if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
                url = "http://" + url;
            }
            if (url.endsWith("/")) {
                url = url.slice(0, -1);
            }
            this.plugin.settings.ollamaServerUrl = url || DEFAULT_SETTINGS.ollamaServerUrl;
            yield this.plugin.saveSettings();
        })));
        let modelDropdown = null;
        const updateOptions = (dropdown, button) => __awaiter(this, void 0, void 0, function* () {
            if (!dropdown)
                return;
            const currentVal = this.plugin.settings.modelName;
            dropdown.selectEl.innerHTML = "";
            dropdown.addOption("", "Loading models...");
            dropdown.setDisabled(true);
            button === null || button === void 0 ? void 0 : button.setDisabled(true).setIcon("loader");
            try {
                const models = yield this.plugin.ollamaService.getModels();
                dropdown.selectEl.innerHTML = "";
                dropdown.addOption("", "-- Select default model --");
                if (models && models.length > 0) {
                    models.forEach(modelName => {
                        dropdown.addOption(modelName, modelName);
                    });
                    dropdown.setValue(models.includes(currentVal) ? currentVal : "");
                }
                else {
                    dropdown.addOption("", "No models found");
                    dropdown.setValue("");
                }
            }
            catch (error) {
                this.plugin.logger.error("Error fetching models for settings:", error);
                dropdown.selectEl.innerHTML = "";
                dropdown.addOption("", "Error loading models!");
                dropdown.setValue("");
            }
            finally {
                dropdown.setDisabled(false);
                button === null || button === void 0 ? void 0 : button.setDisabled(false).setIcon("refresh-cw");
            }
        });
        new Setting(containerEl)
            .setName("Default Model Name")
            .setDesc("The default Ollama model for new chats.")
            .addDropdown((dropdown) => __awaiter(this, void 0, void 0, function* () {
            modelDropdown = dropdown;
            dropdown.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.modelName = value;
                yield this.plugin.saveSettings();
            }));
            yield updateOptions(dropdown); // Початкове завантаження
        }))
            .addExtraButton(button => {
            button
                .setIcon("refresh-cw")
                .setTooltip("Refresh model list")
                .onClick(() => __awaiter(this, void 0, void 0, function* () {
                yield updateOptions(modelDropdown, button);
                new Notice("Model list refreshed!");
            }));
        });
        new Setting(containerEl)
            .setName("Default Temperature")
            .setDesc("Controls randomness (0.0 = deterministic, >1.0 = creative).")
            .addSlider(slider => slider
            .setLimits(0, 2, 0.1)
            .setValue(this.plugin.settings.temperature)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.temperature = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName("Context Window Size (Tokens)")
            .setDesc("Max tokens model considers. Requires restart/reload if changed while model is loaded.")
            .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.contextWindow.toString())
            .setValue(this.plugin.settings.contextWindow.toString())
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            const num = parseInt(value.trim(), 10);
            this.plugin.settings.contextWindow = !isNaN(num) && num > 0 ? num : DEFAULT_SETTINGS.contextWindow;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName("Enable Tool Use (Experimental)")
            .setDesc("Allow AI models to use registered tools/agents to perform actions. Requires compatible models (e.g., Llama 3.1, some Mistral models).")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.enableToolUse)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.enableToolUse = value;
            yield this.plugin.saveSettings();
            // Можливо, потрібно сповістити OllamaService або PromptService про зміну
        })));
        // View Behavior (переміщено)
        this.createGroupHeader("View Behavior");
        // ... (існуючі налаштування openChatInTab, maxMessageHeight, sidebarWidth?)
        new Setting(containerEl)
            .setName("Open Chat in Main Tab")
            .setDesc("ON: Open in a main tab. OFF: Open in the right sidebar.")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.openChatInTab).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.openChatInTab = value;
            yield this.plugin.saveSettings();
            new Notice("Chat view location setting saved. Re-open the view to apply.", 5000);
        })));
        new Setting(containerEl)
            .setName("Max Message Height (pixels)")
            .setDesc("Collapse longer messages with 'Show More'. 0 disables.")
            .addText(text => text
            .setPlaceholder("Example: 300")
            .setValue(this.plugin.settings.maxMessageHeight.toString())
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const num = parseInt(value.trim(), 10);
            this.plugin.settings.maxMessageHeight = !isNaN(num) && num >= 0 ? num : DEFAULT_SETTINGS.maxMessageHeight;
            yield this.plugin.saveSettings();
            (_b = (_a = this.plugin.view) === null || _a === void 0 ? void 0 : _a.checkAllMessagesForCollapsing) === null || _b === void 0 ? void 0 : _b.call(_a);
        })));
        // TODO: Додати налаштування ширини сайдбару, якщо воно реалізовано
        // Appearance (переміщено)
        this.createGroupHeader("Appearance");
        // ... (існуючі налаштування userAvatar, aiAvatar, fixBrokenEmojis)
        // User Avatar
        new Setting(containerEl).setName("User Avatar Style").addDropdown(dropdown => dropdown
            .addOption("initials", "Initials")
            .addOption("icon", "Icon")
            .addOption("image", "Image (Vault Path)")
            .setValue(this.plugin.settings.userAvatarType)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.userAvatarType = value;
            yield this.plugin.saveSettings();
            this.display(); // Перемалювати налаштування
        })));
        const userAvatarSetting = new Setting(containerEl).setDesc(" "); // Пустий опис для вирівнювання
        userAvatarSetting.controlEl.addClass("ai-forge-avatar-content-setting");
        if (this.plugin.settings.userAvatarType === "initials") {
            userAvatarSetting.setName("User Initials").setDesc("Max 2 chars.");
            userAvatarSetting.addText(text => text.setValue(this.plugin.settings.userAvatarContent).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.userAvatarContent = value.trim().substring(0, 2) || DEFAULT_SETTINGS.userAvatarContent;
                yield this.plugin.saveSettings();
            })));
        }
        else if (this.plugin.settings.userAvatarType === "icon") {
            userAvatarSetting.setName("User Icon ID").setDesc('Obsidian icon ID (e.g., "user").');
            userAvatarSetting.addText(text => text
                .setPlaceholder("user")
                .setValue(this.plugin.settings.userAvatarContent)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.userAvatarContent = value.trim() || "user";
                yield this.plugin.saveSettings();
            })));
        }
        else if (this.plugin.settings.userAvatarType === "image") {
            userAvatarSetting.setName("User Avatar Image Path");
            userAvatarSetting.setDesc("Full path to the image file (png/jpeg/jpg) within your vault.");
            userAvatarSetting.addText(text => text
                .setPlaceholder("e.g., Assets/Images/user.png")
                .setValue(this.plugin.settings.userAvatarContent)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                const normalizedPath = normalizePath(value.trim());
                if (normalizedPath === "" || /\.(png|jpg|jpeg)$/i.test(normalizedPath)) {
                    this.plugin.settings.userAvatarContent = normalizedPath;
                }
                else {
                    new Notice("Invalid path. Please provide a path to a .png or .jpeg/jpg file, or leave empty.");
                    text.setValue(this.plugin.settings.userAvatarContent);
                    return;
                }
                yield this.plugin.saveSettings();
            })));
        }
        // AI Avatar
        new Setting(containerEl).setName("AI Avatar Style").addDropdown(dropdown => dropdown
            .addOption("initials", "Initials")
            .addOption("icon", "Icon")
            .addOption("image", "Image (Vault Path)")
            .setValue(this.plugin.settings.aiAvatarType)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.aiAvatarType = value;
            yield this.plugin.saveSettings();
            this.display();
        })));
        const aiAvatarSetting = new Setting(containerEl).setDesc(" ");
        aiAvatarSetting.controlEl.addClass("ai-forge-avatar-content-setting");
        if (this.plugin.settings.aiAvatarType === "initials") {
            aiAvatarSetting.setName("AI Initials").setDesc("Max 2 chars.");
            aiAvatarSetting.addText(text => text.setValue(this.plugin.settings.aiAvatarContent).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.aiAvatarContent = value.trim().substring(0, 2) || DEFAULT_SETTINGS.aiAvatarContent;
                yield this.plugin.saveSettings();
            })));
        }
        else if (this.plugin.settings.aiAvatarType === "icon") {
            aiAvatarSetting.setName("AI Icon ID").setDesc('Obsidian icon ID (e.g., "bot").');
            aiAvatarSetting.addText(text => text
                .setPlaceholder("bot")
                .setValue(this.plugin.settings.aiAvatarContent)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.aiAvatarContent = value.trim() || "bot";
                yield this.plugin.saveSettings();
            })));
        }
        else if (this.plugin.settings.aiAvatarType === "image") {
            aiAvatarSetting.setName("AI Avatar Image Path");
            aiAvatarSetting.setDesc("Full path to the image file (png/jpeg/jpg) within your vault.");
            aiAvatarSetting.addText(text => text
                .setPlaceholder("e.g., Assets/Images/ai.png")
                .setValue(this.plugin.settings.aiAvatarContent)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                const normalizedPath = normalizePath(value.trim());
                if (normalizedPath === "" || /\.(png|jpg|jpeg)$/i.test(normalizedPath)) {
                    this.plugin.settings.aiAvatarContent = normalizedPath;
                }
                else {
                    new Notice("Invalid path. Please provide a path to a .png or .jpeg/jpg file, or leave empty.");
                    text.setValue(this.plugin.settings.aiAvatarContent);
                    return;
                }
                yield this.plugin.saveSettings();
            })));
        }
        new Setting(containerEl)
            .setName("Fix Broken Emojis")
            .setDesc("Replace certain emoji sequences that models might break (e.g., 🤖).")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.fixBrokenEmojis).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.fixBrokenEmojis = value;
            yield this.plugin.saveSettings();
        })));
        // 2. Content & Knowledge
        this.createSectionHeader("Content & Knowledge");
        // Roles & Personas (переміщено)
        this.createGroupHeader("Roles & Personas");
        // ... (існуючі налаштування userRolesFolderPath, followRole)
        new Setting(containerEl)
            .setName("Custom Roles Folder Path")
            .setDesc("Folder with custom role (.md) files.")
            .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.userRolesFolderPath)
            .setValue(this.plugin.settings.userRolesFolderPath)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.userRolesFolderPath =
                normalizePath(value.trim()) || DEFAULT_SETTINGS.userRolesFolderPath;
            yield this.plugin.saveSettings();
            this.debouncedUpdateRolePath();
        })));
        new Setting(containerEl)
            .setName("Always Apply Selected Role")
            .setDesc("Always use the selected role as system prompt.")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.followRole).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.followRole = value;
            yield this.plugin.saveSettings();
        })));
        // Retrieval-Augmented Generation (RAG) (переміщено)
        this.createGroupHeader("Retrieval-Augmented Generation (RAG)");
        // ... (існуючі налаштування RAG)
        new Setting(containerEl)
            .setName("Enable RAG")
            .setDesc("Allow retrieving info from notes for context.")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.ragEnabled).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.ragEnabled = value;
            yield this.plugin.saveSettings();
            this.display();
            if (value)
                this.debouncedUpdateRagPath();
        })));
        if (this.plugin.settings.ragEnabled) {
            new Setting(containerEl)
                .setName("RAG Documents Folder Path")
                .setDesc("Folder with notes for RAG.")
                .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.ragFolderPath)
                .setValue(this.plugin.settings.ragFolderPath)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c, _d;
                this.plugin.settings.ragFolderPath = normalizePath(value.trim()) || DEFAULT_SETTINGS.ragFolderPath;
                yield this.plugin.saveSettings();
                this.debouncedUpdateRagPath();
                (_b = (_a = this.plugin).updateDailyTaskFilePath) === null || _b === void 0 ? void 0 : _b.call(_a); // Оновлення шляху до файлу завдань, якщо продуктивність увімкнена
                (_d = (_c = this.plugin).loadAndProcessInitialTasks) === null || _d === void 0 ? void 0 : _d.call(_c); // Перезавантаження завдань
            })));
            new Setting(containerEl)
                .setName("Enable Semantic Search")
                .setDesc("Use embeddings (more accurate). If OFF, uses keyword search.")
                .addToggle(toggle => toggle.setValue(this.plugin.settings.ragEnableSemanticSearch).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.ragEnableSemanticSearch = value;
                yield this.plugin.saveSettings();
                this.display();
                this.debouncedUpdateRagPath();
            })));
            if (this.plugin.settings.ragEnableSemanticSearch) {
                let embeddingDropdown = null;
                const updateEmbeddingOptions = (dropdown, button) => __awaiter(this, void 0, void 0, function* () {
                    if (!dropdown)
                        return;
                    const previousValue = this.plugin.settings.ragEmbeddingModel;
                    dropdown.selectEl.innerHTML = "";
                    dropdown.addOption("", "Loading models...");
                    dropdown.setDisabled(true);
                    button === null || button === void 0 ? void 0 : button.setDisabled(true).setIcon("loader");
                    try {
                        const models = yield this.plugin.ollamaService.getModels();
                        dropdown.selectEl.innerHTML = "";
                        dropdown.addOption("", "-- Select Embedding Model --");
                        const commonEmbedModels = [
                            "nomic-embed-text",
                            "all-minilm",
                            "mxbai-embed-large",
                            "bge-base-en",
                            "gte-base",
                        ];
                        commonEmbedModels.forEach(modelName => dropdown.addOption(modelName, modelName));
                        dropdown.addOption("---", "--- Other Installed Models ---").setDisabled(true);
                        if (models && models.length > 0) {
                            models.forEach(modelName => {
                                if (!commonEmbedModels.includes(modelName)) {
                                    dropdown.addOption(modelName, modelName);
                                }
                            });
                        }
                        dropdown.setValue(models.includes(previousValue) ? previousValue : commonEmbedModels.length > 0 ? commonEmbedModels[0] : "");
                    }
                    catch (error) {
                        console.error("Error fetching models for embedding dropdown:", error);
                        dropdown.selectEl.innerHTML = "";
                        dropdown.addOption("", "Error loading models!");
                        dropdown.setValue(previousValue);
                    }
                    finally {
                        dropdown.setDisabled(false);
                        button === null || button === void 0 ? void 0 : button.setDisabled(false).setIcon("refresh-cw");
                    }
                });
                new Setting(containerEl)
                    .setName("Embedding Model Name")
                    .setDesc("Ollama model for embeddings.")
                    .setClass("ollama-model-setting-container")
                    .addDropdown((dropdown) => __awaiter(this, void 0, void 0, function* () {
                    embeddingDropdown = dropdown;
                    dropdown.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                        this.plugin.settings.ragEmbeddingModel = value;
                        yield this.plugin.saveSettings();
                        this.debouncedUpdateRagPath();
                    }));
                    yield updateEmbeddingOptions(dropdown);
                }))
                    .addExtraButton(button => {
                    button
                        .setIcon("refresh-cw")
                        .setTooltip("Refresh model list")
                        .onClick(() => __awaiter(this, void 0, void 0, function* () {
                        yield updateEmbeddingOptions(embeddingDropdown, button);
                        new Notice("Model list refreshed!");
                    }));
                });
                new Setting(containerEl)
                    .setName("Chunk Size (Characters)")
                    .setDesc("Size of text chunks for indexing.")
                    .addText(text => text
                    .setPlaceholder(String(DEFAULT_SETTINGS.ragChunkSize))
                    .setValue(String(this.plugin.settings.ragChunkSize))
                    .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    const num = parseInt(value.trim(), 10);
                    this.plugin.settings.ragChunkSize = !isNaN(num) && num > 50 ? num : DEFAULT_SETTINGS.ragChunkSize;
                    yield this.plugin.saveSettings();
                    this.debouncedUpdateRagPath();
                })));
                new Setting(containerEl)
                    .setName("Similarity Threshold")
                    .setDesc("Min relevance score (0.0-1.0). Higher = stricter matching.")
                    .addSlider((slider) => slider
                    .setLimits(0, 1, 0.05)
                    .setValue(this.plugin.settings.ragSimilarityThreshold)
                    .setDynamicTooltip()
                    .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.ragSimilarityThreshold = value;
                    yield this.plugin.saveSettings();
                })));
                new Setting(containerEl)
                    .setName("Top K Results")
                    .setDesc("Max number of relevant chunks to retrieve.")
                    .addText(text => text
                    .setPlaceholder(String(DEFAULT_SETTINGS.ragTopK))
                    .setValue(String(this.plugin.settings.ragTopK))
                    .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    const num = parseInt(value.trim(), 10);
                    this.plugin.settings.ragTopK = !isNaN(num) && num > 0 ? num : DEFAULT_SETTINGS.ragTopK;
                    yield this.plugin.saveSettings();
                })));
            }
            new Setting(containerEl)
                .setName("Max Chars Per Document (During Context Build)")
                .setDesc("Limits characters included per retrieved document in the final prompt (0=no limit).")
                .addText(text => text
                .setPlaceholder(String(DEFAULT_SETTINGS.maxCharsPerDoc))
                .setValue(String(this.plugin.settings.maxCharsPerDoc))
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                const num = parseInt(value.trim(), 10);
                this.plugin.settings.maxCharsPerDoc = !isNaN(num) && num >= 0 ? num : DEFAULT_SETTINGS.maxCharsPerDoc;
                yield this.plugin.saveSettings();
            })));
        }
        // 3. Features
        this.createSectionHeader("Features");
        // Advanced Context Management (Summarization) (переміщено)
        this.createGroupHeader("Advanced Context Management (Summarization)");
        // ... (існуючі налаштування useAdvancedContextStrategy, enableSummarization, summarizationPrompt, etc.)
        new Setting(containerEl)
            .setName("Use Advanced Context Strategy")
            .setDesc("Enable automatic chat summarization and message chunking for long conversations.")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.useAdvancedContextStrategy).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.useAdvancedContextStrategy = value;
            yield this.plugin.saveSettings();
            this.display(); // Re-render settings to show/hide summarization options
        })));
        if (this.plugin.settings.useAdvancedContextStrategy) {
            new Setting(containerEl)
                .setName("Enable Context Summarization")
                .setDesc("Automatically summarize older parts of the conversation.")
                .addToggle(toggle => toggle.setValue(this.plugin.settings.enableSummarization).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.enableSummarization = value;
                yield this.plugin.saveSettings();
                this.display(); // Re-render to show/hide prompt
            })));
            if (this.plugin.settings.enableSummarization) {
                new Setting(containerEl)
                    .setName("Summarization Prompt")
                    .setDesc("Prompt used for summarization. Use {text_to_summarize} placeholder.")
                    .addTextArea(text => text
                    .setPlaceholder(DEFAULT_SETTINGS.summarizationPrompt)
                    .setValue(this.plugin.settings.summarizationPrompt)
                    .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.summarizationPrompt = value || DEFAULT_SETTINGS.summarizationPrompt;
                    yield this.plugin.saveSettings();
                }))
                    .inputEl.setAttrs({ rows: 4 }));
                // --- Вибір моделі для сумаризації ---
                let summarizationModelDropdown = null;
                const updateSummarizationOptions = (dropdown, button) => __awaiter(this, void 0, void 0, function* () {
                    if (!dropdown)
                        return;
                    const currentVal = this.plugin.settings.summarizationModelName;
                    dropdown.selectEl.innerHTML = "";
                    dropdown.addOption("", "Loading models...");
                    dropdown.setDisabled(true);
                    button === null || button === void 0 ? void 0 : button.setDisabled(true).setIcon("loader");
                    try {
                        const models = yield this.plugin.ollamaService.getModels();
                        dropdown.selectEl.innerHTML = "";
                        dropdown.addOption("", "-- Select Summarization Model --");
                        if (models && models.length > 0) {
                            models.forEach(modelName => {
                                dropdown.addOption(modelName, modelName);
                            });
                            dropdown.setValue(models.includes(currentVal) ? currentVal : "");
                        }
                        else {
                            dropdown.addOption("", "No models found");
                            dropdown.setValue("");
                        }
                    }
                    catch (error) {
                        this.plugin.logger.error("Error fetching models for summarization settings:", error);
                        dropdown.selectEl.innerHTML = "";
                        dropdown.addOption("", "Error loading models!");
                        dropdown.setValue("");
                    }
                    finally {
                        dropdown.setDisabled(false);
                        button === null || button === void 0 ? void 0 : button.setDisabled(false).setIcon("refresh-cw");
                    }
                });
                new Setting(containerEl)
                    .setName("Summarization Model")
                    .setDesc("Model used for summarizing chat history and individual messages.")
                    .addDropdown((dropdown) => __awaiter(this, void 0, void 0, function* () {
                    summarizationModelDropdown = dropdown;
                    dropdown.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                        this.plugin.settings.summarizationModelName = value;
                        yield this.plugin.saveSettings();
                    }));
                    yield updateSummarizationOptions(dropdown); // Initial load
                }))
                    .addExtraButton(button => {
                    button.setIcon("refresh-cw").setTooltip("Refresh model list")
                        .onClick(() => __awaiter(this, void 0, void 0, function* () { yield updateSummarizationOptions(summarizationModelDropdown, button); new Notice("Model list refreshed!"); }));
                });
                new Setting(containerEl)
                    .setName("Keep Last N Messages Before Summary")
                    .setDesc("Number of recent messages excluded from summarization.")
                    .addText(text => text
                    .setPlaceholder(DEFAULT_SETTINGS.keepLastNMessagesBeforeSummary.toString())
                    .setValue(this.plugin.settings.keepLastNMessagesBeforeSummary.toString())
                    .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    const num = parseInt(value.trim(), 10);
                    this.plugin.settings.keepLastNMessagesBeforeSummary =
                        !isNaN(num) && num >= 0 ? num : DEFAULT_SETTINGS.keepLastNMessagesBeforeSummary;
                    yield this.plugin.saveSettings();
                })));
                new Setting(containerEl)
                    .setName("Fallback Summarization Model")
                    .setDesc("Optional. Model to use if the primary summarization model is not set or not found. Uses the main Ollama server.")
                    .addText(text => text
                    .setPlaceholder("e.g., orca-mini or leave empty")
                    .setValue(this.plugin.settings.fallbackSummarizationModelName)
                    .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.fallbackSummarizationModelName = value.trim();
                    yield this.plugin.saveSettings();
                })));
                new Setting(containerEl)
                    .setName("Summarization Chunk Size (Tokens)")
                    .setDesc("Approximate size of text chunks passed to the summarization model.")
                    .addText(text => text
                    .setPlaceholder(DEFAULT_SETTINGS.summarizationChunkSize.toString())
                    .setValue(this.plugin.settings.summarizationChunkSize.toString())
                    .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    const num = parseInt(value.trim(), 10);
                    this.plugin.settings.summarizationChunkSize =
                        !isNaN(num) && num > 100 ? num : DEFAULT_SETTINGS.summarizationChunkSize;
                    yield this.plugin.saveSettings();
                })));
            }
        }
        // Productivity Assistant Features (переміщено)
        this.createGroupHeader("Productivity Assistant Features");
        // ... (існуючі налаштування enableProductivityFeatures, dailyTaskFileName)
        new Setting(containerEl)
            .setName("Enable Productivity Features")
            .setDesc("Activate daily task integration.")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.enableProductivityFeatures).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            this.plugin.settings.enableProductivityFeatures = value;
            yield this.plugin.saveSettings();
            this.display();
            (_b = (_a = this.plugin).updateDailyTaskFilePath) === null || _b === void 0 ? void 0 : _b.call(_a);
            (_d = (_c = this.plugin).loadAndProcessInitialTasks) === null || _d === void 0 ? void 0 : _d.call(_c);
        })));
        if (this.plugin.settings.enableProductivityFeatures) {
            new Setting(containerEl)
                .setName("Daily Task File Name")
                .setDesc("Filename within the RAG folder used for daily tasks.")
                .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.dailyTaskFileName)
                .setValue(this.plugin.settings.dailyTaskFileName)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c, _d;
                this.plugin.settings.dailyTaskFileName = value.trim() || DEFAULT_SETTINGS.dailyTaskFileName;
                yield this.plugin.saveSettings();
                (_b = (_a = this.plugin).updateDailyTaskFilePath) === null || _b === void 0 ? void 0 : _b.call(_a);
                (_d = (_c = this.plugin).loadAndProcessInitialTasks) === null || _d === void 0 ? void 0 : _d.call(_c);
            })));
        }
        // Weather Agent Settings (НОВА ГРУПА!)
        this.createGroupHeader("Weather Agent Settings");
        new Setting(containerEl)
            .setName("OpenWeatherMap API Key")
            .setDesc("Your API key from OpenWeatherMap. Required for weather forecasts. Keep confidential.")
            .addText(text => text
            .setPlaceholder("YOUR_OPENWEATHERMAP_API_KEY")
            .setValue(this.plugin.settings.openWeatherMapApiKey)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.openWeatherMapApiKey = value.trim();
            yield this.plugin.saveSettings();
            // Немає необхідності перезавантажувати щось, агент прочитає нове значення при наступному виклику
        })));
        new Setting(containerEl)
            .setName("Default Location")
            .setDesc("Default city or location for weather forecasts if not specified in the query.")
            .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.weatherDefaultLocation)
            .setValue(this.plugin.settings.weatherDefaultLocation)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.weatherDefaultLocation = value.trim();
            yield this.plugin.saveSettings();
            // Немає необхідності перезавантажувати щось
        })));
        // Speech & Translation (переміщено)
        this.createGroupHeader("Speech & Translation");
        // ... (існуючі налаштування translationProvider, googleTranslationApiKey, ollamaTranslationModel, googleApiKey, speechLanguage)
        // Контролюємо enableTranslation через translationProvider
        // this.plugin.settings.enableTranslation = this.plugin.settings.translationProvider !== 'none'; // Це можна робити при завантаженні налаштувань
        new Setting(containerEl)
            .setName("Translation Provider")
            .setDesc("Select the service for message and input translation.")
            .addDropdown(dropdown => dropdown
            .addOption('none', 'Disabled')
            .addOption('google', 'Google Translate API')
            .addOption('ollama', 'Ollama (Local Model)')
            .setValue(this.plugin.settings.translationProvider)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.translationProvider = value;
            // Вмикаємо/вимикаємо загальний перемикач залежно від вибору (для сумісності або логіки плагіна)
            // Або просто покладаємось на translationProvider напряму
            this.plugin.settings.enableTranslation = value !== 'none'; // Зберігаємо в старе поле теж
            yield this.plugin.saveSettings();
            this.display(); // Перемалювати налаштування, щоб показати/сховати залежні опції
        })));
        // --- Умовні налаштування для Google Translate ---
        if (this.plugin.settings.translationProvider === 'google') {
            new Setting(containerEl)
                .setName("Target Translation Language (Google)")
                .setDesc("Translate messages/input into this language using Google.")
                .addDropdown(dropdown => {
                for (const code in LANGUAGES) {
                    dropdown.addOption(code, LANGUAGES[code]);
                }
                dropdown.setValue(this.plugin.settings.translationTargetLanguage).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.translationTargetLanguage = value;
                    yield this.plugin.saveSettings();
                }));
            });
            new Setting(containerEl)
                .setName("Google Cloud Translation API Key")
                .setDesc("Required for Google translation feature. Keep confidential.")
                .addText(text => text
                .setPlaceholder("Enter API Key")
                .setValue(this.plugin.settings.googleTranslationApiKey)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.googleTranslationApiKey = value.trim();
                yield this.plugin.saveSettings();
            })));
        }
        // --- Умовні налаштування для Ollama ---
        if (this.plugin.settings.translationProvider === 'ollama') {
            let ollamaTranslationModelDropdown = null;
            const updateOllamaTranslationOptions = (dropdown, button) => __awaiter(this, void 0, void 0, function* () {
                if (!dropdown)
                    return;
                const currentVal = this.plugin.settings.ollamaTranslationModel;
                dropdown.selectEl.innerHTML = "";
                dropdown.addOption("", "Loading models...");
                dropdown.setDisabled(true);
                button === null || button === void 0 ? void 0 : button.setDisabled(true).setIcon("loader");
                try {
                    const models = yield this.plugin.ollamaService.getModels();
                    dropdown.selectEl.innerHTML = "";
                    dropdown.addOption("", "-- Select Ollama Translation Model --");
                    if (models && models.length > 0) {
                        models.forEach(m => dropdown.addOption(m, m));
                        dropdown.setValue(models.includes(currentVal) ? currentVal : "");
                    }
                    else {
                        dropdown.addOption("", "No models found");
                        dropdown.setValue("");
                    }
                }
                catch (error) { /* ... обробка помилки ... */
                    this.plugin.logger.error("Error fetching models for Ollama translation settings:", error);
                    dropdown.selectEl.innerHTML = "";
                    dropdown.addOption("", "Error loading models!");
                    dropdown.setValue("");
                }
                finally {
                    dropdown.setDisabled(false);
                    button === null || button === void 0 ? void 0 : button.setDisabled(false).setIcon("refresh-cw");
                }
            });
            new Setting(containerEl)
                .setName("Ollama Translation Model")
                .setDesc("Ollama model to use for translation tasks.")
                .addDropdown((dropdown) => __awaiter(this, void 0, void 0, function* () {
                ollamaTranslationModelDropdown = dropdown;
                dropdown.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.ollamaTranslationModel = value;
                    yield this.plugin.saveSettings();
                }));
                yield updateOllamaTranslationOptions(dropdown); // Initial load
            }))
                .addExtraButton(button => {
                button.setIcon("refresh-cw").setTooltip("Refresh model list")
                    .onClick(() => __awaiter(this, void 0, void 0, function* () { yield updateOllamaTranslationOptions(ollamaTranslationModelDropdown, button); new Notice("Model list refreshed!"); }));
            });
            // Target language for Ollama (може бути той самий, що й для Google, або окремий)
            // Поки що використовуємо спільний translationTargetLanguage
            new Setting(containerEl)
                .setName("Target Translation Language (Ollama)")
                .setDesc("Translate messages/input into this language using Ollama.")
                .addDropdown(dropdown => {
                for (const code in LANGUAGES) {
                    dropdown.addOption(code, LANGUAGES[code]);
                }
                dropdown.setValue(this.plugin.settings.translationTargetLanguage).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.translationTargetLanguage = value;
                    yield this.plugin.saveSettings();
                }));
            });
            // TODO: Можливо, додати поле для "Source Language" для Ollama,
            // або реалізувати автодетектування (що складніше). Поки що припускаємо
            // переклад з мови інтерфейсу або англійської.
        }
        new Setting(containerEl)
            .setName("Google API Key (Speech-to-Text)")
            .setDesc("Required for voice input. Keep confidential.")
            .addText(text => text
            .setPlaceholder("Enter API Key")
            .setValue(this.plugin.settings.googleApiKey)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.googleApiKey = value.trim();
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName("Speech Recognition Language")
            .setDesc("Language for voice input (e.g., en-US, uk-UA).")
            .addDropdown(dropdown => {
            const speechLangs = {
                "uk-UA": "Ukrainian",
                "en-US": "English (US)", /* ... add more if needed ... */
                "en-GB": "English (UK)",
                "es-ES": "Spanish (Spain)",
                // Додайте інші мови за потреби
            };
            for (const code in speechLangs) {
                dropdown.addOption(code, speechLangs[code]);
            }
            dropdown.setValue(this.plugin.settings.speechLanguage).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.speechLanguage = value;
                yield this.plugin.saveSettings();
            }));
        });
        // 4. Technical & Data
        this.createSectionHeader("Technical & Data");
        // Storage & History (переміщено)
        this.createGroupHeader("Storage & History");
        // ... (існуючі налаштування saveMessageHistory, chatHistoryFolderPath, chatExportFolderPath)
        new Setting(containerEl)
            .setName("Save Message History")
            .setDesc("Save chat conversations to files.")
            .addToggle(toggle => toggle.setValue(this.plugin.settings.saveMessageHistory).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.saveMessageHistory = value;
            yield this.plugin.saveSettings();
            this.display();
        })));
        if (this.plugin.settings.saveMessageHistory) {
            new Setting(containerEl)
                .setName("Chat History Folder Path")
                .setDesc('Folder to store chat history (.json files). Use "/" for vault root.')
                .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.chatHistoryFolderPath)
                .setValue(this.plugin.settings.chatHistoryFolderPath)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.chatHistoryFolderPath =
                    value.trim() === "/" ? "/" : normalizePath(value.trim()) || DEFAULT_SETTINGS.chatHistoryFolderPath;
                yield this.plugin.saveSettings();
                this.debouncedUpdateChatPath();
            })));
        }
        new Setting(containerEl)
            .setName("Chat Export Folder Path")
            .setDesc("Default folder for exported Markdown chats.")
            .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.chatExportFolderPath || "Vault Root")
            .setValue(this.plugin.settings.chatExportFolderPath)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.chatExportFolderPath =
                normalizePath(value.trim()) || DEFAULT_SETTINGS.chatExportFolderPath;
            yield this.plugin.saveSettings();
            if (this.plugin.chatManager)
                yield this.plugin.chatManager.ensureFoldersExist();
        })));
        // Logging (переміщено)
        this.createGroupHeader("Logging");
        // ... (існуючі налаштування consoleLogLevel, fileLoggingEnabled, fileLogLevel, logCallerInfo, logFilePath)
        const logLevelOptions = {};
        Object.keys(LogLevel).forEach(key => {
            if (isNaN(Number(key))) { // Filter out numeric enum keys
                logLevelOptions[key] = key;
            }
        });
        new Setting(containerEl)
            .setName("Console Log Level")
            .setDesc("Minimum level for developer console.")
            .addDropdown(dropdown => dropdown
            .addOptions(logLevelOptions)
            .setValue(this.plugin.settings.consoleLogLevel || "INFO")
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.consoleLogLevel = value;
            yield this.plugin.saveSettings();
        })));
        new Setting(containerEl)
            .setName("Enable File Logging")
            .setDesc(`Log to ${this.plugin.logger.getLogFilePath()} (for debugging).`)
            .addToggle(toggle => toggle.setValue(this.plugin.settings.fileLoggingEnabled).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.fileLoggingEnabled = value;
            yield this.plugin.saveSettings();
            this.display();
        })));
        if (this.plugin.settings.fileLoggingEnabled) {
            new Setting(containerEl)
                .setName("File Log Level")
                .setDesc("Minimum level for log file.")
                .addDropdown(dropdown => dropdown
                .addOptions(logLevelOptions)
                .setValue(this.plugin.settings.fileLogLevel || "WARN")
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.fileLogLevel = value;
                yield this.plugin.saveSettings();
            })));
            new Setting(containerEl)
                .setName("Log Caller Method Name")
                .setDesc("Include [MethodName] in logs. May slightly impact performance.")
                .addToggle(toggle => toggle.setValue(this.plugin.settings.logCallerInfo).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.logCallerInfo = value;
                yield this.plugin.saveSettings();
            })));
            // Відображення шляху до файлу логів
            new Setting(containerEl)
                .setName("Log File Path")
                .setDesc("Current location of the log file.")
                .addText(text => text
                .setValue(this.plugin.logger.getLogFilePath())
                .setDisabled(true));
            // Можливо, додати налаштування максимального розміру файлу, якщо логер це підтримує
            new Setting(containerEl)
                .setName("Log File Max Size (MB)")
                .setDesc("Maximum size of the log file before it is rotated.")
                .addText(text => text
                .setPlaceholder(String(DEFAULT_SETTINGS.logFileMaxSizeMB))
                .setValue(String(this.plugin.settings.logFileMaxSizeMB))
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                const num = parseInt(value.trim(), 10);
                this.plugin.settings.logFileMaxSizeMB = !isNaN(num) && num > 0 ? num : DEFAULT_SETTINGS.logFileMaxSizeMB;
                yield this.plugin.saveSettings();
                // Потрібно повідомити логер про зміну розміру, якщо це можливо
            })));
        }
        // --- Кінець НОВОЇ СТРУКТУРИ СЕКЦІЙ ---
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsY0FBYztBQUNkLE9BQU8sRUFFTCxnQkFBZ0IsRUFDaEIsT0FBTyxFQUlQLFFBQVEsRUFHUixNQUFNLEVBQ04sYUFBYSxFQUFFLHFCQUFxQjtFQUNyQyxNQUFNLFVBQVUsQ0FBQztBQUVsQixPQUFPLEVBQUUsUUFBUSxFQUFrQixNQUFNLFVBQVUsQ0FBQyxDQUFDLHdDQUF3QztBQUU3RixlQUFlO0FBQ2YsTUFBTSxDQUFDLE1BQU0sU0FBUyxHQUEyQjtJQUMvQyxFQUFFLEVBQUUsV0FBVztJQUNmLEVBQUUsRUFBRSxVQUFVO0lBQ2QsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsUUFBUTtJQUNaLEVBQUUsRUFBRSxVQUFVO0lBQ2QsRUFBRSxFQUFFLGFBQWE7SUFDakIsRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsWUFBWTtJQUNoQixFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsU0FBUztJQUNiLEdBQUcsRUFBRSxTQUFTO0lBQ2QsRUFBRSxFQUFFLFVBQVU7SUFDZCxPQUFPLEVBQUUsc0JBQXNCO0lBQy9CLE9BQU8sRUFBRSx1QkFBdUI7SUFDaEMsRUFBRSxFQUFFLFVBQVU7SUFDZCxFQUFFLEVBQUUsVUFBVTtJQUNkLEVBQUUsRUFBRSxPQUFPO0lBQ1gsRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsT0FBTztJQUNYLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsVUFBVTtJQUNkLEVBQUUsRUFBRSxVQUFVO0lBQ2QsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsUUFBUTtJQUNaLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLFVBQVU7SUFDZCxFQUFFLEVBQUUsVUFBVTtJQUNkLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLE9BQU87SUFDWCxFQUFFLEVBQUUsVUFBVTtJQUNkLEVBQUUsRUFBRSxnQkFBZ0I7SUFDcEIsRUFBRSxFQUFFLE9BQU87SUFDWCxHQUFHLEVBQUUsVUFBVTtJQUNmLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsT0FBTztJQUNYLEdBQUcsRUFBRSxPQUFPO0lBQ1osRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsV0FBVztJQUNmLEVBQUUsRUFBRSxNQUFNO0lBQ1YsRUFBRSxFQUFFLFlBQVk7SUFDaEIsRUFBRSxFQUFFLE9BQU87SUFDWCxFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxVQUFVO0lBQ2QsRUFBRSxFQUFFLFVBQVU7SUFDZCxFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLE9BQU87SUFDWCxFQUFFLEVBQUUsYUFBYTtJQUNqQixFQUFFLEVBQUUsUUFBUTtJQUNaLEVBQUUsRUFBRSxvQkFBb0I7SUFDeEIsRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsS0FBSztJQUNULEVBQUUsRUFBRSxPQUFPO0lBQ1gsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsWUFBWTtJQUNoQixFQUFFLEVBQUUsZUFBZTtJQUNuQixFQUFFLEVBQUUsWUFBWTtJQUNoQixFQUFFLEVBQUUsVUFBVTtJQUNkLEVBQUUsRUFBRSxPQUFPO0lBQ1gsRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxPQUFPO0lBQ1gsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsV0FBVztJQUNmLEVBQUUsRUFBRSxtQkFBbUI7SUFDdkIsRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsV0FBVztJQUNmLEVBQUUsRUFBRSxjQUFjO0lBQ2xCLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsUUFBUTtJQUNaLEVBQUUsRUFBRSxZQUFZO0lBQ2hCLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLFVBQVU7SUFDZCxFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLGNBQWM7SUFDbEIsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxPQUFPO0lBQ1gsRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsUUFBUTtJQUNaLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLE9BQU87SUFDWCxFQUFFLEVBQUUsT0FBTztJQUNYLEVBQUUsRUFBRSxPQUFPO0lBQ1gsRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsTUFBTTtJQUNWLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsV0FBVztJQUNmLEVBQUUsRUFBRSxNQUFNO0lBQ1YsRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsT0FBTztJQUNYLEVBQUUsRUFBRSxZQUFZO0lBQ2hCLEVBQUUsRUFBRSxPQUFPO0lBQ1gsRUFBRSxFQUFFLE9BQU87SUFDWCxFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxRQUFRO0lBQ1osRUFBRSxFQUFFLE1BQU07Q0FDWCxDQUFDO0FBOEVGLG9DQUFvQztBQUNwQyxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBeUI7SUFDcEQscUJBQXFCO0lBQ3JCLGVBQWUsRUFBRSx3QkFBd0I7SUFDekMsU0FBUyxFQUFFLEVBQUU7SUFDYixXQUFXLEVBQUUsR0FBRztJQUNoQixhQUFhLEVBQUUsSUFBSTtJQUVuQixRQUFRO0lBQ1IsbUJBQW1CLEVBQUUsZ0JBQWdCLEVBQUUsdUNBQXVDO0lBQzlFLGdCQUFnQixFQUFFLEVBQUU7SUFDcEIsVUFBVSxFQUFFLElBQUk7SUFFaEIsb0JBQW9CO0lBQ3BCLGtCQUFrQixFQUFFLElBQUk7SUFDeEIscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQUUsdUNBQXVDO0lBQ2hGLG9CQUFvQixFQUFFLGtCQUFrQixFQUFFLHVDQUF1QztJQUVqRixnQkFBZ0I7SUFDaEIsYUFBYSxFQUFFLEtBQUs7SUFDcEIsZ0JBQWdCLEVBQUUsR0FBRztJQUNyQixZQUFZLEVBQUUsU0FBUyxFQUFFLDJEQUEyRDtJQUVwRixhQUFhO0lBQ2IsY0FBYyxFQUFFLFVBQVU7SUFDMUIsaUJBQWlCLEVBQUUsR0FBRztJQUN0QixZQUFZLEVBQUUsTUFBTTtJQUNwQixlQUFlLEVBQUUsS0FBSztJQUN0QixlQUFlLEVBQUUsSUFBSTtJQUVyQixNQUFNO0lBQ04sVUFBVSxFQUFFLEtBQUs7SUFDakIsYUFBYSxFQUFFLGNBQWMsRUFBRSx1Q0FBdUM7SUFDdEUsdUJBQXVCLEVBQUUsSUFBSTtJQUM3QixpQkFBaUIsRUFBRSxrQkFBa0IsRUFBRSxtQ0FBbUM7SUFDMUUsWUFBWSxFQUFFLEdBQUc7SUFDakIsc0JBQXNCLEVBQUUsR0FBRztJQUMzQixPQUFPLEVBQUUsQ0FBQztJQUNWLGNBQWMsRUFBRSxJQUFJO0lBQ3BCLHFCQUFxQixFQUFFLElBQUk7SUFFM0IsZUFBZTtJQUNmLDBCQUEwQixFQUFFLEtBQUs7SUFDakMsaUJBQWlCLEVBQUUsZ0JBQWdCO0lBRW5DLDhDQUE4QztJQUM5QywwQkFBMEIsRUFBRSxLQUFLO0lBQ2pDLG1CQUFtQixFQUFFLEtBQUs7SUFDMUIsbUJBQW1CLEVBQUUsd0ZBQXdGO0lBQzdHLDhCQUE4QixFQUFFLEVBQUU7SUFDbEMsc0JBQXNCLEVBQUUsSUFBSTtJQUM1QixzQkFBc0IsRUFBRSxFQUFFLEVBQUUscUNBQXFDO0lBQ2pFLDhCQUE4QixFQUFFLFdBQVcsRUFBRSwwQkFBMEI7SUFFdkUsdUJBQXVCO0lBQ3ZCLFlBQVksRUFBRSxFQUFFLEVBQUUsaUJBQWlCO0lBQ25DLGNBQWMsRUFBRSxPQUFPLEVBQUUsWUFBWTtJQUNyQyxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsMERBQTBEO0lBQ3BGLHlCQUF5QixFQUFFLElBQUksRUFBRSxZQUFZO0lBQzdDLHVCQUF1QixFQUFFLEVBQUUsRUFBRSxtQkFBbUI7SUFDaEQsbUJBQW1CLEVBQUUsTUFBTSxFQUFFLDRCQUE0QjtJQUN6RCxzQkFBc0IsRUFBRSxFQUFFLEVBQUUscUJBQXFCO0lBRWpELGVBQWU7SUFDZixhQUFhLEVBQUUsSUFBSTtJQUVuQixzRUFBc0U7SUFDdEUsb0JBQW9CLEVBQUUsNkJBQTZCLEVBQUUsZUFBZTtJQUNwRSxzQkFBc0IsRUFBRSxNQUFNLEVBQUUsbUNBQW1DO0lBRWpFLGtCQUFrQjtJQUNsQixlQUFlLEVBQUUsTUFBTTtJQUN2QixrQkFBa0IsRUFBRSxLQUFLO0lBQ3pCLFlBQVksRUFBRSxNQUFNO0lBQ3BCLGFBQWEsRUFBRSxLQUFLO0lBQ3BCLFdBQVcsRUFBRSxFQUFFLEVBQUUsOENBQThDO0lBQy9ELGdCQUFnQixFQUFFLENBQUM7Q0FFdEIsQ0FBQztBQUVGLG1DQUFtQztBQUNuQyxNQUFNLE9BQU8sZ0JBQWlCLFNBQVEsZ0JBQWdCO0lBTXBELFlBQVksR0FBUSxFQUFFLE1BQW9CO1FBQ3RDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFFckIsdURBQXVEO1FBQ3RELElBQUksQ0FBQyx1QkFBdUIsR0FBRyxRQUFRLENBQUMsR0FBUyxFQUFFO1lBQy9DLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO1lBQ3hGLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMscUJBQXFCLEVBQUUsQ0FBQztnQkFDaEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ3ZELENBQUM7UUFDTCxDQUFDLENBQUEsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFZixJQUFJLENBQUMsdUJBQXVCLEdBQUcsUUFBUSxDQUFDLEdBQVMsRUFBRTtZQUMvQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsdURBQXVELENBQUMsQ0FBQztZQUNsRixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxNQUF1QixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN4RCxDQUFDLENBQUEsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFZixJQUFJLENBQUMsc0JBQXNCLEdBQUcsUUFBUSxDQUFDLEdBQVMsRUFBRTtZQUM5QyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0RBQWtELENBQUMsQ0FBQztZQUM3RSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUM1RCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ2xELENBQUM7UUFDTCxDQUFDLENBQUEsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDcEIsQ0FBQztJQUVELG9EQUFvRDtJQUM1QyxtQkFBbUIsQ0FBQyxJQUFZO1FBQ3BDLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDbkYsQ0FBQztJQUVELDBEQUEwRDtJQUNqRCxpQkFBaUIsQ0FBQyxJQUFZO1FBQ2xDLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxDQUFDLENBQUM7SUFDekYsQ0FBQztJQUdGLE9BQU87UUFDSCxNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzdCLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwQixXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUM7UUFFMUQsZ0NBQWdDO1FBRWhDLGFBQWE7UUFDYixJQUFJLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFcEMsMkNBQTJDO1FBQzNDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQ3RELG1HQUFtRztRQUNuRyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDbkIsT0FBTyxDQUFDLG1CQUFtQixDQUFDO2FBQzVCLE9BQU8sQ0FBQyxtR0FBbUcsQ0FBQzthQUM1RyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2FBQ2hCLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUM7YUFDaEQsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQzthQUM5QyxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtZQUN0QixJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDdkIsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO2dCQUNuRSxHQUFHLEdBQUcsU0FBUyxHQUFHLEdBQUcsQ0FBQztZQUMxQixDQUFDO1lBQ0QsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BCLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNCLENBQUM7WUFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsR0FBRyxJQUFJLGdCQUFnQixDQUFDLGVBQWUsQ0FBQztZQUMvRSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBRVosSUFBSSxhQUFhLEdBQTZCLElBQUksQ0FBQztRQUNuRCxNQUFNLGFBQWEsR0FBRyxDQUFPLFFBQWtDLEVBQUUsTUFBNkIsRUFBRSxFQUFFO1lBQzlGLElBQUksQ0FBQyxRQUFRO2dCQUFFLE9BQU87WUFDdEIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDO1lBQ2xELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztZQUNqQyxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1lBQzVDLFFBQVEsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDM0IsTUFBTSxhQUFOLE1BQU0sdUJBQU4sTUFBTSxDQUFFLFdBQVcsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzVDLElBQUksQ0FBQztnQkFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUMzRCxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7Z0JBQ2pDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLDRCQUE0QixDQUFDLENBQUM7Z0JBQ3JELElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQzlCLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUU7d0JBQ3ZCLFFBQVEsQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO29CQUM3QyxDQUFDLENBQUMsQ0FBQztvQkFDSCxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3JFLENBQUM7cUJBQU0sQ0FBQztvQkFDSixRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO29CQUMxQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMxQixDQUFDO1lBQ0wsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHFDQUFxQyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUN2RSxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7Z0JBQ2pDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLHVCQUF1QixDQUFDLENBQUM7Z0JBQ2hELFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDMUIsQ0FBQztvQkFBUyxDQUFDO2dCQUNQLFFBQVEsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzVCLE1BQU0sYUFBTixNQUFNLHVCQUFOLE1BQU0sQ0FBRSxXQUFXLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNyRCxDQUFDO1FBQ0wsQ0FBQyxDQUFBLENBQUM7UUFFRixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDbkIsT0FBTyxDQUFDLG9CQUFvQixDQUFDO2FBQzdCLE9BQU8sQ0FBQyx5Q0FBeUMsQ0FBQzthQUNsRCxXQUFXLENBQUMsQ0FBTyxRQUFRLEVBQUUsRUFBRTtZQUM1QixhQUFhLEdBQUcsUUFBUSxDQUFDO1lBQ3pCLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtnQkFDOUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztnQkFDdkMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3JDLENBQUMsQ0FBQSxDQUFDLENBQUM7WUFDSCxNQUFNLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLHlCQUF5QjtRQUM1RCxDQUFDLENBQUEsQ0FBQzthQUNELGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNyQixNQUFNO2lCQUNELE9BQU8sQ0FBQyxZQUFZLENBQUM7aUJBQ3JCLFVBQVUsQ0FBQyxvQkFBb0IsQ0FBQztpQkFDaEMsT0FBTyxDQUFDLEdBQVMsRUFBRTtnQkFDaEIsTUFBTSxhQUFhLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUMzQyxJQUFJLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1lBQ3hDLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztRQUVQLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNuQixPQUFPLENBQUMscUJBQXFCLENBQUM7YUFDOUIsT0FBTyxDQUFDLDZEQUE2RCxDQUFDO2FBQ3RFLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU07YUFDdEIsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDO2FBQ3BCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7YUFDMUMsaUJBQWlCLEVBQUU7YUFDbkIsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7WUFDdEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztZQUN6QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBRVosSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ25CLE9BQU8sQ0FBQyw4QkFBOEIsQ0FBQzthQUN2QyxPQUFPLENBQUMsdUZBQXVGLENBQUM7YUFDaEcsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTthQUNoQixjQUFjLENBQUMsZ0JBQWdCLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUFDO2FBQ3pELFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxFQUFFLENBQUM7YUFDdkQsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7WUFDdEIsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN2QyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUM7WUFDbkcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3JDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUVaLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNuQixPQUFPLENBQUMsZ0NBQWdDLENBQUM7YUFDekMsT0FBTyxDQUFDLHVJQUF1SSxDQUFDO2FBQ2hKLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDO2FBQ25FLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUM7WUFDM0MsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2pDLHlFQUF5RTtRQUM3RSxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7UUFHWiw2QkFBNkI7UUFDN0IsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3hDLDRFQUE0RTtRQUM1RSxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDbkIsT0FBTyxDQUFDLHVCQUF1QixDQUFDO2FBQ2hDLE9BQU8sQ0FBQyx5REFBeUQsQ0FBQzthQUNsRSxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQzlGLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUM7WUFDM0MsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2pDLElBQUksTUFBTSxDQUFDLDhEQUE4RCxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JGLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUVSLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNuQixPQUFPLENBQUMsNkJBQTZCLENBQUM7YUFDdEMsT0FBTyxDQUFDLHdEQUF3RCxDQUFDO2FBQ2pFLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7YUFDaEIsY0FBYyxDQUFDLGNBQWMsQ0FBQzthQUM5QixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLENBQUM7YUFDMUQsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7O1lBQ3RCLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDdkMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQztZQUMxRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDakMsTUFBQSxNQUFBLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSwwQ0FBRSw2QkFBNkIsa0RBQUksQ0FBQztRQUN4RCxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7UUFDWixtRUFBbUU7UUFHbkUsMEJBQTBCO1FBQzFCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNyQyxtRUFBbUU7UUFDbkUsY0FBYztRQUNkLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVE7YUFDakYsU0FBUyxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUM7YUFDakMsU0FBUyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7YUFDekIsU0FBUyxDQUFDLE9BQU8sRUFBRSxvQkFBb0IsQ0FBQzthQUN4QyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDO2FBQzdDLFFBQVEsQ0FBQyxDQUFPLEtBQWlCLEVBQUUsRUFBRTtZQUNsQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO1lBQzVDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyw0QkFBNEI7UUFDaEQsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBQ1IsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQywrQkFBK0I7UUFDaEcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ3hFLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ3JELGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDbkUsaUJBQWlCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO2dCQUM3RyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQztnQkFDNUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3JDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUNSLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUN4RCxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUMsT0FBTyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7WUFDdEYsaUJBQWlCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTtpQkFDakMsY0FBYyxDQUFDLE1BQU0sQ0FBQztpQkFDdEIsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDO2lCQUNoRCxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtnQkFDdEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQztnQkFDaEUsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3JDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUNaLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUN6RCxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsd0JBQXdCLENBQUMsQ0FBQztZQUNwRCxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsK0RBQStELENBQUMsQ0FBQztZQUMzRixpQkFBaUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2lCQUNqQyxjQUFjLENBQUMsOEJBQThCLENBQUM7aUJBQzlDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQztpQkFDaEQsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7Z0JBQ3RCLE1BQU0sY0FBYyxHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDbkQsSUFBSSxjQUFjLEtBQUssRUFBRSxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO29CQUNyRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsR0FBRyxjQUFjLENBQUM7Z0JBQzVELENBQUM7cUJBQU0sQ0FBQztvQkFDSixJQUFJLE1BQU0sQ0FBQyxrRkFBa0YsQ0FBQyxDQUFDO29CQUMvRixJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUM7b0JBQ3RELE9BQU87Z0JBQ1gsQ0FBQztnQkFDRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBQ1osQ0FBQztRQUVELFlBQVk7UUFDWixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxRQUFRO2FBQy9FLFNBQVMsQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDO2FBQ2pDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDO2FBQ3pCLFNBQVMsQ0FBQyxPQUFPLEVBQUUsb0JBQW9CLENBQUM7YUFDeEMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQzthQUMzQyxRQUFRLENBQUMsQ0FBTyxLQUFpQixFQUFFLEVBQUU7WUFDbEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxHQUFHLEtBQUssQ0FBQztZQUMxQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25CLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUNSLE1BQU0sZUFBZSxHQUFHLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5RCxlQUFlLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ3RFLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQ25ELGVBQWUsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQy9ELGVBQWUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO2dCQUN6RyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksZ0JBQWdCLENBQUMsZUFBZSxDQUFDO2dCQUN4RyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBQ1IsQ0FBQzthQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ3RELGVBQWUsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsT0FBTyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7WUFDakYsZUFBZSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7aUJBQy9CLGNBQWMsQ0FBQyxLQUFLLENBQUM7aUJBQ3JCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7aUJBQzlDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO2dCQUN0QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEtBQUssQ0FBQztnQkFDN0QsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3JDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUNaLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUN2RCxlQUFlLENBQUMsT0FBTyxDQUFDLHNCQUFzQixDQUFDLENBQUM7WUFDaEQsZUFBZSxDQUFDLE9BQU8sQ0FBQywrREFBK0QsQ0FBQyxDQUFDO1lBQ3pGLGVBQWUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2lCQUMvQixjQUFjLENBQUMsNEJBQTRCLENBQUM7aUJBQzVDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7aUJBQzlDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO2dCQUN0QixNQUFNLGNBQWMsR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQ25ELElBQUksY0FBYyxLQUFLLEVBQUUsSUFBSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztvQkFDckUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLGNBQWMsQ0FBQztnQkFDMUQsQ0FBQztxQkFBTSxDQUFDO29CQUNKLElBQUksTUFBTSxDQUFDLGtGQUFrRixDQUFDLENBQUM7b0JBQy9GLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUM7b0JBQ3BELE9BQU87Z0JBQ1gsQ0FBQztnQkFDRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBQ1osQ0FBQztRQUVELElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNuQixPQUFPLENBQUMsbUJBQW1CLENBQUM7YUFDNUIsT0FBTyxDQUFDLHFFQUFxRSxDQUFDO2FBQzlFLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQU0sS0FBSyxFQUFDLEVBQUU7WUFDOUYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQztZQUM3QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBR1IseUJBQXlCO1FBQ3pCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBRWhELGdDQUFnQztRQUNoQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMzQyw2REFBNkQ7UUFDN0QsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ25CLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQzthQUNuQyxPQUFPLENBQUMsc0NBQXNDLENBQUM7YUFDL0MsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTthQUNoQixjQUFjLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7YUFDcEQsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO2FBQ2xELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQjtnQkFDcEMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLG1CQUFtQixDQUFDO1lBQ3hFLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUNuQyxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7UUFFWixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDbkIsT0FBTyxDQUFDLDRCQUE0QixDQUFDO2FBQ3JDLE9BQU8sQ0FBQyxnREFBZ0QsQ0FBQzthQUN6RCxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQzNGLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7WUFDeEMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3JDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUdSLG9EQUFvRDtRQUNwRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsc0NBQXNDLENBQUMsQ0FBQztRQUMvRCxpQ0FBaUM7UUFDakMsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ25CLE9BQU8sQ0FBQyxZQUFZLENBQUM7YUFDckIsT0FBTyxDQUFDLCtDQUErQyxDQUFDO2FBQ3hELFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7WUFDM0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxHQUFHLEtBQUssQ0FBQztZQUN4QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2YsSUFBSSxLQUFLO2dCQUFFLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQzdDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUNSLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDbEMsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2lCQUNuQixPQUFPLENBQUMsMkJBQTJCLENBQUM7aUJBQ3BDLE9BQU8sQ0FBQyw0QkFBNEIsQ0FBQztpQkFDckMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTtpQkFDaEIsY0FBYyxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQztpQkFDOUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQztpQkFDNUMsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7O2dCQUN0QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLGFBQWEsQ0FBQztnQkFDbkcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztnQkFDOUIsTUFBQSxNQUFBLElBQUksQ0FBQyxNQUFNLEVBQUMsdUJBQXVCLGtEQUFJLENBQUMsQ0FBQyxrRUFBa0U7Z0JBQzNHLE1BQUEsTUFBQSxJQUFJLENBQUMsTUFBTSxFQUFDLDBCQUEwQixrREFBSSxDQUFDLENBQUMsMkJBQTJCO1lBQzNFLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztZQUVaLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQztpQkFDbkIsT0FBTyxDQUFDLHdCQUF3QixDQUFDO2lCQUNqQyxPQUFPLENBQUMsOERBQThELENBQUM7aUJBQ3ZFLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtnQkFDeEcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEdBQUcsS0FBSyxDQUFDO2dCQUNyRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ2pDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDZixJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUNsQyxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7WUFFUixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLENBQUM7Z0JBQy9DLElBQUksaUJBQWlCLEdBQTZCLElBQUksQ0FBQztnQkFDdkQsTUFBTSxzQkFBc0IsR0FBRyxDQUFPLFFBQWtDLEVBQUUsTUFBNkIsRUFBRSxFQUFFO29CQUN2RyxJQUFJLENBQUMsUUFBUTt3QkFBRSxPQUFPO29CQUN0QixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQztvQkFDN0QsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO29CQUNqQyxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO29CQUM1QyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUMzQixNQUFNLGFBQU4sTUFBTSx1QkFBTixNQUFNLENBQUUsV0FBVyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQzVDLElBQUksQ0FBQzt3QkFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxDQUFDO3dCQUMzRCxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7d0JBQ2pDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLDhCQUE4QixDQUFDLENBQUM7d0JBQ3ZELE1BQU0saUJBQWlCLEdBQUc7NEJBQ3JCLGtCQUFrQjs0QkFDbEIsWUFBWTs0QkFDWixtQkFBbUI7NEJBQ25CLGFBQWE7NEJBQ2IsVUFBVTt5QkFDZCxDQUFDO3dCQUNGLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7d0JBQ2pGLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLGdDQUFnQyxDQUFDLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUM5RSxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDOzRCQUM5QixNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO2dDQUN2QixJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7b0NBQ3pDLFFBQVEsQ0FBQyxTQUFTLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dDQUM3QyxDQUFDOzRCQUNMLENBQUMsQ0FBQyxDQUFDO3dCQUNQLENBQUM7d0JBQ0QsUUFBUSxDQUFDLFFBQVEsQ0FDWixNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQzdHLENBQUM7b0JBQ04sQ0FBQztvQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO3dCQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0NBQStDLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQ3RFLFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQzt3QkFDakMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsdUJBQXVCLENBQUMsQ0FBQzt3QkFDaEQsUUFBUSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFDckMsQ0FBQzs0QkFBUyxDQUFDO3dCQUNQLFFBQVEsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQzVCLE1BQU0sYUFBTixNQUFNLHVCQUFOLE1BQU0sQ0FBRSxXQUFXLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFDckQsQ0FBQztnQkFDTCxDQUFDLENBQUEsQ0FBQztnQkFDRixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7cUJBQ25CLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQztxQkFDL0IsT0FBTyxDQUFDLDhCQUE4QixDQUFDO3FCQUN2QyxRQUFRLENBQUMsZ0NBQWdDLENBQUM7cUJBQzFDLFdBQVcsQ0FBQyxDQUFPLFFBQVEsRUFBRSxFQUFFO29CQUM1QixpQkFBaUIsR0FBRyxRQUFRLENBQUM7b0JBQzdCLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTt3QkFDOUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO3dCQUMvQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7d0JBQ2pDLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO29CQUNsQyxDQUFDLENBQUEsQ0FBQyxDQUFDO29CQUNILE1BQU0sc0JBQXNCLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzNDLENBQUMsQ0FBQSxDQUFDO3FCQUNELGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRTtvQkFDckIsTUFBTTt5QkFDRCxPQUFPLENBQUMsWUFBWSxDQUFDO3lCQUNyQixVQUFVLENBQUMsb0JBQW9CLENBQUM7eUJBQ2hDLE9BQU8sQ0FBQyxHQUFTLEVBQUU7d0JBQ2hCLE1BQU0sc0JBQXNCLENBQUMsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLENBQUM7d0JBQ3hELElBQUksTUFBTSxDQUFDLHVCQUF1QixDQUFDLENBQUM7b0JBQ3hDLENBQUMsQ0FBQSxDQUFDLENBQUM7Z0JBQ1gsQ0FBQyxDQUFDLENBQUM7Z0JBRVAsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO3FCQUNuQixPQUFPLENBQUMseUJBQXlCLENBQUM7cUJBQ2xDLE9BQU8sQ0FBQyxtQ0FBbUMsQ0FBQztxQkFDNUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTtxQkFDaEIsY0FBYyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztxQkFDckQsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQztxQkFDbkQsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7b0JBQ3RCLE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQ3ZDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQztvQkFDbEcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO29CQUNqQyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztnQkFDbEMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO2dCQUVaLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQztxQkFDbkIsT0FBTyxDQUFDLHNCQUFzQixDQUFDO3FCQUMvQixPQUFPLENBQUMsNERBQTRELENBQUM7cUJBQ3JFLFNBQVMsQ0FBQyxDQUFDLE1BQXVCLEVBQUUsRUFBRSxDQUFDLE1BQU07cUJBQ3pDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQztxQkFDckIsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDO3FCQUNyRCxpQkFBaUIsRUFBRTtxQkFDbkIsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7b0JBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixHQUFHLEtBQUssQ0FBQztvQkFDcEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNyQyxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7Z0JBRVosSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO3FCQUNuQixPQUFPLENBQUMsZUFBZSxDQUFDO3FCQUN4QixPQUFPLENBQUMsNENBQTRDLENBQUM7cUJBQ3JELE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7cUJBQ2hCLGNBQWMsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUM7cUJBQ2hELFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7cUJBQzlDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO29CQUN0QixNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUN2QyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUM7b0JBQ3ZGLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1lBQ2hCLENBQUM7WUFFRCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7aUJBQ25CLE9BQU8sQ0FBQywrQ0FBK0MsQ0FBQztpQkFDeEQsT0FBTyxDQUFDLHFGQUFxRixDQUFDO2lCQUM5RixPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2lCQUNoQixjQUFjLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxDQUFDO2lCQUN2RCxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDO2lCQUNyRCxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtnQkFDdEIsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDdkMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsY0FBYyxDQUFDO2dCQUN0RyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBQ2hCLENBQUM7UUFFRCxjQUFjO1FBQ2QsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRXJDLDJEQUEyRDtRQUMzRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsNkNBQTZDLENBQUMsQ0FBQztRQUN0RSx3R0FBd0c7UUFDeEcsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ25CLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQzthQUN4QyxPQUFPLENBQUMsa0ZBQWtGLENBQUM7YUFDM0YsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQzNHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDBCQUEwQixHQUFHLEtBQUssQ0FBQztZQUN4RCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsd0RBQXdEO1FBQzVFLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUNSLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztZQUNsRCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7aUJBQ25CLE9BQU8sQ0FBQyw4QkFBOEIsQ0FBQztpQkFDdkMsT0FBTyxDQUFDLDBEQUEwRCxDQUFDO2lCQUNuRSxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDLENBQUMsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7Z0JBQ3BHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztnQkFDakQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxnQ0FBZ0M7WUFDcEQsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1lBQ1IsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO2dCQUMzQyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7cUJBQ25CLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQztxQkFDL0IsT0FBTyxDQUFDLHFFQUFxRSxDQUFDO3FCQUM5RSxXQUFXLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO3FCQUNwQixjQUFjLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7cUJBQ3BELFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztxQkFDbEQsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7b0JBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixHQUFHLEtBQUssSUFBSSxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQztvQkFDekYsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNyQyxDQUFDLENBQUEsQ0FBQztxQkFDRCxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFFeEMsdUNBQXVDO2dCQUN2QyxJQUFJLDBCQUEwQixHQUE2QixJQUFJLENBQUM7Z0JBQ2hFLE1BQU0sMEJBQTBCLEdBQUcsQ0FBTyxRQUFrQyxFQUFFLE1BQTZCLEVBQUUsRUFBRTtvQkFDM0csSUFBSSxDQUFDLFFBQVE7d0JBQUUsT0FBTztvQkFDdEIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUM7b0JBQy9ELFFBQVEsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztvQkFDakMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztvQkFDNUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDM0IsTUFBTSxhQUFOLE1BQU0sdUJBQU4sTUFBTSxDQUFFLFdBQVcsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUM1QyxJQUFJLENBQUM7d0JBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQzt3QkFDM0QsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO3dCQUNqQyxRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxrQ0FBa0MsQ0FBQyxDQUFDO3dCQUMzRCxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDOzRCQUM5QixNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO2dDQUN2QixRQUFRLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQzs0QkFDN0MsQ0FBQyxDQUFDLENBQUM7NEJBQ0gsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUNyRSxDQUFDOzZCQUFNLENBQUM7NEJBQ0osUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsaUJBQWlCLENBQUMsQ0FBQzs0QkFDMUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDMUIsQ0FBQztvQkFDTCxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLG1EQUFtRCxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUNyRixRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7d0JBQ2pDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLHVCQUF1QixDQUFDLENBQUM7d0JBQ2hELFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQzFCLENBQUM7NEJBQVMsQ0FBQzt3QkFDUCxRQUFRLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUM1QixNQUFNLGFBQU4sTUFBTSx1QkFBTixNQUFNLENBQUUsV0FBVyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7b0JBQ3JELENBQUM7Z0JBQ0wsQ0FBQyxDQUFBLENBQUM7Z0JBQ0YsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO3FCQUNuQixPQUFPLENBQUMscUJBQXFCLENBQUM7cUJBQzlCLE9BQU8sQ0FBQyxrRUFBa0UsQ0FBQztxQkFDM0UsV0FBVyxDQUFDLENBQU8sUUFBUSxFQUFFLEVBQUU7b0JBQzVCLDBCQUEwQixHQUFHLFFBQVEsQ0FBQztvQkFDdEMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO3dCQUM5QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsR0FBRyxLQUFLLENBQUM7d0JBQ3BELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztvQkFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQztvQkFDSCxNQUFNLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsZUFBZTtnQkFDL0QsQ0FBQyxDQUFBLENBQUM7cUJBQ0QsY0FBYyxDQUFDLE1BQU0sQ0FBQyxFQUFFO29CQUNyQixNQUFNLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxvQkFBb0IsQ0FBQzt5QkFDeEQsT0FBTyxDQUFDLEdBQVMsRUFBRSxnREFBRyxNQUFNLDBCQUEwQixDQUFDLDBCQUEwQixFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDLENBQUM7Z0JBQzdJLENBQUMsQ0FBQyxDQUFDO2dCQUVQLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQztxQkFDbkIsT0FBTyxDQUFDLHFDQUFxQyxDQUFDO3FCQUM5QyxPQUFPLENBQUMsd0RBQXdELENBQUM7cUJBQ2pFLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7cUJBQ2hCLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyw4QkFBOEIsQ0FBQyxRQUFRLEVBQUUsQ0FBQztxQkFDMUUsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDhCQUE4QixDQUFDLFFBQVEsRUFBRSxDQUFDO3FCQUN4RSxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtvQkFDdEIsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDdkMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsOEJBQThCO3dCQUMvQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLDhCQUE4QixDQUFDO29CQUNwRixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ3JDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztnQkFFWixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7cUJBQ25CLE9BQU8sQ0FBQyw4QkFBOEIsQ0FBQztxQkFDdkMsT0FBTyxDQUFDLGlIQUFpSCxDQUFDO3FCQUMxSCxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO3FCQUNoQixjQUFjLENBQUMsZ0NBQWdDLENBQUM7cUJBQ2hELFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsQ0FBQztxQkFDN0QsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7b0JBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDhCQUE4QixHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDbkUsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNyQyxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO3FCQUNuQixPQUFPLENBQUMsbUNBQW1DLENBQUM7cUJBQzVDLE9BQU8sQ0FBQyxvRUFBb0UsQ0FBQztxQkFDN0UsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTtxQkFDaEIsY0FBYyxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDLFFBQVEsRUFBRSxDQUFDO3FCQUNsRSxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsc0JBQXNCLENBQUMsUUFBUSxFQUFFLENBQUM7cUJBQ2hFLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO29CQUN0QixNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUN2QyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0I7d0JBQ3ZDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7b0JBQzdFLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1lBQ2hCLENBQUM7UUFDTCxDQUFDO1FBRUQsK0NBQStDO1FBQy9DLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQzFELDJFQUEyRTtRQUMzRSxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDbkIsT0FBTyxDQUFDLDhCQUE4QixDQUFDO2FBQ3ZDLE9BQU8sQ0FBQyxrQ0FBa0MsQ0FBQzthQUMzQyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDBCQUEwQixDQUFDLENBQUMsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7O1lBQzNHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDBCQUEwQixHQUFHLEtBQUssQ0FBQztZQUN4RCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2YsTUFBQSxNQUFBLElBQUksQ0FBQyxNQUFNLEVBQUMsdUJBQXVCLGtEQUFJLENBQUM7WUFDeEMsTUFBQSxNQUFBLElBQUksQ0FBQyxNQUFNLEVBQUMsMEJBQTBCLGtEQUFJLENBQUM7UUFDL0MsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBQ1IsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxDQUFDO1lBQ2xELElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQztpQkFDbkIsT0FBTyxDQUFDLHNCQUFzQixDQUFDO2lCQUMvQixPQUFPLENBQUMsc0RBQXNELENBQUM7aUJBQy9ELE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7aUJBQ2hCLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQztpQkFDbEQsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDO2lCQUNoRCxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTs7Z0JBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQztnQkFDNUYsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNqQyxNQUFBLE1BQUEsSUFBSSxDQUFDLE1BQU0sRUFBQyx1QkFBdUIsa0RBQUksQ0FBQztnQkFDeEMsTUFBQSxNQUFBLElBQUksQ0FBQyxNQUFNLEVBQUMsMEJBQTBCLGtEQUFJLENBQUM7WUFDL0MsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBQ2hCLENBQUM7UUFFQSx1Q0FBdUM7UUFDeEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDakQsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ2xCLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQzthQUNqQyxPQUFPLENBQUMsc0ZBQXNGLENBQUM7YUFDL0YsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTthQUNoQixjQUFjLENBQUMsNkJBQTZCLENBQUM7YUFDN0MsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDO2FBQ25ELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN6RCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDakMsaUdBQWlHO1FBQ3JHLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUNaLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNuQixPQUFPLENBQUMsa0JBQWtCLENBQUM7YUFDM0IsT0FBTyxDQUFDLCtFQUErRSxDQUFDO2FBQ3hGLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7YUFDaEIsY0FBYyxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDO2FBQ3ZELFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQzthQUNyRCxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtZQUN0QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDM0QsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2pDLDRDQUE0QztRQUNoRCxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7UUFHYixvQ0FBb0M7UUFDcEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDL0MsZ0lBQWdJO1FBRWhJLDBEQUEwRDtRQUMxRCxnSkFBZ0o7UUFFaEosSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ25CLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQzthQUMvQixPQUFPLENBQUMsdURBQXVELENBQUM7YUFDaEUsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsUUFBUTthQUM1QixTQUFTLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQzthQUM3QixTQUFTLENBQUMsUUFBUSxFQUFFLHNCQUFzQixDQUFDO2FBQzNDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsc0JBQXNCLENBQUM7YUFDM0MsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixDQUFDO2FBQ2xELFFBQVEsQ0FBQyxDQUFPLEtBQTBCLEVBQUUsRUFBRTtZQUMzQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLENBQUM7WUFDakQsZ0dBQWdHO1lBQy9GLHlEQUF5RDtZQUMxRCxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLEtBQUssTUFBTSxDQUFDLENBQUMsOEJBQThCO1lBQ3pGLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNqQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxnRUFBZ0U7UUFDcEYsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBRVosbURBQW1EO1FBQ25ELElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDeEQsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2lCQUNuQixPQUFPLENBQUMsc0NBQXNDLENBQUM7aUJBQy9DLE9BQU8sQ0FBQywyREFBMkQsQ0FBQztpQkFDcEUsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUNwQixLQUFLLE1BQU0sSUFBSSxJQUFJLFNBQVMsRUFBRSxDQUFDO29CQUMzQixRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDOUMsQ0FBQztnQkFDRCxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHlCQUF5QixDQUFDLENBQUMsUUFBUSxDQUFDLENBQU0sS0FBSyxFQUFDLEVBQUU7b0JBQ3JGLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHlCQUF5QixHQUFHLEtBQUssQ0FBQztvQkFDdkQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNyQyxDQUFDLENBQUEsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUM7WUFDUCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7aUJBQ25CLE9BQU8sQ0FBQyxrQ0FBa0MsQ0FBQztpQkFDM0MsT0FBTyxDQUFDLDZEQUE2RCxDQUFDO2lCQUN0RSxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2lCQUNoQixjQUFjLENBQUMsZUFBZSxDQUFDO2lCQUMvQixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7aUJBQ3RELFFBQVEsQ0FBQyxDQUFNLEtBQUssRUFBQyxFQUFFO2dCQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzVELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNyQyxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7UUFDaEIsQ0FBQztRQUVELHlDQUF5QztRQUN6QyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3ZELElBQUksOEJBQThCLEdBQTZCLElBQUksQ0FBQztZQUNwRSxNQUFNLDhCQUE4QixHQUFHLENBQU8sUUFBa0MsRUFBRSxNQUE2QixFQUFFLEVBQUU7Z0JBQy9HLElBQUksQ0FBQyxRQUFRO29CQUFFLE9BQU87Z0JBQ3RCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDO2dCQUMvRCxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7Z0JBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztnQkFBQyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMxRyxNQUFNLGFBQU4sTUFBTSx1QkFBTixNQUFNLENBQUUsV0FBVyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzVDLElBQUksQ0FBQztvQkFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUMzRCxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7b0JBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztvQkFDbEcsSUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDOUIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzlDLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDckUsQ0FBQzt5QkFBTSxDQUFDO3dCQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLGlCQUFpQixDQUFDLENBQUM7d0JBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFBQyxDQUFDO2dCQUNoRixDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUMsQ0FBQyw2QkFBNkI7b0JBQzNDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyx3REFBd0QsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDMUYsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO29CQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLHVCQUF1QixDQUFDLENBQUM7b0JBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDN0csQ0FBQzt3QkFBUyxDQUFDO29CQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQUMsTUFBTSxhQUFOLE1BQU0sdUJBQU4sTUFBTSxDQUFFLFdBQVcsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUFDLENBQUM7WUFDaEcsQ0FBQyxDQUFBLENBQUM7WUFFRixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7aUJBQ25CLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQztpQkFDbkMsT0FBTyxDQUFDLDRDQUE0QyxDQUFDO2lCQUNyRCxXQUFXLENBQUMsQ0FBTyxRQUFRLEVBQUUsRUFBRTtnQkFDNUIsOEJBQThCLEdBQUcsUUFBUSxDQUFDO2dCQUMxQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7b0JBQzlCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixHQUFHLEtBQUssQ0FBQztvQkFDcEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNyQyxDQUFDLENBQUEsQ0FBQyxDQUFDO2dCQUNILE1BQU0sOEJBQThCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxlQUFlO1lBQ25FLENBQUMsQ0FBQSxDQUFDO2lCQUNELGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDckIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxVQUFVLENBQUMsb0JBQW9CLENBQUM7cUJBQ3hELE9BQU8sQ0FBQyxHQUFTLEVBQUUsZ0RBQUcsTUFBTSw4QkFBOEIsQ0FBQyw4QkFBOEIsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksTUFBTSxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQyxDQUFDO1lBQ3JKLENBQUMsQ0FBQyxDQUFDO1lBRVAsaUZBQWlGO1lBQ2pGLDREQUE0RDtZQUM1RCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7aUJBQ25CLE9BQU8sQ0FBQyxzQ0FBc0MsQ0FBQztpQkFDL0MsT0FBTyxDQUFDLDJEQUEyRCxDQUFDO2lCQUNwRSxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0JBQ3BCLEtBQUssTUFBTSxJQUFJLElBQUksU0FBUyxFQUFFLENBQUM7b0JBQzNCLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUM5QyxDQUFDO2dCQUNELFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMseUJBQXlCLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBTSxLQUFLLEVBQUMsRUFBRTtvQkFDckYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMseUJBQXlCLEdBQUcsS0FBSyxDQUFDO29CQUN2RCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ3JDLENBQUMsQ0FBQSxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztZQUNQLCtEQUErRDtZQUMvRCx1RUFBdUU7WUFDdkUsOENBQThDO1FBRWxELENBQUM7UUFFRixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDbkIsT0FBTyxDQUFDLGlDQUFpQyxDQUFDO2FBQzFDLE9BQU8sQ0FBQyw4Q0FBOEMsQ0FBQzthQUN2RCxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2FBQ2hCLGNBQWMsQ0FBQyxlQUFlLENBQUM7YUFDL0IsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQzthQUMzQyxRQUFRLENBQUMsQ0FBTSxLQUFLLEVBQUMsRUFBRTtZQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2pELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNyQyxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7UUFFWixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDbkIsT0FBTyxDQUFDLDZCQUE2QixDQUFDO2FBQ3RDLE9BQU8sQ0FBQyxnREFBZ0QsQ0FBQzthQUN6RCxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDcEIsTUFBTSxXQUFXLEdBQTJCO2dCQUN4QyxPQUFPLEVBQUUsV0FBVztnQkFDcEIsT0FBTyxFQUFFLGNBQWMsRUFBRSxnQ0FBZ0M7Z0JBQ3hELE9BQU8sRUFBRSxjQUFjO2dCQUN2QixPQUFPLEVBQUUsaUJBQWlCO2dCQUMzQiwrQkFBK0I7YUFDbEMsQ0FBQztZQUNGLEtBQUssTUFBTSxJQUFJLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQzdCLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ2hELENBQUM7WUFDRCxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFNLEtBQUssRUFBQyxFQUFFO2dCQUMxRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDO2dCQUM1QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQyxDQUFDO1FBR1Asc0JBQXNCO1FBQ3RCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTdDLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUM1Qyw2RkFBNkY7UUFDN0YsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ25CLE9BQU8sQ0FBQyxzQkFBc0IsQ0FBQzthQUMvQixPQUFPLENBQUMsbUNBQW1DLENBQUM7YUFDNUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ25HLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztZQUNoRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25CLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUNSLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUMxQyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7aUJBQ25CLE9BQU8sQ0FBQywwQkFBMEIsQ0FBQztpQkFDbkMsT0FBTyxDQUFDLHFFQUFxRSxDQUFDO2lCQUM5RSxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2lCQUNoQixjQUFjLENBQUMsZ0JBQWdCLENBQUMscUJBQXFCLENBQUM7aUJBQ3RELFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQztpQkFDcEQsUUFBUSxDQUFDLENBQU8sS0FBSyxFQUFFLEVBQUU7Z0JBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHFCQUFxQjtvQkFDdEMsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksZ0JBQWdCLENBQUMscUJBQXFCLENBQUM7Z0JBQ3ZHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDakMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDbkMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBQ2hCLENBQUM7UUFDRCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDbkIsT0FBTyxDQUFDLHlCQUF5QixDQUFDO2FBQ2xDLE9BQU8sQ0FBQyw2Q0FBNkMsQ0FBQzthQUN0RCxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2FBQ2hCLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxvQkFBb0IsSUFBSSxZQUFZLENBQUM7YUFDckUsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDO2FBQ25ELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG9CQUFvQjtnQkFDckMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLGdCQUFnQixDQUFDLG9CQUFvQixDQUFDO1lBQ3pFLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNqQyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVztnQkFBRSxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLGtCQUFrQixFQUFFLENBQUM7UUFDcEYsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBR1osdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNsQywyR0FBMkc7UUFDM0csTUFBTSxlQUFlLEdBQTJCLEVBQUUsQ0FBQztRQUNuRCxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUNoQyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsK0JBQStCO2dCQUNyRCxlQUFlLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDO1lBQy9CLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNuQixPQUFPLENBQUMsbUJBQW1CLENBQUM7YUFDNUIsT0FBTyxDQUFDLHNDQUFzQyxDQUFDO2FBQy9DLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVE7YUFDNUIsVUFBVSxDQUFDLGVBQWUsQ0FBQzthQUMzQixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxJQUFJLE1BQU0sQ0FBQzthQUN4RCxRQUFRLENBQUMsQ0FBTyxLQUE0QixFQUFFLEVBQUU7WUFDN0MsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQztZQUM3QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1FBRVosSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ25CLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQzthQUM5QixPQUFPLENBQUMsVUFBVSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsbUJBQW1CLENBQUM7YUFDekUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO1lBQ25HLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztZQUNoRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25CLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztRQUVSLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUMxQyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7aUJBQ25CLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztpQkFDekIsT0FBTyxDQUFDLDZCQUE2QixDQUFDO2lCQUN0QyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxRQUFRO2lCQUM1QixVQUFVLENBQUMsZUFBZSxDQUFDO2lCQUMzQixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQztpQkFDckQsUUFBUSxDQUFDLENBQU8sS0FBNEIsRUFBRSxFQUFFO2dCQUM3QyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO2dCQUMxQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDckMsQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDO1lBRVosSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2lCQUNuQixPQUFPLENBQUMsd0JBQXdCLENBQUM7aUJBQ2pDLE9BQU8sQ0FBQyxnRUFBZ0UsQ0FBQztpQkFDekUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBTyxLQUFLLEVBQUUsRUFBRTtnQkFDOUYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztnQkFDM0MsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3JDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQztZQUVSLG9DQUFvQztZQUNwQyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7aUJBQ25CLE9BQU8sQ0FBQyxlQUFlLENBQUM7aUJBQ3hCLE9BQU8sQ0FBQyxtQ0FBbUMsQ0FBQztpQkFDNUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTtpQkFDaEIsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDO2lCQUM3QyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM1QixvRkFBb0Y7WUFDbkYsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2lCQUNuQixPQUFPLENBQUMsd0JBQXdCLENBQUM7aUJBQ2pDLE9BQU8sQ0FBQyxvREFBb0QsQ0FBQztpQkFDN0QsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSTtpQkFDaEIsY0FBYyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2lCQUN6RCxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUM7aUJBQ3ZELFFBQVEsQ0FBQyxDQUFPLEtBQUssRUFBRSxFQUFFO2dCQUN0QixNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN2QyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDO2dCQUN6RyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ2pDLCtEQUErRDtZQUNuRSxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUM7UUFDakIsQ0FBQztRQUVELHdDQUF3QztJQUU1QyxDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBzZXR0aW5ncy50c1xyXG5pbXBvcnQge1xyXG4gIEFwcCxcclxuICBQbHVnaW5TZXR0aW5nVGFiLFxyXG4gIFNldHRpbmcsXHJcbiAgRHJvcGRvd25Db21wb25lbnQsXHJcbiAgc2V0SWNvbixcclxuICBURm9sZGVyLFxyXG4gIGRlYm91bmNlLFxyXG4gIEV4dHJhQnV0dG9uQ29tcG9uZW50LFxyXG4gIFNsaWRlckNvbXBvbmVudCxcclxuICBOb3RpY2UsXHJcbiAgbm9ybWFsaXplUGF0aCwgLy8gPC0tLSDQlNCe0JTQkNCd0J4g0IbQnNCf0J7QoNCiXHJcbn0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCBPbGxhbWFQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xyXG5pbXBvcnQgeyBMb2dMZXZlbCwgTG9nZ2VyU2V0dGluZ3MgfSBmcm9tIFwiLi9Mb2dnZXJcIjsgLy8g0IbQvNC/0L7RgNGC0YPRlNC80L4gTG9nTGV2ZWwg0YLQsCBMb2dnZXJTZXR0aW5nc1xyXG5cclxuLy8gLS0tINCc0L7QstC4IC0tLVxyXG5leHBvcnQgY29uc3QgTEFOR1VBR0VTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gIGFmOiBcIkFmcmlrYWFuc1wiLFxyXG4gIHNxOiBcIkFsYmFuaWFuXCIsXHJcbiAgYW06IFwiQW1oYXJpY1wiLFxyXG4gIGFyOiBcIkFyYWJpY1wiLFxyXG4gIGh5OiBcIkFybWVuaWFuXCIsXHJcbiAgYXo6IFwiQXplcmJhaWphbmlcIixcclxuICBldTogXCJCYXNxdWVcIixcclxuICBiZTogXCJCZWxhcnVzaWFuXCIsXHJcbiAgYm46IFwiQmVuZ2FsaVwiLFxyXG4gIGJzOiBcIkJvc25pYW5cIixcclxuICBiZzogXCJCdWxnYXJpYW5cIixcclxuICBjYTogXCJDYXRhbGFuXCIsXHJcbiAgY2ViOiBcIkNlYnVhbm9cIixcclxuICBueTogXCJDaGljaGV3YVwiLFxyXG4gIFwiemgtQ05cIjogXCJDaGluZXNlIChTaW1wbGlmaWVkKVwiLFxyXG4gIFwiemgtVFdcIjogXCJDaGluZXNlIChUcmFkaXRpb25hbClcIixcclxuICBjbzogXCJDb3JzaWNhblwiLFxyXG4gIGhyOiBcIkNyb2F0aWFuXCIsXHJcbiAgY3M6IFwiQ3plY2hcIixcclxuICBkYTogXCJEYW5pc2hcIixcclxuICBubDogXCJEdXRjaFwiLFxyXG4gIGVuOiBcIkVuZ2xpc2hcIixcclxuICBlbzogXCJFc3BlcmFudG9cIixcclxuICBldDogXCJFc3RvbmlhblwiLFxyXG4gIHRsOiBcIkZpbGlwaW5vXCIsXHJcbiAgZmk6IFwiRmlubmlzaFwiLFxyXG4gIGZyOiBcIkZyZW5jaFwiLFxyXG4gIGZ5OiBcIkZyaXNpYW5cIixcclxuICBnbDogXCJHYWxpY2lhblwiLFxyXG4gIGthOiBcIkdlb3JnaWFuXCIsXHJcbiAgZGU6IFwiR2VybWFuXCIsXHJcbiAgZWw6IFwiR3JlZWtcIixcclxuICBndTogXCJHdWphcmF0aVwiLFxyXG4gIGh0OiBcIkhhaXRpYW4gQ3Jlb2xlXCIsXHJcbiAgaGE6IFwiSGF1c2FcIixcclxuICBoYXc6IFwiSGF3YWlpYW5cIixcclxuICBpdzogXCJIZWJyZXdcIixcclxuICBoZTogXCJIZWJyZXdcIixcclxuICBoaTogXCJIaW5kaVwiLFxyXG4gIGhtbjogXCJIbW9uZ1wiLFxyXG4gIGh1OiBcIkh1bmdhcmlhblwiLFxyXG4gIGlzOiBcIkljZWxhbmRpY1wiLFxyXG4gIGlnOiBcIklnYm9cIixcclxuICBpZDogXCJJbmRvbmVzaWFuXCIsXHJcbiAgZ2E6IFwiSXJpc2hcIixcclxuICBpdDogXCJJdGFsaWFuXCIsXHJcbiAgamE6IFwiSmFwYW5lc2VcIixcclxuICBqdzogXCJKYXZhbmVzZVwiLFxyXG4gIGtuOiBcIkthbm5hZGFcIixcclxuICBrazogXCJLYXpha2hcIixcclxuICBrbTogXCJLaG1lclwiLFxyXG4gIHJ3OiBcIktpbnlhcndhbmRhXCIsXHJcbiAga286IFwiS29yZWFuXCIsXHJcbiAga3U6IFwiS3VyZGlzaCAoS3VybWFuamkpXCIsXHJcbiAga3k6IFwiS3lyZ3l6XCIsXHJcbiAgbG86IFwiTGFvXCIsXHJcbiAgbGE6IFwiTGF0aW5cIixcclxuICBsdjogXCJMYXR2aWFuXCIsXHJcbiAgbHQ6IFwiTGl0aHVhbmlhblwiLFxyXG4gIGxiOiBcIkx1eGVtYm91cmdpc2hcIixcclxuICBtazogXCJNYWNlZG9uaWFuXCIsXHJcbiAgbWc6IFwiTWFsYWdhc3lcIixcclxuICBtczogXCJNYWxheVwiLFxyXG4gIG1sOiBcIk1hbGF5YWxhbVwiLFxyXG4gIG10OiBcIk1hbHRlc2VcIixcclxuICBtaTogXCJNYW9yaVwiLFxyXG4gIG1yOiBcIk1hcmF0aGlcIixcclxuICBtbjogXCJNb25nb2xpYW5cIixcclxuICBteTogXCJNeWFubWFyIChCdXJtZXNlKVwiLFxyXG4gIG5lOiBcIk5lcGFsaVwiLFxyXG4gIG5vOiBcIk5vcndlZ2lhblwiLFxyXG4gIG9yOiBcIk9kaWEgKE9yaXlhKVwiLFxyXG4gIHBzOiBcIlBhc2h0b1wiLFxyXG4gIGZhOiBcIlBlcnNpYW5cIixcclxuICBwbDogXCJQb2xpc2hcIixcclxuICBwdDogXCJQb3J0dWd1ZXNlXCIsXHJcbiAgcGE6IFwiUHVuamFiaVwiLFxyXG4gIHJvOiBcIlJvbWFuaWFuXCIsXHJcbiAgcnU6IFwiUnVzc2lhblwiLFxyXG4gIHNtOiBcIlNhbW9hblwiLFxyXG4gIGdkOiBcIlNjb3RzIEdhZWxpY1wiLFxyXG4gIHNyOiBcIlNlcmJpYW5cIixcclxuICBzdDogXCJTZXNvdGhvXCIsXHJcbiAgc246IFwiU2hvbmFcIixcclxuICBzZDogXCJTaW5kaGlcIixcclxuICBzaTogXCJTaW5oYWxhXCIsXHJcbiAgc2s6IFwiU2xvdmFrXCIsXHJcbiAgc2w6IFwiU2xvdmVuaWFuXCIsXHJcbiAgc286IFwiU29tYWxpXCIsXHJcbiAgZXM6IFwiU3BhbmlzaFwiLFxyXG4gIHN1OiBcIlN1bmRhbmVzZVwiLFxyXG4gIHN3OiBcIlN3YWhpbGlcIixcclxuICBzdjogXCJTd2VkaXNoXCIsXHJcbiAgdGc6IFwiVGFqaWtcIixcclxuICB0YTogXCJUYW1pbFwiLFxyXG4gIHR0OiBcIlRhdGFyXCIsXHJcbiAgdGU6IFwiVGVsdWd1XCIsXHJcbiAgdGg6IFwiVGhhaVwiLFxyXG4gIHRyOiBcIlR1cmtpc2hcIixcclxuICB0azogXCJUdXJrbWVuXCIsXHJcbiAgdWs6IFwiVWtyYWluaWFuXCIsXHJcbiAgdXI6IFwiVXJkdVwiLFxyXG4gIHVnOiBcIlV5Z2h1clwiLFxyXG4gIHV6OiBcIlV6YmVrXCIsXHJcbiAgdmk6IFwiVmlldG5hbWVzZVwiLFxyXG4gIGN5OiBcIldlbHNoXCIsXHJcbiAgeGg6IFwiWGhvc2FcIixcclxuICB5aTogXCJZaWRkaXNoXCIsXHJcbiAgeW86IFwiWW9ydWJhXCIsXHJcbiAgenU6IFwiWnVsdVwiLFxyXG59O1xyXG5cclxuLy8gLS0tINCi0LjQvyDQsNCy0LDRgtCw0YDQsCAo0JTQntCU0JDQndCeICdpbWFnZScpIC0tLVxyXG5leHBvcnQgdHlwZSBBdmF0YXJUeXBlID0gXCJpbml0aWFsc1wiIHwgXCJpY29uXCIgfCBcImltYWdlXCI7XHJcblxyXG5leHBvcnQgdHlwZSBUcmFuc2xhdGlvblByb3ZpZGVyID0gJ2dvb2dsZScgfCAnb2xsYW1hJyB8ICdub25lJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgT2xsYW1hUGx1Z2luU2V0dGluZ3MgZXh0ZW5kcyBMb2dnZXJTZXR0aW5ncyB7XHJcbiAgb2xsYW1hU2VydmVyVXJsOiBzdHJpbmc7XHJcbiAgbW9kZWxOYW1lOiBzdHJpbmc7XHJcbiAgdGVtcGVyYXR1cmU6IG51bWJlcjtcclxuICBjb250ZXh0V2luZG93OiBudW1iZXI7XHJcblxyXG4gIC8vIFJvbGVzXHJcbiAgdXNlclJvbGVzRm9sZGVyUGF0aDogc3RyaW5nO1xyXG4gIHNlbGVjdGVkUm9sZVBhdGg/OiBzdHJpbmc7XHJcbiAgZm9sbG93Um9sZTogYm9vbGVhbjtcclxuXHJcbiAgLy8gU3RvcmFnZSAmIEhpc3RvcnlcclxuICBzYXZlTWVzc2FnZUhpc3Rvcnk6IGJvb2xlYW47XHJcbiAgY2hhdEhpc3RvcnlGb2xkZXJQYXRoOiBzdHJpbmc7XHJcbiAgY2hhdEV4cG9ydEZvbGRlclBhdGg6IHN0cmluZztcclxuXHJcbiAgLy8gVmlldyBCZWhhdmlvclxyXG4gIG9wZW5DaGF0SW5UYWI6IGJvb2xlYW47XHJcbiAgbWF4TWVzc2FnZUhlaWdodDogbnVtYmVyO1xyXG4gIHNpZGViYXJXaWR0aD86IG51bWJlcjsgLy8g0JDQsdC+IG51bGwuINCe0LfQvdCw0YfQsNGULCDRidC+INGI0LjRgNC40L3QsCDQvdC1INCy0YHRgtCw0L3QvtCy0LvQtdC90LAg0LrQvtGA0LjRgdGC0YPQstCw0YfQtdC8XHJcblxyXG4gIC8vIEFwcGVhcmFuY2VcclxuICB1c2VyQXZhdGFyVHlwZTogQXZhdGFyVHlwZTtcclxuICB1c2VyQXZhdGFyQ29udGVudDogc3RyaW5nO1xyXG4gIGFpQXZhdGFyVHlwZTogQXZhdGFyVHlwZTtcclxuICBhaUF2YXRhckNvbnRlbnQ6IHN0cmluZztcclxuICBmaXhCcm9rZW5FbW9qaXM6IGJvb2xlYW47IC8vINCU0L7QtNCw0L3Qviwg0Y/QutGJ0L4g0YDQsNC90ZbRiNC1INC90LUg0LHRg9C70L5cclxuXHJcbiAgLy8gUkFHXHJcbiAgcmFnRW5hYmxlZDogYm9vbGVhbjtcclxuICByYWdGb2xkZXJQYXRoOiBzdHJpbmc7XHJcbiAgcmFnRW5hYmxlU2VtYW50aWNTZWFyY2g6IGJvb2xlYW47XHJcbiAgcmFnRW1iZWRkaW5nTW9kZWw6IHN0cmluZztcclxuICByYWdDaHVua1NpemU6IG51bWJlcjtcclxuICByYWdTaW1pbGFyaXR5VGhyZXNob2xkOiBudW1iZXI7XHJcbiAgcmFnVG9wSzogbnVtYmVyO1xyXG4gIG1heENoYXJzUGVyRG9jOiBudW1iZXI7XHJcbiAgcmFnQXV0b0luZGV4T25TdGFydHVwOiBib29sZWFuOyAvLyDQlNC+0LTQsNC90L4sINGP0LrRidC+INGA0LDQvdGW0YjQtSDQvdC1INCx0YPQu9C+XHJcblxyXG4gIC8vIFByb2R1Y3Rpdml0eVxyXG4gIGVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzOiBib29sZWFuOyAvLyDQlNC+0LTQsNC90L4sINGP0LrRidC+INGA0LDQvdGW0YjQtSDQvdC1INCx0YPQu9C+XHJcbiAgZGFpbHlUYXNrRmlsZU5hbWU6IHN0cmluZzsgLy8g0JTQvtC00LDQvdC+LCDRj9C60YnQviDRgNCw0L3RltGI0LUg0L3QtSDQsdGD0LvQvlxyXG5cclxuICAvLyBBZHZhbmNlZCBDb250ZXh0IE1hbmFnZW1lbnQgKFN1bW1hcml6YXRpb24pXHJcbiAgdXNlQWR2YW5jZWRDb250ZXh0U3RyYXRlZ3k6IGJvb2xlYW47IC8vINCU0L7QtNCw0L3Qviwg0Y/QutGJ0L4g0YDQsNC90ZbRiNC1INC90LUg0LHRg9C70L5cclxuICBlbmFibGVTdW1tYXJpemF0aW9uOiBib29sZWFuOyAvLyDQlNC+0LTQsNC90L4sINGP0LrRidC+INGA0LDQvdGW0YjQtSDQvdC1INCx0YPQu9C+XHJcbiAgc3VtbWFyaXphdGlvblByb21wdDogc3RyaW5nOyAvLyDQlNC+0LTQsNC90L4sINGP0LrRidC+INGA0LDQvdGW0YjQtSDQvdC1INCx0YPQu9C+XHJcbiAga2VlcExhc3ROTWVzc2FnZXNCZWZvcmVTdW1tYXJ5OiBudW1iZXI7IC8vINCU0L7QtNCw0L3Qviwg0Y/QutGJ0L4g0YDQsNC90ZbRiNC1INC90LUg0LHRg9C70L5cclxuICBzdW1tYXJpemF0aW9uQ2h1bmtTaXplOiBudW1iZXI7IC8vINCU0L7QtNCw0L3Qviwg0Y/QutGJ0L4g0YDQsNC90ZbRiNC1INC90LUg0LHRg9C70L5cclxuICBzdW1tYXJpemF0aW9uTW9kZWxOYW1lOiBzdHJpbmc7IC8vINCU0L7QtNCw0L3Qviwg0Y/QutGJ0L4g0YDQsNC90ZbRiNC1INC90LUg0LHRg9C70L5cclxuICBmYWxsYmFja1N1bW1hcml6YXRpb25Nb2RlbE5hbWU6IHN0cmluZzsgLy8g0JTQvtC00LDQvdC+LCDRj9C60YnQviDRgNCw0L3RltGI0LUg0L3QtSDQsdGD0LvQvlxyXG5cclxuXHJcbiAgLy8gU3BlZWNoICYgVHJhbnNsYXRpb25cclxuICBnb29nbGVBcGlLZXk6IHN0cmluZzsgLy8gU3BlZWNoLXRvLVRleHRcclxuICBzcGVlY2hMYW5ndWFnZTogc3RyaW5nO1xyXG4gIGVuYWJsZVRyYW5zbGF0aW9uOiBib29sZWFuOyAvLyDQnNC+0LbQu9C40LLQviwg0YbQtSDQv9C+0LvQtSDRgdGC0LDQvdC1INC30LDRgdGC0LDRgNGW0LvQuNC8INC/0ZbRgdC70Y8g0LTQvtC00LDQstCw0L3QvdGPIHRyYW5zbGF0aW9uUHJvdmlkZXJcclxuICB0cmFuc2xhdGlvblRhcmdldExhbmd1YWdlOiBzdHJpbmc7XHJcbiAgZ29vZ2xlVHJhbnNsYXRpb25BcGlLZXk6IHN0cmluZztcclxuICB0cmFuc2xhdGlvblByb3ZpZGVyOiBUcmFuc2xhdGlvblByb3ZpZGVyOyAvLyDQlNC+0LTQsNC90L5cclxuICBvbGxhbWFUcmFuc2xhdGlvbk1vZGVsOiBzdHJpbmc7IC8vINCU0L7QtNCw0L3QvlxyXG5cclxuICAvLyBUb29scy9BZ2VudHNcclxuICBlbmFibGVUb29sVXNlOiBib29sZWFuOyAvLyDQlNC+0LTQsNC90L5cclxuXHJcbiAgLy8gV2VhdGhlciBBZ2VudCBTZXR0aW5ncyAo0J3QntCS0IYg0J/QntCb0K8hKVxyXG4gIG9wZW5XZWF0aGVyTWFwQXBpS2V5OiBzdHJpbmc7IC8vIEFQSSDQutC70Y7RhyBPcGVuV2VhdGhlck1hcFxyXG4gIHdlYXRoZXJEZWZhdWx0TG9jYXRpb246IHN0cmluZzsgLy8g0JvQvtC60LDRhtGW0Y8g0LfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvCDQtNC70Y8g0L/QvtCz0L7QtNC4XHJcbn1cclxuXHJcblxyXG4vLyAtLS0g0JfQvdCw0YfQtdC90L3RjyDQt9CwINC30LDQvNC+0LLRh9GD0LLQsNC90L3Rj9C8IC0tLVxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogT2xsYW1hUGx1Z2luU2V0dGluZ3MgPSB7XHJcbiAgLy8gQ29ubmVjdGlvbiAmIE1vZGVsXHJcbiAgb2xsYW1hU2VydmVyVXJsOiBcImh0dHA6Ly9sb2NhbGhvc3Q6MTE0MzRcIixcclxuICBtb2RlbE5hbWU6IFwiXCIsXHJcbiAgdGVtcGVyYXR1cmU6IDAuNyxcclxuICBjb250ZXh0V2luZG93OiA0MDk2LFxyXG5cclxuICAvLyBSb2xlc1xyXG4gIHVzZXJSb2xlc0ZvbGRlclBhdGg6IFwiYWktZm9yZ2Uvcm9sZXNcIiwgLy8g0JrRgNCw0YnQuNC5INGI0LvRj9GFINC30LAg0LfQsNC80L7QstGH0YPQstCw0L3QvdGP0Lwg0YMgVmF1bHRcclxuICBzZWxlY3RlZFJvbGVQYXRoOiBcIlwiLFxyXG4gIGZvbGxvd1JvbGU6IHRydWUsXHJcblxyXG4gIC8vIFN0b3JhZ2UgJiBIaXN0b3J5XHJcbiAgc2F2ZU1lc3NhZ2VIaXN0b3J5OiB0cnVlLFxyXG4gIGNoYXRIaXN0b3J5Rm9sZGVyUGF0aDogXCJhaS1mb3JnZS9jaGF0c1wiLCAvLyDQmtGA0LDRidC40Lkg0YjQu9GP0YUg0LfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvCDRgyBWYXVsdFxyXG4gIGNoYXRFeHBvcnRGb2xkZXJQYXRoOiBcImFpLWZvcmdlL2V4cG9ydHNcIiwgLy8g0JrRgNCw0YnQuNC5INGI0LvRj9GFINC30LAg0LfQsNC80L7QstGH0YPQstCw0L3QvdGP0Lwg0YMgVmF1bHRcclxuXHJcbiAgLy8gVmlldyBCZWhhdmlvclxyXG4gIG9wZW5DaGF0SW5UYWI6IGZhbHNlLFxyXG4gIG1heE1lc3NhZ2VIZWlnaHQ6IDMwMCxcclxuICBzaWRlYmFyV2lkdGg6IHVuZGVmaW5lZCwgLy8g0JDQsdC+IG51bGwuINCe0LfQvdCw0YfQsNGULCDRidC+INGI0LjRgNC40L3QsCDQvdC1INCy0YHRgtCw0L3QvtCy0LvQtdC90LAg0LrQvtGA0LjRgdGC0YPQstCw0YfQtdC8XHJcblxyXG4gIC8vIEFwcGVhcmFuY2VcclxuICB1c2VyQXZhdGFyVHlwZTogXCJpbml0aWFsc1wiLFxyXG4gIHVzZXJBdmF0YXJDb250ZW50OiBcIlVcIixcclxuICBhaUF2YXRhclR5cGU6IFwiaWNvblwiLFxyXG4gIGFpQXZhdGFyQ29udGVudDogXCJib3RcIixcclxuICBmaXhCcm9rZW5FbW9qaXM6IHRydWUsXHJcblxyXG4gIC8vIFJBR1xyXG4gIHJhZ0VuYWJsZWQ6IGZhbHNlLFxyXG4gIHJhZ0ZvbGRlclBhdGg6IFwiYWktZm9yZ2UvcmFnXCIsIC8vINCa0YDQsNGJ0LjQuSDRiNC70Y/RhSDQt9CwINC30LDQvNC+0LLRh9GD0LLQsNC90L3Rj9C8INGDIFZhdWx0XHJcbiAgcmFnRW5hYmxlU2VtYW50aWNTZWFyY2g6IHRydWUsXHJcbiAgcmFnRW1iZWRkaW5nTW9kZWw6IFwibm9taWMtZW1iZWQtdGV4dFwiLCAvLyDQn9C+0L/Rg9C70Y/RgNC90LAg0LzQvtC00LXQu9GMINC00LvRjyDQstCx0YPQtNC+0LLRg9Cy0LDQvdGMXHJcbiAgcmFnQ2h1bmtTaXplOiA1MTIsXHJcbiAgcmFnU2ltaWxhcml0eVRocmVzaG9sZDogMC41LFxyXG4gIHJhZ1RvcEs6IDMsXHJcbiAgbWF4Q2hhcnNQZXJEb2M6IDE1MDAsXHJcbiAgcmFnQXV0b0luZGV4T25TdGFydHVwOiB0cnVlLFxyXG5cclxuICAvLyBQcm9kdWN0aXZpdHlcclxuICBlbmFibGVQcm9kdWN0aXZpdHlGZWF0dXJlczogZmFsc2UsXHJcbiAgZGFpbHlUYXNrRmlsZU5hbWU6IFwiVGFza3NfVG9kYXkubWRcIixcclxuXHJcbiAgLy8gQWR2YW5jZWQgQ29udGV4dCBNYW5hZ2VtZW50IChTdW1tYXJpemF0aW9uKVxyXG4gIHVzZUFkdmFuY2VkQ29udGV4dFN0cmF0ZWd5OiBmYWxzZSxcclxuICBlbmFibGVTdW1tYXJpemF0aW9uOiBmYWxzZSxcclxuICBzdW1tYXJpemF0aW9uUHJvbXB0OiBcIlN1bW1hcml6ZSB0aGUga2V5IHBvaW50cyBkaXNjdXNzZWQgc28gZmFyIGluIHRoaXMgY29udmVyc2F0aW9uOlxcblxcbnt0ZXh0X3RvX3N1bW1hcml6ZX1cIixcclxuICBrZWVwTGFzdE5NZXNzYWdlc0JlZm9yZVN1bW1hcnk6IDEwLFxyXG4gIHN1bW1hcml6YXRpb25DaHVua1NpemU6IDE1MDAsXHJcbiAgc3VtbWFyaXphdGlvbk1vZGVsTmFtZTogXCJcIiwgLy8g0JfQsNC70LjRiNCw0ZTQvNC+INC/0L7RgNC+0LbQvdGW0LwsINCy0LjQvNCw0LPQsNGUINCy0LjQsdC+0YDRg1xyXG4gIGZhbGxiYWNrU3VtbWFyaXphdGlvbk1vZGVsTmFtZTogXCJnZW1tYTI6MmJcIiwgLy8g0J/RgNC40LrQu9Cw0LQgZmFsbGJhY2sg0LzQvtC00LXQu9GWXHJcblxyXG4gIC8vIFNwZWVjaCAmIFRyYW5zbGF0aW9uXHJcbiAgZ29vZ2xlQXBpS2V5OiBcIlwiLCAvLyBTcGVlY2gtdG8tVGV4dFxyXG4gIHNwZWVjaExhbmd1YWdlOiBcInVrLVVBXCIsIC8vIFVrcmFpbmlhblxyXG4gIGVuYWJsZVRyYW5zbGF0aW9uOiBmYWxzZSwgLy8g0JfQsNGB0YLQsNGA0ZbQu9C1INC/0L7Qu9C1LCDQsdGD0LTQtSDQutC+0L3RgtGA0L7Qu9GO0LLQsNGC0LjRgdGMIHRyYW5zbGF0aW9uUHJvdmlkZXJcclxuICB0cmFuc2xhdGlvblRhcmdldExhbmd1YWdlOiBcInVrXCIsIC8vIFVrcmFpbmlhblxyXG4gIGdvb2dsZVRyYW5zbGF0aW9uQXBpS2V5OiBcIlwiLCAvLyBHb29nbGUgVHJhbnNsYXRlXHJcbiAgdHJhbnNsYXRpb25Qcm92aWRlcjogJ25vbmUnLCAvLyDQl9CwINC30LDQvNC+0LLRh9GD0LLQsNC90L3Rj9C8INCy0LjQvNC60L3QtdC90L5cclxuICBvbGxhbWFUcmFuc2xhdGlvbk1vZGVsOiAnJywgLy8g0JfQsNC70LjRiNCw0ZTQvNC+INC/0L7RgNC+0LbQvdGW0LxcclxuXHJcbiAgLy8gVG9vbHMvQWdlbnRzXHJcbiAgZW5hYmxlVG9vbFVzZTogdHJ1ZSxcclxuXHJcbiAgLy8gV2VhdGhlciBBZ2VudCBTZXR0aW5ncyAo0JfQndCQ0KfQldCd0J3QryDQl9CQINCX0JDQnNCe0JLQp9Cj0JLQkNCd0J3Qr9CcINCU0JvQryDQndCe0JLQmNClINCf0J7Qm9CG0JIhKVxyXG4gIG9wZW5XZWF0aGVyTWFwQXBpS2V5OiBcIllPVVJfT1BFTldFQVRIRVJNQVBfQVBJX0tFWVwiLCAvLyDQn9C70LXQudGB0YXQvtC70LTQtdGAIVxyXG4gIHdlYXRoZXJEZWZhdWx0TG9jYXRpb246IFwiS3lpdlwiLCAvLyDQn9GA0LjQutC70LDQtCDQu9C+0LrQsNGG0ZbRlyDQt9CwINC30LDQvNC+0LLRh9GD0LLQsNC90L3Rj9C8XHJcblxyXG4gICAgLy8gTG9nZ2VyIFNldHRpbmdzXHJcbiAgICBjb25zb2xlTG9nTGV2ZWw6IFwiSU5GT1wiLFxyXG4gICAgZmlsZUxvZ2dpbmdFbmFibGVkOiBmYWxzZSxcclxuICAgIGZpbGVMb2dMZXZlbDogXCJXQVJOXCIsXHJcbiAgICBsb2dDYWxsZXJJbmZvOiBmYWxzZSxcclxuICAgIGxvZ0ZpbGVQYXRoOiBcIlwiLCAvLyBMb2dnZXIg0YHQsNC8INC/0ZbQtNGB0YLQsNCy0LjRgtGMINGI0LvRj9GFINC00L4g0L/QsNC/0LrQuCDQv9C70LDQs9GW0L3QsFxyXG4gICAgbG9nRmlsZU1heFNpemVNQjogNSxcclxuXHJcbn07XHJcblxyXG4vLyAtLS0g0JrQu9Cw0YEg0LLQutC70LDQtNC60Lgg0L3QsNC70LDRiNGC0YPQstCw0L3RjCAtLS1cclxuZXhwb3J0IGNsYXNzIE9sbGFtYVNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcclxuICBwbHVnaW46IE9sbGFtYVBsdWdpbjtcclxuICBwcml2YXRlIGRlYm91bmNlZFVwZGF0ZUNoYXRQYXRoOiAoKSA9PiB2b2lkO1xyXG4gIHByaXZhdGUgZGVib3VuY2VkVXBkYXRlUm9sZVBhdGg6ICgpID0+IHZvaWQ7XHJcbiAgcHJpdmF0ZSBkZWJvdW5jZWRVcGRhdGVSYWdQYXRoOiAoKSA9PiB2b2lkO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBPbGxhbWFQbHVnaW4pIHtcclxuICAgICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xyXG4gICAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuXHJcbiAgICAgIC8vIC4uLiAo0ZbRgdC90YPRjtGH0ZYgZGVib3VuY2VkINGE0YPQvdC60YbRltGXINC30LDQu9C40YjQsNGO0YLRjNGB0Y8g0LHQtdC3INC30LzRltC9KVxyXG4gICAgICAgdGhpcy5kZWJvdW5jZWRVcGRhdGVDaGF0UGF0aCA9IGRlYm91bmNlKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJEZWJvdW5jZWQ6IFVwZGF0aW5nIGNoYXQgcGF0aCBhbmQgZW5zdXJpbmcgZm9sZGVyIGV4aXN0cy4uLlwiKTtcclxuICAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIpIHtcclxuICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIudXBkYXRlQ2hhdHNGb2xkZXJQYXRoKCk7XHJcbiAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmVuc3VyZUZvbGRlcnNFeGlzdCgpO1xyXG4gICAgICAgICAgIH1cclxuICAgICAgIH0sIDEwMDAsIHRydWUpO1xyXG5cclxuICAgICAgIHRoaXMuZGVib3VuY2VkVXBkYXRlUm9sZVBhdGggPSBkZWJvdW5jZShhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiRGVib3VuY2VkOiBSZWZyZXNoaW5nIHJvbGUgbGlzdCBkdWUgdG8gcGF0aCBjaGFuZ2UuLi5cIik7XHJcbiAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ubGlzdFJvbGVGaWxlcyh0cnVlKTtcclxuICAgICAgICAgICAodGhpcy5wbHVnaW4gYXMgT2xsYW1hUGx1Z2luKS5lbWl0KFwicm9sZXMtdXBkYXRlZFwiKTtcclxuICAgICAgIH0sIDEwMDAsIHRydWUpO1xyXG5cclxuICAgICAgIHRoaXMuZGVib3VuY2VkVXBkYXRlUmFnUGF0aCA9IGRlYm91bmNlKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJEZWJvdW5jZWQ6IFJlLWluZGV4aW5nIFJBRyBkdWUgdG8gcGF0aCBjaGFuZ2UuLi5cIik7XHJcbiAgICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0VuYWJsZWQgJiYgdGhpcy5wbHVnaW4ucmFnU2VydmljZSkge1xyXG4gICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5yYWdTZXJ2aWNlLmluZGV4RG9jdW1lbnRzKCk7XHJcbiAgICAgICAgICAgfVxyXG4gICAgICAgfSwgMTAwMCwgdHJ1ZSk7XHJcbiAgfVxyXG5cclxuICAvLyDQlNC+0L/QvtC80ZbQttC90LAg0YTRg9C90LrRhtGW0Y8g0LTQu9GPINGB0YLQstC+0YDQtdC90L3RjyDQt9Cw0LPQvtC70L7QstC60ZbQsiDRgdC10LrRhtGW0LlcclxuICBwcml2YXRlIGNyZWF0ZVNlY3Rpb25IZWFkZXIodGV4dDogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgIHRoaXMuY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQgfSkuYWRkQ2xhc3MoXCJhaS1mb3JnZS1zZXR0aW5ncy1oZWFkZXJcIik7XHJcbiAgfVxyXG5cclxuICAvLyDQndC+0LLQsCDQtNC+0L/QvtC80ZbQttC90LAg0YTRg9C90LrRhtGW0Y8g0LTQu9GPINGB0YLQstC+0YDQtdC90L3RjyDQv9GW0LTQt9Cw0LPQvtC70L7QstC60ZbQsiDQs9GA0YPQv1xyXG4gICBwcml2YXRlIGNyZWF0ZUdyb3VwSGVhZGVyKHRleHQ6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgdGhpcy5jb250YWluZXJFbC5jcmVhdGVFbChcImg0XCIsIHsgdGV4dCB9KS5hZGRDbGFzcyhcImFpLWZvcmdlLXNldHRpbmdzLWdyb3VwLWhlYWRlclwiKTtcclxuICAgfVxyXG5cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcclxuICAgICAgY29udGFpbmVyRWwuZW1wdHkoKTtcclxuICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQUkgRm9yZ2UgU2V0dGluZ3NcIiB9KTtcclxuXHJcbiAgICAgIC8vIC0tLSDQndCe0JLQkCDQodCi0KDQo9Ca0KLQo9Cg0JAg0KHQldCa0KbQhtCZIC0tLVxyXG5cclxuICAgICAgLy8gMS4gR2VuZXJhbFxyXG4gICAgICB0aGlzLmNyZWF0ZVNlY3Rpb25IZWFkZXIoXCJHZW5lcmFsXCIpO1xyXG5cclxuICAgICAgLy8gQ29ubmVjdGlvbiAmIE1vZGVsIERlZmF1bHRzICjQv9C10YDQtdC80ZbRidC10L3QvilcclxuICAgICAgdGhpcy5jcmVhdGVHcm91cEhlYWRlcihcIkNvbm5lY3Rpb24gJiBNb2RlbCBEZWZhdWx0c1wiKTtcclxuICAgICAgLy8gLi4uICjRltGB0L3Rg9GO0YfRliDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8gb2xsYW1hU2VydmVyVXJsLCBtb2RlbE5hbWUsIHRlbXBlcmF0dXJlLCBjb250ZXh0V2luZG93LCBlbmFibGVUb29sVXNlKVxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgIC5zZXROYW1lKFwiT2xsYW1hIFNlcnZlciBVUkxcIilcclxuICAgICAgICAgIC5zZXREZXNjKFwiVGhlIFVSTCBvZiB5b3VyIHJ1bm5pbmcgT2xsYW1hIHNlcnZlciAoZS5nLiwgaHR0cDovL2xvY2FsaG9zdDoxMTQzNCBvciBodHRwOi8vMTkyLjE2OC5YLlg6MTE0MzQpLlwiKVxyXG4gICAgICAgICAgLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Mub2xsYW1hU2VydmVyVXJsKVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5vbGxhbWFTZXJ2ZXJVcmwpXHJcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICBsZXQgdXJsID0gdmFsdWUudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICBpZiAodXJsICYmICF1cmwuc3RhcnRzV2l0aChcImh0dHA6Ly9cIikgJiYgIXVybC5zdGFydHNXaXRoKFwiaHR0cHM6Ly9cIikpIHtcclxuICAgICAgICAgICAgICAgICAgICAgIHVybCA9IFwiaHR0cDovL1wiICsgdXJsO1xyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIGlmICh1cmwuZW5kc1dpdGgoXCIvXCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICB1cmwgPSB1cmwuc2xpY2UoMCwgLTEpO1xyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm9sbGFtYVNlcnZlclVybCA9IHVybCB8fCBERUZBVUxUX1NFVFRJTkdTLm9sbGFtYVNlcnZlclVybDtcclxuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgbGV0IG1vZGVsRHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICAgIGNvbnN0IHVwZGF0ZU9wdGlvbnMgPSBhc3luYyAoZHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCwgYnV0dG9uPzogRXh0cmFCdXR0b25Db21wb25lbnQpID0+IHtcclxuICAgICAgICAgIGlmICghZHJvcGRvd24pIHJldHVybjtcclxuICAgICAgICAgIGNvbnN0IGN1cnJlbnRWYWwgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWU7XHJcbiAgICAgICAgICBkcm9wZG93bi5zZWxlY3RFbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiTG9hZGluZyBtb2RlbHMuLi5cIik7XHJcbiAgICAgICAgICBkcm9wZG93bi5zZXREaXNhYmxlZCh0cnVlKTtcclxuICAgICAgICAgIGJ1dHRvbj8uc2V0RGlzYWJsZWQodHJ1ZSkuc2V0SWNvbihcImxvYWRlclwiKTtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgY29uc3QgbW9kZWxzID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZXRNb2RlbHMoKTtcclxuICAgICAgICAgICAgICBkcm9wZG93bi5zZWxlY3RFbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIi0tIFNlbGVjdCBkZWZhdWx0IG1vZGVsIC0tXCIpO1xyXG4gICAgICAgICAgICAgIGlmIChtb2RlbHMgJiYgbW9kZWxzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgbW9kZWxzLmZvckVhY2gobW9kZWxOYW1lID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihtb2RlbE5hbWUsIG1vZGVsTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZShtb2RlbHMuaW5jbHVkZXMoY3VycmVudFZhbCkgPyBjdXJyZW50VmFsIDogXCJcIik7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiTm8gbW9kZWxzIGZvdW5kXCIpO1xyXG4gICAgICAgICAgICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZShcIlwiKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIGZldGNoaW5nIG1vZGVscyBmb3Igc2V0dGluZ3M6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgICBkcm9wZG93bi5zZWxlY3RFbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIkVycm9yIGxvYWRpbmcgbW9kZWxzIVwiKTtcclxuICAgICAgICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZShcIlwiKTtcclxuICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgZHJvcGRvd24uc2V0RGlzYWJsZWQoZmFsc2UpO1xyXG4gICAgICAgICAgICAgIGJ1dHRvbj8uc2V0RGlzYWJsZWQoZmFsc2UpLnNldEljb24oXCJyZWZyZXNoLWN3XCIpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICB9O1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAuc2V0TmFtZShcIkRlZmF1bHQgTW9kZWwgTmFtZVwiKVxyXG4gICAgICAgICAgLnNldERlc2MoXCJUaGUgZGVmYXVsdCBPbGxhbWEgbW9kZWwgZm9yIG5ldyBjaGF0cy5cIilcclxuICAgICAgICAgIC5hZGREcm9wZG93bihhc3luYyAoZHJvcGRvd24pID0+IHtcclxuICAgICAgICAgICAgICBtb2RlbERyb3Bkb3duID0gZHJvcGRvd247XHJcbiAgICAgICAgICAgICAgZHJvcGRvd24ub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICBhd2FpdCB1cGRhdGVPcHRpb25zKGRyb3Bkb3duKTsgLy8g0J/QvtGH0LDRgtC60L7QstC1INC30LDQstCw0L3RgtCw0LbQtdC90L3Rj1xyXG4gICAgICAgICAgfSlcclxuICAgICAgICAgIC5hZGRFeHRyYUJ1dHRvbihidXR0b24gPT4ge1xyXG4gICAgICAgICAgICAgIGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgICAuc2V0SWNvbihcInJlZnJlc2gtY3dcIilcclxuICAgICAgICAgICAgICAgICAgLnNldFRvb2x0aXAoXCJSZWZyZXNoIG1vZGVsIGxpc3RcIilcclxuICAgICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdXBkYXRlT3B0aW9ucyhtb2RlbERyb3Bkb3duLCBidXR0b24pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIk1vZGVsIGxpc3QgcmVmcmVzaGVkIVwiKTtcclxuICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9KTtcclxuXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgLnNldE5hbWUoXCJEZWZhdWx0IFRlbXBlcmF0dXJlXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIkNvbnRyb2xzIHJhbmRvbW5lc3MgKDAuMCA9IGRldGVybWluaXN0aWMsID4xLjAgPSBjcmVhdGl2ZSkuXCIpXHJcbiAgICAgICAgICAuYWRkU2xpZGVyKHNsaWRlciA9PiBzbGlkZXJcclxuICAgICAgICAgICAgICAuc2V0TGltaXRzKDAsIDIsIDAuMSlcclxuICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGVyYXR1cmUpXHJcbiAgICAgICAgICAgICAgLnNldER5bmFtaWNUb29sdGlwKClcclxuICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRlbXBlcmF0dXJlID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgLnNldE5hbWUoXCJDb250ZXh0IFdpbmRvdyBTaXplIChUb2tlbnMpXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIk1heCB0b2tlbnMgbW9kZWwgY29uc2lkZXJzLiBSZXF1aXJlcyByZXN0YXJ0L3JlbG9hZCBpZiBjaGFuZ2VkIHdoaWxlIG1vZGVsIGlzIGxvYWRlZC5cIilcclxuICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmNvbnRleHRXaW5kb3cudG9TdHJpbmcoKSlcclxuICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuY29udGV4dFdpbmRvdy50b1N0cmluZygpKVxyXG4gICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgY29uc3QgbnVtID0gcGFyc2VJbnQodmFsdWUudHJpbSgpLCAxMCk7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3cgPSAhaXNOYU4obnVtKSAmJiBudW0gPiAwID8gbnVtIDogREVGQVVMVF9TRVRUSU5HUy5jb250ZXh0V2luZG93O1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgIC5zZXROYW1lKFwiRW5hYmxlIFRvb2wgVXNlIChFeHBlcmltZW50YWwpXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIkFsbG93IEFJIG1vZGVscyB0byB1c2UgcmVnaXN0ZXJlZCB0b29scy9hZ2VudHMgdG8gcGVyZm9ybSBhY3Rpb25zLiBSZXF1aXJlcyBjb21wYXRpYmxlIG1vZGVscyAoZS5nLiwgTGxhbWEgMy4xLCBzb21lIE1pc3RyYWwgbW9kZWxzKS5cIilcclxuICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVUb29sVXNlKVxyXG4gICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlVG9vbFVzZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgLy8g0JzQvtC20LvQuNCy0L4sINC/0L7RgtGA0ZbQsdC90L4g0YHQv9C+0LLRltGB0YLQuNGC0LggT2xsYW1hU2VydmljZSDQsNCx0L4gUHJvbXB0U2VydmljZSDQv9GA0L4g0LfQvNGW0L3Rg1xyXG4gICAgICAgICAgICAgIH0pKTtcclxuXHJcblxyXG4gICAgICAvLyBWaWV3IEJlaGF2aW9yICjQv9C10YDQtdC80ZbRidC10L3QvilcclxuICAgICAgdGhpcy5jcmVhdGVHcm91cEhlYWRlcihcIlZpZXcgQmVoYXZpb3JcIik7XHJcbiAgICAgIC8vIC4uLiAo0ZbRgdC90YPRjtGH0ZYg0L3QsNC70LDRiNGC0YPQstCw0L3QvdGPIG9wZW5DaGF0SW5UYWIsIG1heE1lc3NhZ2VIZWlnaHQsIHNpZGViYXJXaWR0aD8pXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgLnNldE5hbWUoXCJPcGVuIENoYXQgaW4gTWFpbiBUYWJcIilcclxuICAgICAgICAgIC5zZXREZXNjKFwiT046IE9wZW4gaW4gYSBtYWluIHRhYi4gT0ZGOiBPcGVuIGluIHRoZSByaWdodCBzaWRlYmFyLlwiKVxyXG4gICAgICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5DaGF0SW5UYWIpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5DaGF0SW5UYWIgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiQ2hhdCB2aWV3IGxvY2F0aW9uIHNldHRpbmcgc2F2ZWQuIFJlLW9wZW4gdGhlIHZpZXcgdG8gYXBwbHkuXCIsIDUwMDApO1xyXG4gICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAuc2V0TmFtZShcIk1heCBNZXNzYWdlIEhlaWdodCAocGl4ZWxzKVwiKVxyXG4gICAgICAgICAgLnNldERlc2MoXCJDb2xsYXBzZSBsb25nZXIgbWVzc2FnZXMgd2l0aCAnU2hvdyBNb3JlJy4gMCBkaXNhYmxlcy5cIilcclxuICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIkV4YW1wbGU6IDMwMFwiKVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXhNZXNzYWdlSGVpZ2h0LnRvU3RyaW5nKCkpXHJcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICBjb25zdCBudW0gPSBwYXJzZUludCh2YWx1ZS50cmltKCksIDEwKTtcclxuICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubWF4TWVzc2FnZUhlaWdodCA9ICFpc05hTihudW0pICYmIG51bSA+PSAwID8gbnVtIDogREVGQVVMVF9TRVRUSU5HUy5tYXhNZXNzYWdlSGVpZ2h0O1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4udmlldz8uY2hlY2tBbGxNZXNzYWdlc0ZvckNvbGxhcHNpbmc/LigpO1xyXG4gICAgICAgICAgICAgIH0pKTtcclxuICAgICAgLy8gVE9ETzog0JTQvtC00LDRgtC4INC90LDQu9Cw0YjRgtGD0LLQsNC90L3RjyDRiNC40YDQuNC90Lgg0YHQsNC50LTQsdCw0YDRgywg0Y/QutGJ0L4g0LLQvtC90L4g0YDQtdCw0LvRltC30L7QstCw0L3QvlxyXG5cclxuXHJcbiAgICAgIC8vIEFwcGVhcmFuY2UgKNC/0LXRgNC10LzRltGJ0LXQvdC+KVxyXG4gICAgICB0aGlzLmNyZWF0ZUdyb3VwSGVhZGVyKFwiQXBwZWFyYW5jZVwiKTtcclxuICAgICAgLy8gLi4uICjRltGB0L3Rg9GO0YfRliDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8gdXNlckF2YXRhciwgYWlBdmF0YXIsIGZpeEJyb2tlbkVtb2ppcylcclxuICAgICAgLy8gVXNlciBBdmF0YXJcclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJVc2VyIEF2YXRhciBTdHlsZVwiKS5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxyXG4gICAgICAgICAgLmFkZE9wdGlvbihcImluaXRpYWxzXCIsIFwiSW5pdGlhbHNcIilcclxuICAgICAgICAgIC5hZGRPcHRpb24oXCJpY29uXCIsIFwiSWNvblwiKVxyXG4gICAgICAgICAgLmFkZE9wdGlvbihcImltYWdlXCIsIFwiSW1hZ2UgKFZhdWx0IFBhdGgpXCIpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckF2YXRhclR5cGUpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBBdmF0YXJUeXBlKSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckF2YXRhclR5cGUgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTsgLy8g0J/QtdGA0LXQvNCw0LvRjtCy0LDRgtC4INC90LDQu9Cw0YjRgtGD0LLQsNC90L3Rj1xyXG4gICAgICAgICAgfSkpO1xyXG4gICAgICBjb25zdCB1c2VyQXZhdGFyU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXREZXNjKFwiIFwiKTsgLy8g0J/Rg9GB0YLQuNC5INC+0L/QuNGBINC00LvRjyDQstC40YDRltCy0L3RjtCy0LDQvdC90Y9cclxuICAgICAgdXNlckF2YXRhclNldHRpbmcuY29udHJvbEVsLmFkZENsYXNzKFwiYWktZm9yZ2UtYXZhdGFyLWNvbnRlbnQtc2V0dGluZ1wiKTtcclxuICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJBdmF0YXJUeXBlID09PSBcImluaXRpYWxzXCIpIHtcclxuICAgICAgICAgIHVzZXJBdmF0YXJTZXR0aW5nLnNldE5hbWUoXCJVc2VyIEluaXRpYWxzXCIpLnNldERlc2MoXCJNYXggMiBjaGFycy5cIik7XHJcbiAgICAgICAgICB1c2VyQXZhdGFyU2V0dGluZy5hZGRUZXh0KHRleHQgPT4gdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VyQXZhdGFyQ29udGVudCkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckF2YXRhckNvbnRlbnQgPSB2YWx1ZS50cmltKCkuc3Vic3RyaW5nKDAsIDIpIHx8IERFRkFVTFRfU0VUVElOR1MudXNlckF2YXRhckNvbnRlbnQ7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KSk7XHJcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckF2YXRhclR5cGUgPT09IFwiaWNvblwiKSB7XHJcbiAgICAgICAgICB1c2VyQXZhdGFyU2V0dGluZy5zZXROYW1lKFwiVXNlciBJY29uIElEXCIpLnNldERlc2MoJ09ic2lkaWFuIGljb24gSUQgKGUuZy4sIFwidXNlclwiKS4nKTtcclxuICAgICAgICAgIHVzZXJBdmF0YXJTZXR0aW5nLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwidXNlclwiKVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VyQXZhdGFyQ29udGVudClcclxuICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJBdmF0YXJDb250ZW50ID0gdmFsdWUudHJpbSgpIHx8IFwidXNlclwiO1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB9KSk7XHJcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckF2YXRhclR5cGUgPT09IFwiaW1hZ2VcIikge1xyXG4gICAgICAgICAgdXNlckF2YXRhclNldHRpbmcuc2V0TmFtZShcIlVzZXIgQXZhdGFyIEltYWdlIFBhdGhcIik7XHJcbiAgICAgICAgICB1c2VyQXZhdGFyU2V0dGluZy5zZXREZXNjKFwiRnVsbCBwYXRoIHRvIHRoZSBpbWFnZSBmaWxlIChwbmcvanBlZy9qcGcpIHdpdGhpbiB5b3VyIHZhdWx0LlwiKTtcclxuICAgICAgICAgIHVzZXJBdmF0YXJTZXR0aW5nLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiZS5nLiwgQXNzZXRzL0ltYWdlcy91c2VyLnBuZ1wiKVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VyQXZhdGFyQ29udGVudClcclxuICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkpO1xyXG4gICAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZFBhdGggPT09IFwiXCIgfHwgL1xcLihwbmd8anBnfGpwZWcpJC9pLnRlc3Qobm9ybWFsaXplZFBhdGgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VyQXZhdGFyQ29udGVudCA9IG5vcm1hbGl6ZWRQYXRoO1xyXG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkludmFsaWQgcGF0aC4gUGxlYXNlIHByb3ZpZGUgYSBwYXRoIHRvIGEgLnBuZyBvciAuanBlZy9qcGcgZmlsZSwgb3IgbGVhdmUgZW1wdHkuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VyQXZhdGFyQ29udGVudCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgfSkpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBBSSBBdmF0YXJcclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJBSSBBdmF0YXIgU3R5bGVcIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cclxuICAgICAgICAgIC5hZGRPcHRpb24oXCJpbml0aWFsc1wiLCBcIkluaXRpYWxzXCIpXHJcbiAgICAgICAgICAuYWRkT3B0aW9uKFwiaWNvblwiLCBcIkljb25cIilcclxuICAgICAgICAgIC5hZGRPcHRpb24oXCJpbWFnZVwiLCBcIkltYWdlIChWYXVsdCBQYXRoKVwiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmFpQXZhdGFyVHlwZSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IEF2YXRhclR5cGUpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5haUF2YXRhclR5cGUgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcclxuICAgICAgICAgIH0pKTtcclxuICAgICAgY29uc3QgYWlBdmF0YXJTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldERlc2MoXCIgXCIpO1xyXG4gICAgICBhaUF2YXRhclNldHRpbmcuY29udHJvbEVsLmFkZENsYXNzKFwiYWktZm9yZ2UtYXZhdGFyLWNvbnRlbnQtc2V0dGluZ1wiKTtcclxuICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmFpQXZhdGFyVHlwZSA9PT0gXCJpbml0aWFsc1wiKSB7XHJcbiAgICAgICAgICBhaUF2YXRhclNldHRpbmcuc2V0TmFtZShcIkFJIEluaXRpYWxzXCIpLnNldERlc2MoXCJNYXggMiBjaGFycy5cIik7XHJcbiAgICAgICAgICBhaUF2YXRhclNldHRpbmcuYWRkVGV4dCh0ZXh0ID0+IHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlBdmF0YXJDb250ZW50KS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5haUF2YXRhckNvbnRlbnQgPSB2YWx1ZS50cmltKCkuc3Vic3RyaW5nKDAsIDIpIHx8IERFRkFVTFRfU0VUVElOR1MuYWlBdmF0YXJDb250ZW50O1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSkpO1xyXG4gICAgICB9IGVsc2UgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmFpQXZhdGFyVHlwZSA9PT0gXCJpY29uXCIpIHtcclxuICAgICAgICAgIGFpQXZhdGFyU2V0dGluZy5zZXROYW1lKFwiQUkgSWNvbiBJRFwiKS5zZXREZXNjKCdPYnNpZGlhbiBpY29uIElEIChlLmcuLCBcImJvdFwiKS4nKTtcclxuICAgICAgICAgIGFpQXZhdGFyU2V0dGluZy5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImJvdFwiKVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5haUF2YXRhckNvbnRlbnQpXHJcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5haUF2YXRhckNvbnRlbnQgPSB2YWx1ZS50cmltKCkgfHwgXCJib3RcIjtcclxuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgfSkpO1xyXG4gICAgICB9IGVsc2UgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmFpQXZhdGFyVHlwZSA9PT0gXCJpbWFnZVwiKSB7XHJcbiAgICAgICAgICBhaUF2YXRhclNldHRpbmcuc2V0TmFtZShcIkFJIEF2YXRhciBJbWFnZSBQYXRoXCIpO1xyXG4gICAgICAgICAgYWlBdmF0YXJTZXR0aW5nLnNldERlc2MoXCJGdWxsIHBhdGggdG8gdGhlIGltYWdlIGZpbGUgKHBuZy9qcGVnL2pwZykgd2l0aGluIHlvdXIgdmF1bHQuXCIpO1xyXG4gICAgICAgICAgYWlBdmF0YXJTZXR0aW5nLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiZS5nLiwgQXNzZXRzL0ltYWdlcy9haS5wbmdcIilcclxuICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlBdmF0YXJDb250ZW50KVxyXG4gICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSk7XHJcbiAgICAgICAgICAgICAgICAgIGlmIChub3JtYWxpemVkUGF0aCA9PT0gXCJcIiB8fCAvXFwuKHBuZ3xqcGd8anBlZykkL2kudGVzdChub3JtYWxpemVkUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFpQXZhdGFyQ29udGVudCA9IG5vcm1hbGl6ZWRQYXRoO1xyXG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkludmFsaWQgcGF0aC4gUGxlYXNlIHByb3ZpZGUgYSBwYXRoIHRvIGEgLnBuZyBvciAuanBlZy9qcGcgZmlsZSwgb3IgbGVhdmUgZW1wdHkuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5haUF2YXRhckNvbnRlbnQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgIH0pKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAuc2V0TmFtZShcIkZpeCBCcm9rZW4gRW1vamlzXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIlJlcGxhY2UgY2VydGFpbiBlbW9qaSBzZXF1ZW5jZXMgdGhhdCBtb2RlbHMgbWlnaHQgYnJlYWsgKGUuZy4sIPCfpJYpLlwiKVxyXG4gICAgICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZpeEJyb2tlbkVtb2ppcykub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmZpeEJyb2tlbkVtb2ppcyA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSkpO1xyXG5cclxuXHJcbiAgICAgIC8vIDIuIENvbnRlbnQgJiBLbm93bGVkZ2VcclxuICAgICAgdGhpcy5jcmVhdGVTZWN0aW9uSGVhZGVyKFwiQ29udGVudCAmIEtub3dsZWRnZVwiKTtcclxuXHJcbiAgICAgIC8vIFJvbGVzICYgUGVyc29uYXMgKNC/0LXRgNC10LzRltGJ0LXQvdC+KVxyXG4gICAgICB0aGlzLmNyZWF0ZUdyb3VwSGVhZGVyKFwiUm9sZXMgJiBQZXJzb25hc1wiKTtcclxuICAgICAgLy8gLi4uICjRltGB0L3Rg9GO0YfRliDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8gdXNlclJvbGVzRm9sZGVyUGF0aCwgZm9sbG93Um9sZSlcclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAuc2V0TmFtZShcIkN1c3RvbSBSb2xlcyBGb2xkZXIgUGF0aFwiKVxyXG4gICAgICAgICAgLnNldERlc2MoXCJGb2xkZXIgd2l0aCBjdXN0b20gcm9sZSAoLm1kKSBmaWxlcy5cIilcclxuICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnVzZXJSb2xlc0ZvbGRlclBhdGgpXHJcbiAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJSb2xlc0ZvbGRlclBhdGgpXHJcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VyUm9sZXNGb2xkZXJQYXRoID1cclxuICAgICAgICAgICAgICAgICAgICAgIG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpKSB8fCBERUZBVUxUX1NFVFRJTkdTLnVzZXJSb2xlc0ZvbGRlclBhdGg7XHJcbiAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLmRlYm91bmNlZFVwZGF0ZVJvbGVQYXRoKCk7XHJcbiAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAuc2V0TmFtZShcIkFsd2F5cyBBcHBseSBTZWxlY3RlZCBSb2xlXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIkFsd2F5cyB1c2UgdGhlIHNlbGVjdGVkIHJvbGUgYXMgc3lzdGVtIHByb21wdC5cIilcclxuICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xsb3dSb2xlKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xsb3dSb2xlID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KSk7XHJcblxyXG5cclxuICAgICAgLy8gUmV0cmlldmFsLUF1Z21lbnRlZCBHZW5lcmF0aW9uIChSQUcpICjQv9C10YDQtdC80ZbRidC10L3QvilcclxuICAgICAgdGhpcy5jcmVhdGVHcm91cEhlYWRlcihcIlJldHJpZXZhbC1BdWdtZW50ZWQgR2VuZXJhdGlvbiAoUkFHKVwiKTtcclxuICAgICAgLy8gLi4uICjRltGB0L3Rg9GO0YfRliDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8gUkFHKVxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgIC5zZXROYW1lKFwiRW5hYmxlIFJBR1wiKVxyXG4gICAgICAgICAgLnNldERlc2MoXCJBbGxvdyByZXRyaWV2aW5nIGluZm8gZnJvbSBub3RlcyBmb3IgY29udGV4dC5cIilcclxuICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdFbmFibGVkKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdFbmFibGVkID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICAgICAgaWYgKHZhbHVlKSB0aGlzLmRlYm91bmNlZFVwZGF0ZVJhZ1BhdGgoKTtcclxuICAgICAgICAgIH0pKTtcclxuICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0VuYWJsZWQpIHtcclxuICAgICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgICAgIC5zZXROYW1lKFwiUkFHIERvY3VtZW50cyBGb2xkZXIgUGF0aFwiKVxyXG4gICAgICAgICAgICAgIC5zZXREZXNjKFwiRm9sZGVyIHdpdGggbm90ZXMgZm9yIFJBRy5cIilcclxuICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MucmFnRm9sZGVyUGF0aClcclxuICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0ZvbGRlclBhdGgpXHJcbiAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0ZvbGRlclBhdGggPSBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSkgfHwgREVGQVVMVF9TRVRUSU5HUy5yYWdGb2xkZXJQYXRoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlYm91bmNlZFVwZGF0ZVJhZ1BhdGgoKTtcclxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnVwZGF0ZURhaWx5VGFza0ZpbGVQYXRoPy4oKTsgLy8g0J7QvdC+0LLQu9C10L3QvdGPINGI0LvRj9GF0YMg0LTQviDRhNCw0LnQu9GDINC30LDQstC00LDQvdGMLCDRj9C60YnQviDQv9GA0L7QtNGD0LrRgtC40LLQvdGW0YHRgtGMINGD0LLRltC80LrQvdC10L3QsFxyXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9hZEFuZFByb2Nlc3NJbml0aWFsVGFza3M/LigpOyAvLyDQn9C10YDQtdC30LDQstCw0L3RgtCw0LbQtdC90L3RjyDQt9Cw0LLQtNCw0L3RjFxyXG4gICAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgICAgLnNldE5hbWUoXCJFbmFibGUgU2VtYW50aWMgU2VhcmNoXCIpXHJcbiAgICAgICAgICAgICAgLnNldERlc2MoXCJVc2UgZW1iZWRkaW5ncyAobW9yZSBhY2N1cmF0ZSkuIElmIE9GRiwgdXNlcyBrZXl3b3JkIHNlYXJjaC5cIilcclxuICAgICAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlU2VtYW50aWNTZWFyY2gpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdFbmFibGVTZW1hbnRpY1NlYXJjaCA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMuZGVib3VuY2VkVXBkYXRlUmFnUGF0aCgpO1xyXG4gICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlU2VtYW50aWNTZWFyY2gpIHtcclxuICAgICAgICAgICAgICBsZXQgZW1iZWRkaW5nRHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgY29uc3QgdXBkYXRlRW1iZWRkaW5nT3B0aW9ucyA9IGFzeW5jIChkcm9wZG93bjogRHJvcGRvd25Db21wb25lbnQgfCBudWxsLCBidXR0b24/OiBFeHRyYUJ1dHRvbkNvbXBvbmVudCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICBpZiAoIWRyb3Bkb3duKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzVmFsdWUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdFbWJlZGRpbmdNb2RlbDtcclxuICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2VsZWN0RWwuaW5uZXJIVE1MID0gXCJcIjtcclxuICAgICAgICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiTG9hZGluZyBtb2RlbHMuLi5cIik7XHJcbiAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNldERpc2FibGVkKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICBidXR0b24/LnNldERpc2FibGVkKHRydWUpLnNldEljb24oXCJsb2FkZXJcIik7XHJcbiAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdldE1vZGVscygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2VsZWN0RWwuaW5uZXJIVE1MID0gXCJcIjtcclxuICAgICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIi0tIFNlbGVjdCBFbWJlZGRpbmcgTW9kZWwgLS1cIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjb21tb25FbWJlZE1vZGVscyA9IFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJub21pYy1lbWJlZC10ZXh0XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYWxsLW1pbmlsbVwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBcIm14YmFpLWVtYmVkLWxhcmdlXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYmdlLWJhc2UtZW5cIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJndGUtYmFzZVwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgXTtcclxuICAgICAgICAgICAgICAgICAgICAgIGNvbW1vbkVtYmVkTW9kZWxzLmZvckVhY2gobW9kZWxOYW1lID0+IGRyb3Bkb3duLmFkZE9wdGlvbihtb2RlbE5hbWUsIG1vZGVsTmFtZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiLS0tXCIsIFwiLS0tIE90aGVyIEluc3RhbGxlZCBNb2RlbHMgLS0tXCIpLnNldERpc2FibGVkKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgaWYgKG1vZGVscyAmJiBtb2RlbHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVscy5mb3JFYWNoKG1vZGVsTmFtZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY29tbW9uRW1iZWRNb2RlbHMuaW5jbHVkZXMobW9kZWxOYW1lKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKG1vZGVsTmFtZSwgbW9kZWxOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVscy5pbmNsdWRlcyhwcmV2aW91c1ZhbHVlKSA/IHByZXZpb3VzVmFsdWUgOiBjb21tb25FbWJlZE1vZGVscy5sZW5ndGggPiAwID8gY29tbW9uRW1iZWRNb2RlbHNbMF0gOiBcIlwiXHJcbiAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGZldGNoaW5nIG1vZGVscyBmb3IgZW1iZWRkaW5nIGRyb3Bkb3duOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICBkcm9wZG93bi5zZWxlY3RFbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiRXJyb3IgbG9hZGluZyBtb2RlbHMhXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUocHJldmlvdXNWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBkcm9wZG93bi5zZXREaXNhYmxlZChmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICBidXR0b24/LnNldERpc2FibGVkKGZhbHNlKS5zZXRJY29uKFwicmVmcmVzaC1jd1wiKTtcclxuICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgICAgICAgIC5zZXROYW1lKFwiRW1iZWRkaW5nIE1vZGVsIE5hbWVcIilcclxuICAgICAgICAgICAgICAgICAgLnNldERlc2MoXCJPbGxhbWEgbW9kZWwgZm9yIGVtYmVkZGluZ3MuXCIpXHJcbiAgICAgICAgICAgICAgICAgIC5zZXRDbGFzcyhcIm9sbGFtYS1tb2RlbC1zZXR0aW5nLWNvbnRhaW5lclwiKVxyXG4gICAgICAgICAgICAgICAgICAuYWRkRHJvcGRvd24oYXN5bmMgKGRyb3Bkb3duKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBlbWJlZGRpbmdEcm9wZG93biA9IGRyb3Bkb3duO1xyXG4gICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24ub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW1iZWRkaW5nTW9kZWwgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRlYm91bmNlZFVwZGF0ZVJhZ1BhdGgoKTtcclxuICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdXBkYXRlRW1iZWRkaW5nT3B0aW9ucyhkcm9wZG93bik7XHJcbiAgICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAgIC5hZGRFeHRyYUJ1dHRvbihidXR0b24gPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgYnV0dG9uXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgLnNldEljb24oXCJyZWZyZXNoLWN3XCIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgLnNldFRvb2x0aXAoXCJSZWZyZXNoIG1vZGVsIGxpc3RcIilcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHVwZGF0ZUVtYmVkZGluZ09wdGlvbnMoZW1iZWRkaW5nRHJvcGRvd24sIGJ1dHRvbik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJNb2RlbCBsaXN0IHJlZnJlc2hlZCFcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAgICAgLnNldE5hbWUoXCJDaHVuayBTaXplIChDaGFyYWN0ZXJzKVwiKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0RGVzYyhcIlNpemUgb2YgdGV4dCBjaHVua3MgZm9yIGluZGV4aW5nLlwiKVxyXG4gICAgICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihTdHJpbmcoREVGQVVMVF9TRVRUSU5HUy5yYWdDaHVua1NpemUpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdDaHVua1NpemUpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLnRyaW0oKSwgMTApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0NodW5rU2l6ZSA9ICFpc05hTihudW0pICYmIG51bSA+IDUwID8gbnVtIDogREVGQVVMVF9TRVRUSU5HUy5yYWdDaHVua1NpemU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWJvdW5jZWRVcGRhdGVSYWdQYXRoKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0TmFtZShcIlNpbWlsYXJpdHkgVGhyZXNob2xkXCIpXHJcbiAgICAgICAgICAgICAgICAgIC5zZXREZXNjKFwiTWluIHJlbGV2YW5jZSBzY29yZSAoMC4wLTEuMCkuIEhpZ2hlciA9IHN0cmljdGVyIG1hdGNoaW5nLlwiKVxyXG4gICAgICAgICAgICAgICAgICAuYWRkU2xpZGVyKChzbGlkZXI6IFNsaWRlckNvbXBvbmVudCkgPT4gc2xpZGVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAuc2V0TGltaXRzKDAsIDEsIDAuMDUpXHJcbiAgICAgICAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnU2ltaWxhcml0eVRocmVzaG9sZClcclxuICAgICAgICAgICAgICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnU2ltaWxhcml0eVRocmVzaG9sZCA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAgICAgLnNldE5hbWUoXCJUb3AgSyBSZXN1bHRzXCIpXHJcbiAgICAgICAgICAgICAgICAgIC5zZXREZXNjKFwiTWF4IG51bWJlciBvZiByZWxldmFudCBjaHVua3MgdG8gcmV0cmlldmUuXCIpXHJcbiAgICAgICAgICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFN0cmluZyhERUZBVUxUX1NFVFRJTkdTLnJhZ1RvcEspKVxyXG4gICAgICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdUb3BLKSlcclxuICAgICAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBudW0gPSBwYXJzZUludCh2YWx1ZS50cmltKCksIDEwKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdUb3BLID0gIWlzTmFOKG51bSkgJiYgbnVtID4gMCA/IG51bSA6IERFRkFVTFRfU0VUVElOR1MucmFnVG9wSztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICAgIH0pKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAuc2V0TmFtZShcIk1heCBDaGFycyBQZXIgRG9jdW1lbnQgKER1cmluZyBDb250ZXh0IEJ1aWxkKVwiKVxyXG4gICAgICAgICAgICAgIC5zZXREZXNjKFwiTGltaXRzIGNoYXJhY3RlcnMgaW5jbHVkZWQgcGVyIHJldHJpZXZlZCBkb2N1bWVudCBpbiB0aGUgZmluYWwgcHJvbXB0ICgwPW5vIGxpbWl0KS5cIilcclxuICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFN0cmluZyhERUZBVUxUX1NFVFRJTkdTLm1heENoYXJzUGVyRG9jKSlcclxuICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXhDaGFyc1BlckRvYykpXHJcbiAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLnRyaW0oKSwgMTApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubWF4Q2hhcnNQZXJEb2MgPSAhaXNOYU4obnVtKSAmJiBudW0gPj0gMCA/IG51bSA6IERFRkFVTFRfU0VUVElOR1MubWF4Q2hhcnNQZXJEb2M7XHJcbiAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgfSkpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyAzLiBGZWF0dXJlc1xyXG4gICAgICB0aGlzLmNyZWF0ZVNlY3Rpb25IZWFkZXIoXCJGZWF0dXJlc1wiKTtcclxuXHJcbiAgICAgIC8vIEFkdmFuY2VkIENvbnRleHQgTWFuYWdlbWVudCAoU3VtbWFyaXphdGlvbikgKNC/0LXRgNC10LzRltGJ0LXQvdC+KVxyXG4gICAgICB0aGlzLmNyZWF0ZUdyb3VwSGVhZGVyKFwiQWR2YW5jZWQgQ29udGV4dCBNYW5hZ2VtZW50IChTdW1tYXJpemF0aW9uKVwiKTtcclxuICAgICAgLy8gLi4uICjRltGB0L3Rg9GO0YfRliDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8gdXNlQWR2YW5jZWRDb250ZXh0U3RyYXRlZ3ksIGVuYWJsZVN1bW1hcml6YXRpb24sIHN1bW1hcml6YXRpb25Qcm9tcHQsIGV0Yy4pXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgLnNldE5hbWUoXCJVc2UgQWR2YW5jZWQgQ29udGV4dCBTdHJhdGVneVwiKVxyXG4gICAgICAgICAgLnNldERlc2MoXCJFbmFibGUgYXV0b21hdGljIGNoYXQgc3VtbWFyaXphdGlvbiBhbmQgbWVzc2FnZSBjaHVua2luZyBmb3IgbG9uZyBjb252ZXJzYXRpb25zLlwiKVxyXG4gICAgICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZUFkdmFuY2VkQ29udGV4dFN0cmF0ZWd5KS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VBZHZhbmNlZENvbnRleHRTdHJhdGVneSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpOyAvLyBSZS1yZW5kZXIgc2V0dGluZ3MgdG8gc2hvdy9oaWRlIHN1bW1hcml6YXRpb24gb3B0aW9uc1xyXG4gICAgICAgICAgfSkpO1xyXG4gICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlQWR2YW5jZWRDb250ZXh0U3RyYXRlZ3kpIHtcclxuICAgICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgICAgIC5zZXROYW1lKFwiRW5hYmxlIENvbnRleHQgU3VtbWFyaXphdGlvblwiKVxyXG4gICAgICAgICAgICAgIC5zZXREZXNjKFwiQXV0b21hdGljYWxseSBzdW1tYXJpemUgb2xkZXIgcGFydHMgb2YgdGhlIGNvbnZlcnNhdGlvbi5cIilcclxuICAgICAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlU3VtbWFyaXphdGlvbikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVN1bW1hcml6YXRpb24gPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpOyAvLyBSZS1yZW5kZXIgdG8gc2hvdy9oaWRlIHByb21wdFxyXG4gICAgICAgICAgICAgIH0pKTtcclxuICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVTdW1tYXJpemF0aW9uKSB7XHJcbiAgICAgICAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgICAgICAgIC5zZXROYW1lKFwiU3VtbWFyaXphdGlvbiBQcm9tcHRcIilcclxuICAgICAgICAgICAgICAgICAgLnNldERlc2MoXCJQcm9tcHQgdXNlZCBmb3Igc3VtbWFyaXphdGlvbi4gVXNlIHt0ZXh0X3RvX3N1bW1hcml6ZX0gcGxhY2Vob2xkZXIuXCIpXHJcbiAgICAgICAgICAgICAgICAgIC5hZGRUZXh0QXJlYSh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnN1bW1hcml6YXRpb25Qcm9tcHQpXHJcbiAgICAgICAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvblByb21wdClcclxuICAgICAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uUHJvbXB0ID0gdmFsdWUgfHwgREVGQVVMVF9TRVRUSU5HUy5zdW1tYXJpemF0aW9uUHJvbXB0O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgICAgICAgIC5pbnB1dEVsLnNldEF0dHJzKHsgcm93czogNCB9KSk7XHJcblxyXG4gICAgICAgICAgICAgIC8vIC0tLSDQktC40LHRltGAINC80L7QtNC10LvRliDQtNC70Y8g0YHRg9C80LDRgNC40LfQsNGG0ZbRlyAtLS1cclxuICAgICAgICAgICAgICBsZXQgc3VtbWFyaXphdGlvbk1vZGVsRHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgY29uc3QgdXBkYXRlU3VtbWFyaXphdGlvbk9wdGlvbnMgPSBhc3luYyAoZHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCwgYnV0dG9uPzogRXh0cmFCdXR0b25Db21wb25lbnQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgaWYgKCFkcm9wZG93bikgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50VmFsID0gdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvbk1vZGVsTmFtZTtcclxuICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2VsZWN0RWwuaW5uZXJIVE1MID0gXCJcIjtcclxuICAgICAgICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiTG9hZGluZyBtb2RlbHMuLi5cIik7XHJcbiAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNldERpc2FibGVkKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICBidXR0b24/LnNldERpc2FibGVkKHRydWUpLnNldEljb24oXCJsb2FkZXJcIik7XHJcbiAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdldE1vZGVscygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2VsZWN0RWwuaW5uZXJIVE1MID0gXCJcIjtcclxuICAgICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIi0tIFNlbGVjdCBTdW1tYXJpemF0aW9uIE1vZGVsIC0tXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgaWYgKG1vZGVscyAmJiBtb2RlbHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVscy5mb3JFYWNoKG1vZGVsTmFtZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihtb2RlbE5hbWUsIG1vZGVsTmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUobW9kZWxzLmluY2x1ZGVzKGN1cnJlbnRWYWwpID8gY3VycmVudFZhbCA6IFwiXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oXCJcIiwgXCJObyBtb2RlbHMgZm91bmRcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUoXCJcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciBmZXRjaGluZyBtb2RlbHMgZm9yIHN1bW1hcml6YXRpb24gc2V0dGluZ3M6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgICAgICAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oXCJcIiwgXCJFcnJvciBsb2FkaW5nIG1vZGVscyFcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZShcIlwiKTtcclxuICAgICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNldERpc2FibGVkKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbj8uc2V0RGlzYWJsZWQoZmFsc2UpLnNldEljb24oXCJyZWZyZXNoLWN3XCIpO1xyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAgICAgLnNldE5hbWUoXCJTdW1tYXJpemF0aW9uIE1vZGVsXCIpXHJcbiAgICAgICAgICAgICAgICAgIC5zZXREZXNjKFwiTW9kZWwgdXNlZCBmb3Igc3VtbWFyaXppbmcgY2hhdCBoaXN0b3J5IGFuZCBpbmRpdmlkdWFsIG1lc3NhZ2VzLlwiKVxyXG4gICAgICAgICAgICAgICAgICAuYWRkRHJvcGRvd24oYXN5bmMgKGRyb3Bkb3duKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBzdW1tYXJpemF0aW9uTW9kZWxEcm9wZG93biA9IGRyb3Bkb3duO1xyXG4gICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24ub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvbk1vZGVsTmFtZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB1cGRhdGVTdW1tYXJpemF0aW9uT3B0aW9ucyhkcm9wZG93bik7IC8vIEluaXRpYWwgbG9hZFxyXG4gICAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgICAuYWRkRXh0cmFCdXR0b24oYnV0dG9uID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXRJY29uKFwicmVmcmVzaC1jd1wiKS5zZXRUb29sdGlwKFwiUmVmcmVzaCBtb2RlbCBsaXN0XCIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4geyBhd2FpdCB1cGRhdGVTdW1tYXJpemF0aW9uT3B0aW9ucyhzdW1tYXJpemF0aW9uTW9kZWxEcm9wZG93biwgYnV0dG9uKTsgbmV3IE5vdGljZShcIk1vZGVsIGxpc3QgcmVmcmVzaGVkIVwiKTsgfSk7XHJcbiAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAgICAgLnNldE5hbWUoXCJLZWVwIExhc3QgTiBNZXNzYWdlcyBCZWZvcmUgU3VtbWFyeVwiKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0RGVzYyhcIk51bWJlciBvZiByZWNlbnQgbWVzc2FnZXMgZXhjbHVkZWQgZnJvbSBzdW1tYXJpemF0aW9uLlwiKVxyXG4gICAgICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmtlZXBMYXN0Tk1lc3NhZ2VzQmVmb3JlU3VtbWFyeS50b1N0cmluZygpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmtlZXBMYXN0Tk1lc3NhZ2VzQmVmb3JlU3VtbWFyeS50b1N0cmluZygpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLnRyaW0oKSwgMTApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmtlZXBMYXN0Tk1lc3NhZ2VzQmVmb3JlU3VtbWFyeSA9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICFpc05hTihudW0pICYmIG51bSA+PSAwID8gbnVtIDogREVGQVVMVF9TRVRUSU5HUy5rZWVwTGFzdE5NZXNzYWdlc0JlZm9yZVN1bW1hcnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAgICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0TmFtZShcIkZhbGxiYWNrIFN1bW1hcml6YXRpb24gTW9kZWxcIilcclxuICAgICAgICAgICAgICAgICAgLnNldERlc2MoXCJPcHRpb25hbC4gTW9kZWwgdG8gdXNlIGlmIHRoZSBwcmltYXJ5IHN1bW1hcml6YXRpb24gbW9kZWwgaXMgbm90IHNldCBvciBub3QgZm91bmQuIFVzZXMgdGhlIG1haW4gT2xsYW1hIHNlcnZlci5cIilcclxuICAgICAgICAgICAgICAgICAgLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJlLmcuLCBvcmNhLW1pbmkgb3IgbGVhdmUgZW1wdHlcIilcclxuICAgICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mYWxsYmFja1N1bW1hcml6YXRpb25Nb2RlbE5hbWUpXHJcbiAgICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZmFsbGJhY2tTdW1tYXJpemF0aW9uTW9kZWxOYW1lID0gdmFsdWUudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgfSkpO1xyXG4gICAgICAgICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0TmFtZShcIlN1bW1hcml6YXRpb24gQ2h1bmsgU2l6ZSAoVG9rZW5zKVwiKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0RGVzYyhcIkFwcHJveGltYXRlIHNpemUgb2YgdGV4dCBjaHVua3MgcGFzc2VkIHRvIHRoZSBzdW1tYXJpemF0aW9uIG1vZGVsLlwiKVxyXG4gICAgICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnN1bW1hcml6YXRpb25DaHVua1NpemUudG9TdHJpbmcoKSlcclxuICAgICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uQ2h1bmtTaXplLnRvU3RyaW5nKCkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbnVtID0gcGFyc2VJbnQodmFsdWUudHJpbSgpLCAxMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvbkNodW5rU2l6ZSA9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICFpc05hTihudW0pICYmIG51bSA+IDEwMCA/IG51bSA6IERFRkFVTFRfU0VUVElOR1Muc3VtbWFyaXphdGlvbkNodW5rU2l6ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICAgIH0pKTtcclxuICAgICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gUHJvZHVjdGl2aXR5IEFzc2lzdGFudCBGZWF0dXJlcyAo0L/QtdGA0LXQvNGW0YnQtdC90L4pXHJcbiAgICAgIHRoaXMuY3JlYXRlR3JvdXBIZWFkZXIoXCJQcm9kdWN0aXZpdHkgQXNzaXN0YW50IEZlYXR1cmVzXCIpO1xyXG4gICAgICAvLyAuLi4gKNGW0YHQvdGD0Y7Rh9GWINC90LDQu9Cw0YjRgtGD0LLQsNC90L3RjyBlbmFibGVQcm9kdWN0aXZpdHlGZWF0dXJlcywgZGFpbHlUYXNrRmlsZU5hbWUpXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgLnNldE5hbWUoXCJFbmFibGUgUHJvZHVjdGl2aXR5IEZlYXR1cmVzXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIkFjdGl2YXRlIGRhaWx5IHRhc2sgaW50ZWdyYXRpb24uXCIpXHJcbiAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4udXBkYXRlRGFpbHlUYXNrRmlsZVBhdGg/LigpO1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvYWRBbmRQcm9jZXNzSW5pdGlhbFRhc2tzPy4oKTtcclxuICAgICAgICAgIH0pKTtcclxuICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzKSB7XHJcbiAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAuc2V0TmFtZShcIkRhaWx5IFRhc2sgRmlsZSBOYW1lXCIpXHJcbiAgICAgICAgICAgICAgLnNldERlc2MoXCJGaWxlbmFtZSB3aXRoaW4gdGhlIFJBRyBmb2xkZXIgdXNlZCBmb3IgZGFpbHkgdGFza3MuXCIpXHJcbiAgICAgICAgICAgICAgLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmRhaWx5VGFza0ZpbGVOYW1lKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGFpbHlUYXNrRmlsZU5hbWUpXHJcbiAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmRhaWx5VGFza0ZpbGVOYW1lID0gdmFsdWUudHJpbSgpIHx8IERFRkFVTFRfU0VUVElOR1MuZGFpbHlUYXNrRmlsZU5hbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnVwZGF0ZURhaWx5VGFza0ZpbGVQYXRoPy4oKTtcclxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvYWRBbmRQcm9jZXNzSW5pdGlhbFRhc2tzPy4oKTtcclxuICAgICAgICAgICAgICAgICAgfSkpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAgLy8gV2VhdGhlciBBZ2VudCBTZXR0aW5ncyAo0J3QntCS0JAg0JPQoNCj0J/QkCEpXHJcbiAgICAgIHRoaXMuY3JlYXRlR3JvdXBIZWFkZXIoXCJXZWF0aGVyIEFnZW50IFNldHRpbmdzXCIpO1xyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAuc2V0TmFtZShcIk9wZW5XZWF0aGVyTWFwIEFQSSBLZXlcIilcclxuICAgICAgICAgICAuc2V0RGVzYyhcIllvdXIgQVBJIGtleSBmcm9tIE9wZW5XZWF0aGVyTWFwLiBSZXF1aXJlZCBmb3Igd2VhdGhlciBmb3JlY2FzdHMuIEtlZXAgY29uZmlkZW50aWFsLlwiKVxyXG4gICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJZT1VSX09QRU5XRUFUSEVSTUFQX0FQSV9LRVlcIilcclxuICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5XZWF0aGVyTWFwQXBpS2V5KVxyXG4gICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuV2VhdGhlck1hcEFwaUtleSA9IHZhbHVlLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgLy8g0J3QtdC80LDRlCDQvdC10L7QsdGF0ZbQtNC90L7RgdGC0ZYg0L/QtdGA0LXQt9Cw0LLQsNC90YLQsNC20YPQstCw0YLQuCDRidC+0YHRjCwg0LDQs9C10L3RgiDQv9GA0L7Rh9C40YLQsNGUINC90L7QstC1INC30L3QsNGH0LXQvdC90Y8g0L/RgNC4INC90LDRgdGC0YPQv9C90L7QvNGDINCy0LjQutC70LjQutGDXHJcbiAgICAgICAgICAgICAgIH0pKTtcclxuICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgIC5zZXROYW1lKFwiRGVmYXVsdCBMb2NhdGlvblwiKVxyXG4gICAgICAgICAgIC5zZXREZXNjKFwiRGVmYXVsdCBjaXR5IG9yIGxvY2F0aW9uIGZvciB3ZWF0aGVyIGZvcmVjYXN0cyBpZiBub3Qgc3BlY2lmaWVkIGluIHRoZSBxdWVyeS5cIilcclxuICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Mud2VhdGhlckRlZmF1bHRMb2NhdGlvbilcclxuICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLndlYXRoZXJEZWZhdWx0TG9jYXRpb24pXHJcbiAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLndlYXRoZXJEZWZhdWx0TG9jYXRpb24gPSB2YWx1ZS50cmltKCk7XHJcbiAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgIC8vINCd0LXQvNCw0ZQg0L3QtdC+0LHRhdGW0LTQvdC+0YHRgtGWINC/0LXRgNC10LfQsNCy0LDQvdGC0LDQttGD0LLQsNGC0Lgg0YnQvtGB0YxcclxuICAgICAgICAgICAgICAgfSkpO1xyXG5cclxuXHJcbiAgICAgIC8vIFNwZWVjaCAmIFRyYW5zbGF0aW9uICjQv9C10YDQtdC80ZbRidC10L3QvilcclxuICAgICAgdGhpcy5jcmVhdGVHcm91cEhlYWRlcihcIlNwZWVjaCAmIFRyYW5zbGF0aW9uXCIpO1xyXG4gICAgICAvLyAuLi4gKNGW0YHQvdGD0Y7Rh9GWINC90LDQu9Cw0YjRgtGD0LLQsNC90L3RjyB0cmFuc2xhdGlvblByb3ZpZGVyLCBnb29nbGVUcmFuc2xhdGlvbkFwaUtleSwgb2xsYW1hVHJhbnNsYXRpb25Nb2RlbCwgZ29vZ2xlQXBpS2V5LCBzcGVlY2hMYW5ndWFnZSlcclxuXHJcbiAgICAgIC8vINCa0L7QvdGC0YDQvtC70Y7RlNC80L4gZW5hYmxlVHJhbnNsYXRpb24g0YfQtdGA0LXQtyB0cmFuc2xhdGlvblByb3ZpZGVyXHJcbiAgICAgIC8vIHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVRyYW5zbGF0aW9uID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MudHJhbnNsYXRpb25Qcm92aWRlciAhPT0gJ25vbmUnOyAvLyDQptC1INC80L7QttC90LAg0YDQvtCx0LjRgtC4INC/0YDQuCDQt9Cw0LLQsNC90YLQsNC20LXQvdC90ZYg0L3QsNC70LDRiNGC0YPQstCw0L3RjFxyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAuc2V0TmFtZShcIlRyYW5zbGF0aW9uIFByb3ZpZGVyXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIlNlbGVjdCB0aGUgc2VydmljZSBmb3IgbWVzc2FnZSBhbmQgaW5wdXQgdHJhbnNsYXRpb24uXCIpXHJcbiAgICAgICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cclxuICAgICAgICAgICAgICAuYWRkT3B0aW9uKCdub25lJywgJ0Rpc2FibGVkJylcclxuICAgICAgICAgICAgICAuYWRkT3B0aW9uKCdnb29nbGUnLCAnR29vZ2xlIFRyYW5zbGF0ZSBBUEknKVxyXG4gICAgICAgICAgICAgIC5hZGRPcHRpb24oJ29sbGFtYScsICdPbGxhbWEgKExvY2FsIE1vZGVsKScpXHJcbiAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uUHJvdmlkZXIpXHJcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogVHJhbnNsYXRpb25Qcm92aWRlcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblByb3ZpZGVyID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgIC8vINCS0LzQuNC60LDRlNC80L4v0LLQuNC80LjQutCw0ZTQvNC+INC30LDQs9Cw0LvRjNC90LjQuSDQv9C10YDQtdC80LjQutCw0Ycg0LfQsNC70LXQttC90L4g0LLRltC0INCy0LjQsdC+0YDRgyAo0LTQu9GPINGB0YPQvNGW0YHQvdC+0YHRgtGWINCw0LHQviDQu9C+0LPRltC60Lgg0L/Qu9Cw0LPRltC90LApXHJcbiAgICAgICAgICAgICAgICAgICAvLyDQkNCx0L4g0L/RgNC+0YHRgtC+INC/0L7QutC70LDQtNCw0ZTQvNC+0YHRjCDQvdCwIHRyYW5zbGF0aW9uUHJvdmlkZXIg0L3QsNC/0YDRj9C80YNcclxuICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlVHJhbnNsYXRpb24gPSB2YWx1ZSAhPT0gJ25vbmUnOyAvLyDQl9Cx0LXRgNGW0LPQsNGU0LzQviDQsiDRgdGC0LDRgNC1INC/0L7Qu9C1INGC0LXQtlxyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7IC8vINCf0LXRgNC10LzQsNC70Y7QstCw0YLQuCDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8sINGJ0L7QsSDQv9C+0LrQsNC30LDRgtC4L9GB0YXQvtCy0LDRgtC4INC30LDQu9C10LbQvdGWINC+0L/RhtGW0ZdcclxuICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICAvLyAtLS0g0KPQvNC+0LLQvdGWINC90LDQu9Cw0YjRgtGD0LLQsNC90L3RjyDQtNC70Y8gR29vZ2xlIFRyYW5zbGF0ZSAtLS1cclxuICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uUHJvdmlkZXIgPT09ICdnb29nbGUnKSB7XHJcbiAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAuc2V0TmFtZShcIlRhcmdldCBUcmFuc2xhdGlvbiBMYW5ndWFnZSAoR29vZ2xlKVwiKVxyXG4gICAgICAgICAgICAgIC5zZXREZXNjKFwiVHJhbnNsYXRlIG1lc3NhZ2VzL2lucHV0IGludG8gdGhpcyBsYW5ndWFnZSB1c2luZyBHb29nbGUuXCIpXHJcbiAgICAgICAgICAgICAgLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcclxuICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb2RlIGluIExBTkdVQUdFUykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKGNvZGUsIExBTkdVQUdFU1tjb2RlXSk7XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudHJhbnNsYXRpb25UYXJnZXRMYW5ndWFnZSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudHJhbnNsYXRpb25UYXJnZXRMYW5ndWFnZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgICAgLnNldE5hbWUoXCJHb29nbGUgQ2xvdWQgVHJhbnNsYXRpb24gQVBJIEtleVwiKVxyXG4gICAgICAgICAgICAgIC5zZXREZXNjKFwiUmVxdWlyZWQgZm9yIEdvb2dsZSB0cmFuc2xhdGlvbiBmZWF0dXJlLiBLZWVwIGNvbmZpZGVudGlhbC5cIilcclxuICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiRW50ZXIgQVBJIEtleVwiKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZ29vZ2xlVHJhbnNsYXRpb25BcGlLZXkpXHJcbiAgICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5nb29nbGVUcmFuc2xhdGlvbkFwaUtleSA9IHZhbHVlLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICB9KSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIC0tLSDQo9C80L7QstC90ZYg0L3QsNC70LDRiNGC0YPQstCw0L3QvdGPINC00LvRjyBPbGxhbWEgLS0tXHJcbiAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblByb3ZpZGVyID09PSAnb2xsYW1hJykge1xyXG4gICAgICAgICAgIGxldCBvbGxhbWFUcmFuc2xhdGlvbk1vZGVsRHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICAgICAgICAgY29uc3QgdXBkYXRlT2xsYW1hVHJhbnNsYXRpb25PcHRpb25zID0gYXN5bmMgKGRyb3Bkb3duOiBEcm9wZG93bkNvbXBvbmVudCB8IG51bGwsIGJ1dHRvbj86IEV4dHJhQnV0dG9uQ29tcG9uZW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgIGlmICghZHJvcGRvd24pIHJldHVybjtcclxuICAgICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLm9sbGFtYVRyYW5zbGF0aW9uTW9kZWw7XHJcbiAgICAgICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7IGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIkxvYWRpbmcgbW9kZWxzLi4uXCIpOyBkcm9wZG93bi5zZXREaXNhYmxlZCh0cnVlKTtcclxuICAgICAgICAgICAgICAgYnV0dG9uPy5zZXREaXNhYmxlZCh0cnVlKS5zZXRJY29uKFwibG9hZGVyXCIpO1xyXG4gICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgY29uc3QgbW9kZWxzID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZXRNb2RlbHMoKTtcclxuICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7IGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIi0tIFNlbGVjdCBPbGxhbWEgVHJhbnNsYXRpb24gTW9kZWwgLS1cIik7XHJcbiAgICAgICAgICAgICAgICAgICBpZiAobW9kZWxzICYmIG1vZGVscy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgbW9kZWxzLmZvckVhY2gobSA9PiBkcm9wZG93bi5hZGRPcHRpb24obSwgbSkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNldFZhbHVlKG1vZGVscy5pbmNsdWRlcyhjdXJyZW50VmFsKSA/IGN1cnJlbnRWYWwgOiBcIlwiKTtcclxuICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7IGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIk5vIG1vZGVscyBmb3VuZFwiKTsgZHJvcGRvd24uc2V0VmFsdWUoXCJcIik7IH1cclxuICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHsgLyogLi4uINC+0LHRgNC+0LHQutCwINC/0L7QvNC40LvQutC4IC4uLiAqL1xyXG4gICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiRXJyb3IgZmV0Y2hpbmcgbW9kZWxzIGZvciBPbGxhbWEgdHJhbnNsYXRpb24gc2V0dGluZ3M6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7IGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIkVycm9yIGxvYWRpbmcgbW9kZWxzIVwiKTsgZHJvcGRvd24uc2V0VmFsdWUoXCJcIik7XHJcbiAgICAgICAgICAgICAgIH0gZmluYWxseSB7IGRyb3Bkb3duLnNldERpc2FibGVkKGZhbHNlKTsgYnV0dG9uPy5zZXREaXNhYmxlZChmYWxzZSkuc2V0SWNvbihcInJlZnJlc2gtY3dcIik7IH1cclxuICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAgLnNldE5hbWUoXCJPbGxhbWEgVHJhbnNsYXRpb24gTW9kZWxcIilcclxuICAgICAgICAgICAgICAgLnNldERlc2MoXCJPbGxhbWEgbW9kZWwgdG8gdXNlIGZvciB0cmFuc2xhdGlvbiB0YXNrcy5cIilcclxuICAgICAgICAgICAgICAgLmFkZERyb3Bkb3duKGFzeW5jIChkcm9wZG93bikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgb2xsYW1hVHJhbnNsYXRpb25Nb2RlbERyb3Bkb3duID0gZHJvcGRvd247XHJcbiAgICAgICAgICAgICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vbGxhbWFUcmFuc2xhdGlvbk1vZGVsID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgIGF3YWl0IHVwZGF0ZU9sbGFtYVRyYW5zbGF0aW9uT3B0aW9ucyhkcm9wZG93bik7IC8vIEluaXRpYWwgbG9hZFxyXG4gICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAuYWRkRXh0cmFCdXR0b24oYnV0dG9uID0+IHtcclxuICAgICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXRJY29uKFwicmVmcmVzaC1jd1wiKS5zZXRUb29sdGlwKFwiUmVmcmVzaCBtb2RlbCBsaXN0XCIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4geyBhd2FpdCB1cGRhdGVPbGxhbWFUcmFuc2xhdGlvbk9wdGlvbnMob2xsYW1hVHJhbnNsYXRpb25Nb2RlbERyb3Bkb3duLCBidXR0b24pOyBuZXcgTm90aWNlKFwiTW9kZWwgbGlzdCByZWZyZXNoZWQhXCIpOyB9KTtcclxuICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgIC8vIFRhcmdldCBsYW5ndWFnZSBmb3IgT2xsYW1hICjQvNC+0LbQtSDQsdGD0YLQuCDRgtC+0Lkg0YHQsNC80LjQuSwg0YnQviDQuSDQtNC70Y8gR29vZ2xlLCDQsNCx0L4g0L7QutGA0LXQvNC40LkpXHJcbiAgICAgICAgICAgLy8g0J/QvtC60Lgg0YnQviDQstC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INGB0L/RltC70YzQvdC40LkgdHJhbnNsYXRpb25UYXJnZXRMYW5ndWFnZVxyXG4gICAgICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgICAgICAuc2V0TmFtZShcIlRhcmdldCBUcmFuc2xhdGlvbiBMYW5ndWFnZSAoT2xsYW1hKVwiKVxyXG4gICAgICAgICAgICAgICAuc2V0RGVzYyhcIlRyYW5zbGF0ZSBtZXNzYWdlcy9pbnB1dCBpbnRvIHRoaXMgbGFuZ3VhZ2UgdXNpbmcgT2xsYW1hLlwiKVxyXG4gICAgICAgICAgICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBjb2RlIGluIExBTkdVQUdFUykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihjb2RlLCBMQU5HVUFHRVNbY29kZV0pO1xyXG4gICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudHJhbnNsYXRpb25UYXJnZXRMYW5ndWFnZSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uVGFyZ2V0TGFuZ3VhZ2UgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAvLyBUT0RPOiDQnNC+0LbQu9C40LLQviwg0LTQvtC00LDRgtC4INC/0L7Qu9C1INC00LvRjyBcIlNvdXJjZSBMYW5ndWFnZVwiINC00LvRjyBPbGxhbWEsXHJcbiAgICAgICAgICAgLy8g0LDQsdC+INGA0LXQsNC70ZbQt9GD0LLQsNGC0Lgg0LDQstGC0L7QtNC10YLQtdC60YLRg9Cy0LDQvdC90Y8gKNGJ0L4g0YHQutC70LDQtNC90ZbRiNC1KS4g0J/QvtC60Lgg0YnQviDQv9GA0LjQv9GD0YHQutCw0ZTQvNC+XHJcbiAgICAgICAgICAgLy8g0L/QtdGA0LXQutC70LDQtCDQtyDQvNC+0LLQuCDRltC90YLQtdGA0YTQtdC50YHRgyDQsNCx0L4g0LDQvdCz0LvRltC50YHRjNC60L7Rly5cclxuXHJcbiAgICAgICB9XHJcblxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgIC5zZXROYW1lKFwiR29vZ2xlIEFQSSBLZXkgKFNwZWVjaC10by1UZXh0KVwiKVxyXG4gICAgICAgICAgLnNldERlc2MoXCJSZXF1aXJlZCBmb3Igdm9pY2UgaW5wdXQuIEtlZXAgY29uZmlkZW50aWFsLlwiKVxyXG4gICAgICAgICAgLmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcbiAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiRW50ZXIgQVBJIEtleVwiKVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5nb29nbGVBcGlLZXkpXHJcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZ29vZ2xlQXBpS2V5ID0gdmFsdWUudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgIC5zZXROYW1lKFwiU3BlZWNoIFJlY29nbml0aW9uIExhbmd1YWdlXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIkxhbmd1YWdlIGZvciB2b2ljZSBpbnB1dCAoZS5nLiwgZW4tVVMsIHVrLVVBKS5cIilcclxuICAgICAgICAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiB7XHJcbiAgICAgICAgICAgICAgY29uc3Qgc3BlZWNoTGFuZ3M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XHJcbiAgICAgICAgICAgICAgICAgIFwidWstVUFcIjogXCJVa3JhaW5pYW5cIixcclxuICAgICAgICAgICAgICAgICAgXCJlbi1VU1wiOiBcIkVuZ2xpc2ggKFVTKVwiLCAvKiAuLi4gYWRkIG1vcmUgaWYgbmVlZGVkIC4uLiAqL1xyXG4gICAgICAgICAgICAgICAgICAgXCJlbi1HQlwiOiBcIkVuZ2xpc2ggKFVLKVwiLFxyXG4gICAgICAgICAgICAgICAgICAgXCJlcy1FU1wiOiBcIlNwYW5pc2ggKFNwYWluKVwiLFxyXG4gICAgICAgICAgICAgICAgICAvLyDQlNC+0LTQsNC50YLQtSDRltC90YjRliDQvNC+0LLQuCDQt9CwINC/0L7RgtGA0LXQsdC4XHJcbiAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNvZGUgaW4gc3BlZWNoTGFuZ3MpIHtcclxuICAgICAgICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKGNvZGUsIHNwZWVjaExhbmdzW2NvZGVdKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3BlZWNoTGFuZ3VhZ2UpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3BlZWNoTGFuZ3VhZ2UgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9KTtcclxuXHJcblxyXG4gICAgICAvLyA0LiBUZWNobmljYWwgJiBEYXRhXHJcbiAgICAgIHRoaXMuY3JlYXRlU2VjdGlvbkhlYWRlcihcIlRlY2huaWNhbCAmIERhdGFcIik7XHJcblxyXG4gICAgICAvLyBTdG9yYWdlICYgSGlzdG9yeSAo0L/QtdGA0LXQvNGW0YnQtdC90L4pXHJcbiAgICAgIHRoaXMuY3JlYXRlR3JvdXBIZWFkZXIoXCJTdG9yYWdlICYgSGlzdG9yeVwiKTtcclxuICAgICAgLy8gLi4uICjRltGB0L3Rg9GO0YfRliDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8gc2F2ZU1lc3NhZ2VIaXN0b3J5LCBjaGF0SGlzdG9yeUZvbGRlclBhdGgsIGNoYXRFeHBvcnRGb2xkZXJQYXRoKVxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgIC5zZXROYW1lKFwiU2F2ZSBNZXNzYWdlIEhpc3RvcnlcIilcclxuICAgICAgICAgIC5zZXREZXNjKFwiU2F2ZSBjaGF0IGNvbnZlcnNhdGlvbnMgdG8gZmlsZXMuXCIpXHJcbiAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc2F2ZU1lc3NhZ2VIaXN0b3J5KS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zYXZlTWVzc2FnZUhpc3RvcnkgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcclxuICAgICAgICAgIH0pKTtcclxuICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnNhdmVNZXNzYWdlSGlzdG9yeSkge1xyXG4gICAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgICAgLnNldE5hbWUoXCJDaGF0IEhpc3RvcnkgRm9sZGVyIFBhdGhcIilcclxuICAgICAgICAgICAgICAuc2V0RGVzYygnRm9sZGVyIHRvIHN0b3JlIGNoYXQgaGlzdG9yeSAoLmpzb24gZmlsZXMpLiBVc2UgXCIvXCIgZm9yIHZhdWx0IHJvb3QuJylcclxuICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuY2hhdEhpc3RvcnlGb2xkZXJQYXRoKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuY2hhdEhpc3RvcnlGb2xkZXJQYXRoKVxyXG4gICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0SGlzdG9yeUZvbGRlclBhdGggPVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlLnRyaW0oKSA9PT0gXCIvXCIgPyBcIi9cIiA6IG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpKSB8fCBERUZBVUxUX1NFVFRJTkdTLmNoYXRIaXN0b3J5Rm9sZGVyUGF0aDtcclxuICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWJvdW5jZWRVcGRhdGVDaGF0UGF0aCgpO1xyXG4gICAgICAgICAgICAgICAgICB9KSk7XHJcbiAgICAgIH1cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAuc2V0TmFtZShcIkNoYXQgRXhwb3J0IEZvbGRlciBQYXRoXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIkRlZmF1bHQgZm9sZGVyIGZvciBleHBvcnRlZCBNYXJrZG93biBjaGF0cy5cIilcclxuICAgICAgICAgIC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG4gICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmNoYXRFeHBvcnRGb2xkZXJQYXRoIHx8IFwiVmF1bHQgUm9vdFwiKVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0RXhwb3J0Rm9sZGVyUGF0aClcclxuICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRFeHBvcnRGb2xkZXJQYXRoID1cclxuICAgICAgICAgICAgICAgICAgICAgIG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpKSB8fCBERUZBVUxUX1NFVFRJTkdTLmNoYXRFeHBvcnRGb2xkZXJQYXRoO1xyXG4gICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyKSBhd2FpdCB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5lbnN1cmVGb2xkZXJzRXhpc3QoKTtcclxuICAgICAgICAgICAgICB9KSk7XHJcblxyXG5cclxuICAgICAgLy8gTG9nZ2luZyAo0L/QtdGA0LXQvNGW0YnQtdC90L4pXHJcbiAgICAgIHRoaXMuY3JlYXRlR3JvdXBIZWFkZXIoXCJMb2dnaW5nXCIpO1xyXG4gICAgICAvLyAuLi4gKNGW0YHQvdGD0Y7Rh9GWINC90LDQu9Cw0YjRgtGD0LLQsNC90L3RjyBjb25zb2xlTG9nTGV2ZWwsIGZpbGVMb2dnaW5nRW5hYmxlZCwgZmlsZUxvZ0xldmVsLCBsb2dDYWxsZXJJbmZvLCBsb2dGaWxlUGF0aClcclxuICAgICAgY29uc3QgbG9nTGV2ZWxPcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XHJcbiAgICAgIE9iamVjdC5rZXlzKExvZ0xldmVsKS5mb3JFYWNoKGtleSA9PiB7XHJcbiAgICAgICAgICBpZiAoaXNOYU4oTnVtYmVyKGtleSkpKSB7IC8vIEZpbHRlciBvdXQgbnVtZXJpYyBlbnVtIGtleXNcclxuICAgICAgICAgICAgICBsb2dMZXZlbE9wdGlvbnNba2V5XSA9IGtleTtcclxuICAgICAgICAgIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgIC5zZXROYW1lKFwiQ29uc29sZSBMb2cgTGV2ZWxcIilcclxuICAgICAgICAgIC5zZXREZXNjKFwiTWluaW11bSBsZXZlbCBmb3IgZGV2ZWxvcGVyIGNvbnNvbGUuXCIpXHJcbiAgICAgICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cclxuICAgICAgICAgICAgICAuYWRkT3B0aW9ucyhsb2dMZXZlbE9wdGlvbnMpXHJcbiAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnNvbGVMb2dMZXZlbCB8fCBcIklORk9cIilcclxuICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBrZXlvZiB0eXBlb2YgTG9nTGV2ZWwpID0+IHtcclxuICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuY29uc29sZUxvZ0xldmVsID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgLnNldE5hbWUoXCJFbmFibGUgRmlsZSBMb2dnaW5nXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhgTG9nIHRvICR7dGhpcy5wbHVnaW4ubG9nZ2VyLmdldExvZ0ZpbGVQYXRoKCl9IChmb3IgZGVidWdnaW5nKS5gKVxyXG4gICAgICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZpbGVMb2dnaW5nRW5hYmxlZCkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZmlsZUxvZ2dpbmdFbmFibGVkID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuZmlsZUxvZ2dpbmdFbmFibGVkKSB7XHJcbiAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAuc2V0TmFtZShcIkZpbGUgTG9nIExldmVsXCIpXHJcbiAgICAgICAgICAgICAgLnNldERlc2MoXCJNaW5pbXVtIGxldmVsIGZvciBsb2cgZmlsZS5cIilcclxuICAgICAgICAgICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cclxuICAgICAgICAgICAgICAgICAgLmFkZE9wdGlvbnMobG9nTGV2ZWxPcHRpb25zKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZmlsZUxvZ0xldmVsIHx8IFwiV0FSTlwiKVxyXG4gICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBrZXlvZiB0eXBlb2YgTG9nTGV2ZWwpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmZpbGVMb2dMZXZlbCA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgICAgICAuc2V0TmFtZShcIkxvZyBDYWxsZXIgTWV0aG9kIE5hbWVcIilcclxuICAgICAgICAgICAgICAuc2V0RGVzYyhcIkluY2x1ZGUgW01ldGhvZE5hbWVdIGluIGxvZ3MuIE1heSBzbGlnaHRseSBpbXBhY3QgcGVyZm9ybWFuY2UuXCIpXHJcbiAgICAgICAgICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ0NhbGxlckluZm8pLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2dDYWxsZXJJbmZvID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgICAgICAvLyDQktGW0LTQvtCx0YDQsNC20LXQvdC90Y8g0YjQu9GP0YXRgyDQtNC+INGE0LDQudC70YMg0LvQvtCz0ZbQslxyXG4gICAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgICAgLnNldE5hbWUoXCJMb2cgRmlsZSBQYXRoXCIpXHJcbiAgICAgICAgICAgICAgLnNldERlc2MoXCJDdXJyZW50IGxvY2F0aW9uIG9mIHRoZSBsb2cgZmlsZS5cIilcclxuICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLmxvZ2dlci5nZXRMb2dGaWxlUGF0aCgpKVxyXG4gICAgICAgICAgICAgICAgICAuc2V0RGlzYWJsZWQodHJ1ZSkpO1xyXG4gICAgICAgICAgLy8g0JzQvtC20LvQuNCy0L4sINC00L7QtNCw0YLQuCDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8g0LzQsNC60YHQuNC80LDQu9GM0L3QvtCz0L4g0YDQvtC30LzRltGA0YMg0YTQsNC50LvRgywg0Y/QutGJ0L4g0LvQvtCz0LXRgCDRhtC1INC/0ZbQtNGC0YDQuNC80YPRlFxyXG4gICAgICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgICAgICAuc2V0TmFtZShcIkxvZyBGaWxlIE1heCBTaXplIChNQilcIilcclxuICAgICAgICAgICAgICAgLnNldERlc2MoXCJNYXhpbXVtIHNpemUgb2YgdGhlIGxvZyBmaWxlIGJlZm9yZSBpdCBpcyByb3RhdGVkLlwiKVxyXG4gICAgICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuICAgICAgICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihTdHJpbmcoREVGQVVMVF9TRVRUSU5HUy5sb2dGaWxlTWF4U2l6ZU1CKSlcclxuICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9nRmlsZU1heFNpemVNQikpXHJcbiAgICAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbnVtID0gcGFyc2VJbnQodmFsdWUudHJpbSgpLCAxMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9nRmlsZU1heFNpemVNQiA9ICFpc05hTihudW0pICYmIG51bSA+IDAgPyBudW0gOiBERUZBVUxUX1NFVFRJTkdTLmxvZ0ZpbGVNYXhTaXplTUI7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgLy8g0J/QvtGC0YDRltCx0L3QviDQv9C+0LLRltC00L7QvNC40YLQuCDQu9C+0LPQtdGAINC/0YDQviDQt9C80ZbQvdGDINGA0L7Qt9C80ZbRgNGDLCDRj9C60YnQviDRhtC1INC80L7QttC70LjQstC+XHJcbiAgICAgICAgICAgICAgICAgICB9KSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIC0tLSDQmtGW0L3QtdGG0Ywg0J3QntCS0J7QhyDQodCi0KDQo9Ca0KLQo9Cg0Jgg0KHQldCa0KbQhtCZIC0tLVxyXG5cclxuICB9XHJcbn1cclxuXHJcblxyXG4iXX0=