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
    userRolesFolderPath: "/etc/ai-forge/roles", // Приклад шляху
    selectedRolePath: "",
    followRole: true,
    // Storage & History
    saveMessageHistory: true,
    chatHistoryFolderPath: "/etc/ai-forge/chats", // Приклад шляху
    chatExportFolderPath: "/etc/ai-forge/xports", // Приклад шляху
    // View Behavior
    openChatInTab: false,
    maxMessageHeight: 300,
    // Appearance
    userAvatarType: "initials",
    userAvatarContent: "U",
    aiAvatarType: "icon",
    aiAvatarContent: "bot",
    // RAG
    ragEnabled: false,
    ragFolderPath: "etc/ai-forge/rag", // Приклад шляху
    ragEnableSemanticSearch: true,
    ragEmbeddingModel: "nomic-embed-text",
    ragChunkSize: 512,
    ragSimilarityThreshold: 0.5,
    ragTopK: 3,
    maxCharsPerDoc: 1500,
    ragAutoIndexOnStartup: true,
    // Productivity
    enableProductivityFeatures: false,
    dailyTaskFileName: "Tasks_Today.md",
    useAdvancedContextStrategy: false,
    enableSummarization: false,
    summarizationPrompt: "Summarize the key points discussed so far in this conversation:\n\n{text_to_summarize}",
    keepLastNMessagesBeforeSummary: 10,
    summarizationChunkSize: 1500,
    summarizationModelName: "",
    // Speech & Translation
    googleApiKey: "",
    speechLanguage: "uk-UA",
    enableTranslation: false,
    translationTargetLanguage: "uk",
    googleTranslationApiKey: "",
    // Logger Settings
    consoleLogLevel: "INFO",
    fileLoggingEnabled: false,
    fileLogLevel: "WARN",
    logCallerInfo: false,
    logFilePath: "", // Logger сам підставить шлях до папки плагіна
    logFileMaxSizeMB: 5,
    fallbackSummarizationModelName: "gemma3:4b",
    fixBrokenEmojis: true,
    translationProvider: 'ollama', // За замовчуванням вимкнено
    ollamaTranslationModel: '',
    sidebarWidth: undefined, // Або null. Означає, що ширина не встановлена користувачем
    enableToolUse: true,
};
// --- Клас вкладки налаштувань ---
export class OllamaSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
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
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "AI Forge Settings" });
        // --- Секція: Connection & Model Defaults ---
        this.createSectionHeader("Connection & Model Defaults");
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
                    // Встановлюємо значення, тільки якщо воно є у списку
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
        // --- Секція: View Behavior ---
        this.createSectionHeader("View Behavior");
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
        // --- Секція: Appearance ---
        this.createSectionHeader("Appearance");
        // User Avatar
        new Setting(containerEl).setName("User Avatar Style").addDropdown(dropdown => dropdown
            .addOption("initials", "Initials")
            .addOption("icon", "Icon")
            .addOption("image", "Image (Vault Path)") // Додано
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
                // Використовуємо дефолтне значення з DEFAULT_SETTINGS, якщо поле порожнє
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
                this.plugin.settings.userAvatarContent = value.trim() || "user"; // Дефолтна іконка
                yield this.plugin.saveSettings();
            })));
        }
        else if (this.plugin.settings.userAvatarType === "image") {
            userAvatarSetting.setName("User Avatar Image Path");
            userAvatarSetting.setDesc("Full path to the image file (png/jpeg/jpg) within your vault.");
            userAvatarSetting.addText(text => text // Поле для введення шляху
                .setPlaceholder("e.g., Assets/Images/user.png")
                .setValue(this.plugin.settings.userAvatarContent)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                // --- ВИПРАВЛЕННЯ: Використовуємо локальну змінну ---
                const normalizedPath = normalizePath(value.trim());
                if (normalizedPath === "" || /\.(png|jpg|jpeg)$/i.test(normalizedPath)) {
                    this.plugin.settings.userAvatarContent = normalizedPath;
                }
                else {
                    new Notice("Invalid path. Please provide a path to a .png or .jpeg/jpg file, or leave empty.");
                    text.setValue(this.plugin.settings.userAvatarContent); // Повертаємо старе значення
                    return; // Не зберігаємо
                }
                // --- Кінець виправлення ---
                yield this.plugin.saveSettings();
            })));
        }
        // AI Avatar
        new Setting(containerEl).setName("AI Avatar Style").addDropdown(dropdown => dropdown
            .addOption("initials", "Initials")
            .addOption("icon", "Icon")
            .addOption("image", "Image (Vault Path)") // Додано
            .setValue(this.plugin.settings.aiAvatarType)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.aiAvatarType = value;
            yield this.plugin.saveSettings();
            this.display(); // Перемалювати
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
                this.plugin.settings.aiAvatarContent = value.trim() || "bot"; // Дефолтна іконка
                yield this.plugin.saveSettings();
            })));
        }
        else if (this.plugin.settings.aiAvatarType === "image") {
            aiAvatarSetting.setName("AI Avatar Image Path");
            aiAvatarSetting.setDesc("Full path to the image file (png/jpeg/jpg) within your vault.");
            aiAvatarSetting.addText(text => text // Поле для введення шляху
                .setPlaceholder("e.g., Assets/Images/ai.png")
                .setValue(this.plugin.settings.aiAvatarContent)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                // --- ВИПРАВЛЕННЯ: Використовуємо локальну змінну ---
                const normalizedPath = normalizePath(value.trim());
                if (normalizedPath === "" || /\.(png|jpg|jpeg)$/i.test(normalizedPath)) {
                    this.plugin.settings.aiAvatarContent = normalizedPath;
                }
                else {
                    new Notice("Invalid path. Please provide a path to a .png or .jpeg/jpg file, or leave empty.");
                    text.setValue(this.plugin.settings.aiAvatarContent);
                    return;
                }
                // --- Кінець виправлення ---
                yield this.plugin.saveSettings();
            })));
        }
        // --- Секція: Roles & Personas ---
        this.createSectionHeader("Roles & Personas");
        new Setting(containerEl)
            .setName("Custom Roles Folder Path")
            .setDesc("Folder with custom role (.md) files.")
            .addText(text => text
            .setPlaceholder(DEFAULT_SETTINGS.userRolesFolderPath)
            .setValue(this.plugin.settings.userRolesFolderPath)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            // --- ВИПРАВЛЕННЯ: Використовуємо normalizePath ---
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
        // --- Секція: Storage & History ---
        this.createSectionHeader("Storage & History");
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
                // --- ВИПРАВЛЕННЯ: Використовуємо normalizePath ---
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
            // --- ВИПРАВЛЕННЯ: Використовуємо normalizePath ---
            this.plugin.settings.chatExportFolderPath =
                normalizePath(value.trim()) || DEFAULT_SETTINGS.chatExportFolderPath;
            yield this.plugin.saveSettings();
            if (this.plugin.chatManager)
                yield this.plugin.chatManager.ensureFoldersExist();
        })));
        // --- Секція: Retrieval-Augmented Generation (RAG) ---
        this.createSectionHeader("Retrieval-Augmented Generation (RAG)");
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
                // --- ВИПРАВЛЕННЯ: Використовуємо normalizePath ---
                this.plugin.settings.ragFolderPath = normalizePath(value.trim()) || DEFAULT_SETTINGS.ragFolderPath;
                yield this.plugin.saveSettings();
                this.debouncedUpdateRagPath();
                (_b = (_a = this.plugin).updateDailyTaskFilePath) === null || _b === void 0 ? void 0 : _b.call(_a);
                (_d = (_c = this.plugin).loadAndProcessInitialTasks) === null || _d === void 0 ? void 0 : _d.call(_c);
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
                        // Встановлюємо попереднє значення, якщо воно є у списку, або перший рекомендований
                        dropdown.setValue(models.includes(previousValue) ? previousValue : commonEmbedModels.length > 0 ? commonEmbedModels[0] : "");
                    }
                    catch (error) {
                        console.error("Error fetching models for embedding dropdown:", error);
                        dropdown.selectEl.innerHTML = "";
                        dropdown.addOption("", "Error loading models!");
                        dropdown.setValue(previousValue); // Повертаємо старе значення при помилці
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
        this.createSectionHeader("Advanced Context Management");
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
            }
            // --- НОВЕ: Вибір моделі для сумаризації ---
            let summarizationModelDropdown = null;
            const updateSummarizationOptions = (dropdown, button) => __awaiter(this, void 0, void 0, function* () {
                if (!dropdown)
                    return;
                const currentVal = this.plugin.settings.summarizationModelName; // Використовуємо нове поле
                dropdown.selectEl.innerHTML = "";
                dropdown.addOption("", "Loading models...");
                dropdown.setDisabled(true);
                button === null || button === void 0 ? void 0 : button.setDisabled(true).setIcon("loader");
                try {
                    const models = yield this.plugin.ollamaService.getModels();
                    dropdown.selectEl.innerHTML = "";
                    dropdown.addOption("", "-- Select Summarization Model --"); // Змінено текст
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
                .setName("Summarization Model") // Нова назва
                .setDesc("Model used for summarizing chat history and individual messages.") // Оновлений опис
                .addDropdown((dropdown) => __awaiter(this, void 0, void 0, function* () {
                summarizationModelDropdown = dropdown;
                dropdown.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.summarizationModelName = value; // Зберігаємо в нове поле
                    yield this.plugin.saveSettings();
                }));
                yield updateSummarizationOptions(dropdown); // Initial load
            }))
                .addExtraButton(button => {
                button
                    .setIcon("refresh-cw")
                    .setTooltip("Refresh model list")
                    .onClick(() => __awaiter(this, void 0, void 0, function* () {
                    yield updateSummarizationOptions(summarizationModelDropdown, button);
                    new Notice("Model list refreshed!");
                }));
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
                .setPlaceholder("e.g., orca-mini or leave empty") // Приклад
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
        // --- Секція: Productivity Assistant Features ---
        this.createSectionHeader("Productivity Assistant Features");
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
        // --- Секція: Speech & Translation ---
        this.createSectionHeader("Speech & Translation");
        // new Setting(containerEl)
        // .setName("Enable Translation Feature")
        // .setDesc("Show translate buttons.")
        // .addToggle(toggle =>
        //   toggle.setValue(this.plugin.settings.enableTranslation).onChange(async value => {
        //     this.plugin.settings.enableTranslation = value;
        //     await this.plugin.saveSettings();
        //     this.display(); // Перемалювати
        //   })
        // );
        // --- НОВЕ: Вибір Провайдера Перекладу ---
        this.plugin.settings.enableTranslation = this.plugin.settings.translationProvider !== 'none';
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
            // Вмикаємо/вимикаємо загальний перемикач залежно від вибору
            this.plugin.settings.enableTranslation = value !== 'none';
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
        if (this.plugin.settings.enableTranslation) {
            // new Setting(containerEl)
            //   .setName("Target Translation Language")
            //   .setDesc("Translate messages/input into this language.")
            //   .addDropdown(dropdown => {
            //     for (const code in LANGUAGES) {
            //       dropdown.addOption(code, LANGUAGES[code]);
            //     }
            //     dropdown.setValue(this.plugin.settings.translationTargetLanguage).onChange(async value => {
            //       this.plugin.settings.translationTargetLanguage = value;
            //       await this.plugin.saveSettings();
            //     });
            //   });
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
                "en-US": "English (US)" /* ... add more if needed ... */,
            };
            for (const code in speechLangs) {
                dropdown.addOption(code, speechLangs[code]);
            }
            dropdown.setValue(this.plugin.settings.speechLanguage).onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.speechLanguage = value;
                yield this.plugin.saveSettings();
            }));
        });
        // --- Секція: Logging ---
        this.createSectionHeader("Logging");
        const logLevelOptions = {};
        Object.keys(LogLevel).forEach(key => {
            if (isNaN(Number(key))) {
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
            .setDesc(`Log to ${this.plugin.logger.getLogFilePath()} (for debugging).`) // Використовуємо метод логера
            .addToggle(toggle => toggle.setValue(this.plugin.settings.fileLoggingEnabled).onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.fileLoggingEnabled = value;
            yield this.plugin.saveSettings();
            this.display(); // Перемалювати, щоб показати/сховати налаштування файлу
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
                // --- ВИПРАВЛЕННЯ: Використовуємо доданий метод ---
                .setValue(this.plugin.logger.getLogFilePath())
                // --- Кінець виправлення ---
                .setDisabled(true));
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsY0FBYztBQUNkLE9BQU8sRUFFTCxnQkFBZ0IsRUFDaEIsT0FBTyxFQUlQLFFBQVEsRUFHUixNQUFNLEVBQ04sYUFBYSxFQUFFLHFCQUFxQjtFQUNyQyxNQUFNLFVBQVUsQ0FBQztBQUVsQixPQUFPLEVBQUUsUUFBUSxFQUFrQixNQUFNLFVBQVUsQ0FBQyxDQUFDLHdDQUF3QztBQUU3RixlQUFlO0FBQ2YsTUFBTSxDQUFDLE1BQU0sU0FBUyxHQUEyQjtJQUMvQyxFQUFFLEVBQUUsV0FBVztJQUNmLEVBQUUsRUFBRSxVQUFVO0lBQ2QsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsUUFBUTtJQUNaLEVBQUUsRUFBRSxVQUFVO0lBQ2QsRUFBRSxFQUFFLGFBQWE7SUFDakIsRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsWUFBWTtJQUNoQixFQUFFLEVBQUUsU0FBUztJQUNiLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsU0FBUztJQUNiLEdBQUcsRUFBRSxTQUFTO0lBQ2QsRUFBRSxFQUFFLFVBQVU7SUFDZCxPQUFPLEVBQUUsc0JBQXNCO0lBQy9CLE9BQU8sRUFBRSx1QkFBdUI7SUFDaEMsRUFBRSxFQUFFLFVBQVU7SUFDZCxFQUFFLEVBQUUsVUFBVTtJQUNkLEVBQUUsRUFBRSxPQUFPO0lBQ1gsRUFBRSxFQUFFLFFBQVE7SUFDWixFQUFFLEVBQUUsT0FBTztJQUNYLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLFdBQVc7SUFDZixFQUFFLEVBQUUsVUFBVTtJQUNkLEVBQUUsRUFBRSxVQUFVO0lBQ2QsRUFBRSxFQUFFLFNBQVM7SUFDYixFQUFFLEVBQUUsUUFBUTtJQUNaLEVBQUUsRUFBRSxTQUFTO0lBQ2IsRUFBRSxFQUFFLFVBQVU7SUFDZCxFQUFF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O2lCQUNyQixPQUFPLENBQUMsZUFBZSxDQUFDO2lCQUN4QixPQUFPLENBQUMsbUNBQW1DLENBQUM7aUJBQzVDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUNkLElBQUk7Z0JBQ0Ysb0RBQW9EO2lCQUNuRCxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQzlDLDZCQUE2QjtpQkFDNUIsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUNyQixDQUFDO1FBQ04sQ0FBQztJQUNILENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbIi8vIHNldHRpbmdzLnRzXHJcbmltcG9ydCB7XHJcbiAgQXBwLFxyXG4gIFBsdWdpblNldHRpbmdUYWIsXHJcbiAgU2V0dGluZyxcclxuICBEcm9wZG93bkNvbXBvbmVudCxcclxuICBzZXRJY29uLFxyXG4gIFRGb2xkZXIsXHJcbiAgZGVib3VuY2UsXHJcbiAgRXh0cmFCdXR0b25Db21wb25lbnQsXHJcbiAgU2xpZGVyQ29tcG9uZW50LFxyXG4gIE5vdGljZSxcclxuICBub3JtYWxpemVQYXRoLCAvLyA8LS0tINCU0J7QlNCQ0J3QniDQhtCc0J/QntCg0KJcclxufSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IE9sbGFtYVBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XHJcbmltcG9ydCB7IExvZ0xldmVsLCBMb2dnZXJTZXR0aW5ncyB9IGZyb20gXCIuL0xvZ2dlclwiOyAvLyDQhtC80L/QvtGA0YLRg9GU0LzQviBMb2dMZXZlbCDRgtCwIExvZ2dlclNldHRpbmdzXHJcblxyXG4vLyAtLS0g0JzQvtCy0LggLS0tXHJcbmV4cG9ydCBjb25zdCBMQU5HVUFHRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XHJcbiAgYWY6IFwiQWZyaWthYW5zXCIsXHJcbiAgc3E6IFwiQWxiYW5pYW5cIixcclxuICBhbTogXCJBbWhhcmljXCIsXHJcbiAgYXI6IFwiQXJhYmljXCIsXHJcbiAgaHk6IFwiQXJtZW5pYW5cIixcclxuICBhejogXCJBemVyYmFpamFuaVwiLFxyXG4gIGV1OiBcIkJhc3F1ZVwiLFxyXG4gIGJlOiBcIkJlbGFydXNpYW5cIixcclxuICBibjogXCJCZW5nYWxpXCIsXHJcbiAgYnM6IFwiQm9zbmlhblwiLFxyXG4gIGJnOiBcIkJ1bGdhcmlhblwiLFxyXG4gIGNhOiBcIkNhdGFsYW5cIixcclxuICBjZWI6IFwiQ2VidWFub1wiLFxyXG4gIG55OiBcIkNoaWNoZXdhXCIsXHJcbiAgXCJ6aC1DTlwiOiBcIkNoaW5lc2UgKFNpbXBsaWZpZWQpXCIsXHJcbiAgXCJ6aC1UV1wiOiBcIkNoaW5lc2UgKFRyYWRpdGlvbmFsKVwiLFxyXG4gIGNvOiBcIkNvcnNpY2FuXCIsXHJcbiAgaHI6IFwiQ3JvYXRpYW5cIixcclxuICBjczogXCJDemVjaFwiLFxyXG4gIGRhOiBcIkRhbmlzaFwiLFxyXG4gIG5sOiBcIkR1dGNoXCIsXHJcbiAgZW46IFwiRW5nbGlzaFwiLFxyXG4gIGVvOiBcIkVzcGVyYW50b1wiLFxyXG4gIGV0OiBcIkVzdG9uaWFuXCIsXHJcbiAgdGw6IFwiRmlsaXBpbm9cIixcclxuICBmaTogXCJGaW5uaXNoXCIsXHJcbiAgZnI6IFwiRnJlbmNoXCIsXHJcbiAgZnk6IFwiRnJpc2lhblwiLFxyXG4gIGdsOiBcIkdhbGljaWFuXCIsXHJcbiAga2E6IFwiR2VvcmdpYW5cIixcclxuICBkZTogXCJHZXJtYW5cIixcclxuICBlbDogXCJHcmVla1wiLFxyXG4gIGd1OiBcIkd1amFyYXRpXCIsXHJcbiAgaHQ6IFwiSGFpdGlhbiBDcmVvbGVcIixcclxuICBoYTogXCJIYXVzYVwiLFxyXG4gIGhhdzogXCJIYXdhaWlhblwiLFxyXG4gIGl3OiBcIkhlYnJld1wiLFxyXG4gIGhlOiBcIkhlYnJld1wiLFxyXG4gIGhpOiBcIkhpbmRpXCIsXHJcbiAgaG1uOiBcIkhtb25nXCIsXHJcbiAgaHU6IFwiSHVuZ2FyaWFuXCIsXHJcbiAgaXM6IFwiSWNlbGFuZGljXCIsXHJcbiAgaWc6IFwiSWdib1wiLFxyXG4gIGlkOiBcIkluZG9uZXNpYW5cIixcclxuICBnYTogXCJJcmlzaFwiLFxyXG4gIGl0OiBcIkl0YWxpYW5cIixcclxuICBqYTogXCJKYXBhbmVzZVwiLFxyXG4gIGp3OiBcIkphdmFuZXNlXCIsXHJcbiAga246IFwiS2FubmFkYVwiLFxyXG4gIGtrOiBcIkthemFraFwiLFxyXG4gIGttOiBcIktobWVyXCIsXHJcbiAgcnc6IFwiS2lueWFyd2FuZGFcIixcclxuICBrbzogXCJLb3JlYW5cIixcclxuICBrdTogXCJLdXJkaXNoIChLdXJtYW5qaSlcIixcclxuICBreTogXCJLeXJneXpcIixcclxuICBsbzogXCJMYW9cIixcclxuICBsYTogXCJMYXRpblwiLFxyXG4gIGx2OiBcIkxhdHZpYW5cIixcclxuICBsdDogXCJMaXRodWFuaWFuXCIsXHJcbiAgbGI6IFwiTHV4ZW1ib3VyZ2lzaFwiLFxyXG4gIG1rOiBcIk1hY2Vkb25pYW5cIixcclxuICBtZzogXCJNYWxhZ2FzeVwiLFxyXG4gIG1zOiBcIk1hbGF5XCIsXHJcbiAgbWw6IFwiTWFsYXlhbGFtXCIsXHJcbiAgbXQ6IFwiTWFsdGVzZVwiLFxyXG4gIG1pOiBcIk1hb3JpXCIsXHJcbiAgbXI6IFwiTWFyYXRoaVwiLFxyXG4gIG1uOiBcIk1vbmdvbGlhblwiLFxyXG4gIG15OiBcIk15YW5tYXIgKEJ1cm1lc2UpXCIsXHJcbiAgbmU6IFwiTmVwYWxpXCIsXHJcbiAgbm86IFwiTm9yd2VnaWFuXCIsXHJcbiAgb3I6IFwiT2RpYSAoT3JpeWEpXCIsXHJcbiAgcHM6IFwiUGFzaHRvXCIsXHJcbiAgZmE6IFwiUGVyc2lhblwiLFxyXG4gIHBsOiBcIlBvbGlzaFwiLFxyXG4gIHB0OiBcIlBvcnR1Z3Vlc2VcIixcclxuICBwYTogXCJQdW5qYWJpXCIsXHJcbiAgcm86IFwiUm9tYW5pYW5cIixcclxuICBydTogXCJSdXNzaWFuXCIsXHJcbiAgc206IFwiU2Ftb2FuXCIsXHJcbiAgZ2Q6IFwiU2NvdHMgR2FlbGljXCIsXHJcbiAgc3I6IFwiU2VyYmlhblwiLFxyXG4gIHN0OiBcIlNlc290aG9cIixcclxuICBzbjogXCJTaG9uYVwiLFxyXG4gIHNkOiBcIlNpbmRoaVwiLFxyXG4gIHNpOiBcIlNpbmhhbGFcIixcclxuICBzazogXCJTbG92YWtcIixcclxuICBzbDogXCJTbG92ZW5pYW5cIixcclxuICBzbzogXCJTb21hbGlcIixcclxuICBlczogXCJTcGFuaXNoXCIsXHJcbiAgc3U6IFwiU3VuZGFuZXNlXCIsXHJcbiAgc3c6IFwiU3dhaGlsaVwiLFxyXG4gIHN2OiBcIlN3ZWRpc2hcIixcclxuICB0ZzogXCJUYWppa1wiLFxyXG4gIHRhOiBcIlRhbWlsXCIsXHJcbiAgdHQ6IFwiVGF0YXJcIixcclxuICB0ZTogXCJUZWx1Z3VcIixcclxuICB0aDogXCJUaGFpXCIsXHJcbiAgdHI6IFwiVHVya2lzaFwiLFxyXG4gIHRrOiBcIlR1cmttZW5cIixcclxuICB1azogXCJVa3JhaW5pYW5cIixcclxuICB1cjogXCJVcmR1XCIsXHJcbiAgdWc6IFwiVXlnaHVyXCIsXHJcbiAgdXo6IFwiVXpiZWtcIixcclxuICB2aTogXCJWaWV0bmFtZXNlXCIsXHJcbiAgY3k6IFwiV2Vsc2hcIixcclxuICB4aDogXCJYaG9zYVwiLFxyXG4gIHlpOiBcIllpZGRpc2hcIixcclxuICB5bzogXCJZb3J1YmFcIixcclxuICB6dTogXCJadWx1XCIsXHJcbn07XHJcblxyXG4vLyAtLS0g0KLQuNC/INCw0LLQsNGC0LDRgNCwICjQlNCe0JTQkNCd0J4gJ2ltYWdlJykgLS0tXHJcbmV4cG9ydCB0eXBlIEF2YXRhclR5cGUgPSBcImluaXRpYWxzXCIgfCBcImljb25cIiB8IFwiaW1hZ2VcIjtcclxuXHJcbmV4cG9ydCB0eXBlIFRyYW5zbGF0aW9uUHJvdmlkZXIgPSAnZ29vZ2xlJyB8ICdvbGxhbWEnIHwgJ25vbmUnO1xyXG5cclxuLy8gLS0tINCG0L3RgtC10YDRhNC10LnRgSDQvdCw0LvQsNGI0YLRg9Cy0LDQvdGMIC0tLVxyXG5leHBvcnQgaW50ZXJmYWNlIE9sbGFtYVBsdWdpblNldHRpbmdzIGV4dGVuZHMgTG9nZ2VyU2V0dGluZ3Mge1xyXG4gIG9sbGFtYVNlcnZlclVybDogc3RyaW5nO1xyXG4gIG1vZGVsTmFtZTogc3RyaW5nO1xyXG4gIHRlbXBlcmF0dXJlOiBudW1iZXI7XHJcbiAgY29udGV4dFdpbmRvdzogbnVtYmVyO1xyXG4gIHVzZXJSb2xlc0ZvbGRlclBhdGg6IHN0cmluZztcclxuICBzZWxlY3RlZFJvbGVQYXRoPzogc3RyaW5nO1xyXG4gIHNhdmVNZXNzYWdlSGlzdG9yeTogYm9vbGVhbjtcclxuICBjaGF0SGlzdG9yeUZvbGRlclBhdGg6IHN0cmluZztcclxuICBjaGF0RXhwb3J0Rm9sZGVyUGF0aDogc3RyaW5nO1xyXG4gIG9wZW5DaGF0SW5UYWI6IGJvb2xlYW47XHJcbiAgdXNlckF2YXRhclR5cGU6IEF2YXRhclR5cGU7XHJcbiAgdXNlckF2YXRhckNvbnRlbnQ6IHN0cmluZztcclxuICBhaUF2YXRhclR5cGU6IEF2YXRhclR5cGU7XHJcbiAgYWlBdmF0YXJDb250ZW50OiBzdHJpbmc7XHJcbiAgbWF4TWVzc2FnZUhlaWdodDogbnVtYmVyO1xyXG4gIHJhZ0VuYWJsZWQ6IGJvb2xlYW47XHJcbiAgcmFnRm9sZGVyUGF0aDogc3RyaW5nO1xyXG4gIHJhZ0VuYWJsZVNlbWFudGljU2VhcmNoOiBib29sZWFuO1xyXG4gIHJhZ0VtYmVkZGluZ01vZGVsOiBzdHJpbmc7XHJcbiAgcmFnQ2h1bmtTaXplOiBudW1iZXI7XHJcbiAgcmFnU2ltaWxhcml0eVRocmVzaG9sZDogbnVtYmVyO1xyXG4gIHJhZ1RvcEs6IG51bWJlcjtcclxuICBtYXhDaGFyc1BlckRvYzogbnVtYmVyO1xyXG4gIGVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzOiBib29sZWFuO1xyXG4gIGRhaWx5VGFza0ZpbGVOYW1lOiBzdHJpbmc7XHJcbiAgdXNlQWR2YW5jZWRDb250ZXh0U3RyYXRlZ3k6IGJvb2xlYW47XHJcbiAgZW5hYmxlU3VtbWFyaXphdGlvbjogYm9vbGVhbjtcclxuICBzdW1tYXJpemF0aW9uUHJvbXB0OiBzdHJpbmc7XHJcbiAga2VlcExhc3ROTWVzc2FnZXNCZWZvcmVTdW1tYXJ5OiBudW1iZXI7XHJcbiAgc3VtbWFyaXphdGlvbkNodW5rU2l6ZTogbnVtYmVyO1xyXG4gIGZvbGxvd1JvbGU6IGJvb2xlYW47XHJcbiAgZ29vZ2xlQXBpS2V5OiBzdHJpbmc7XHJcbiAgc3BlZWNoTGFuZ3VhZ2U6IHN0cmluZztcclxuICBlbmFibGVUcmFuc2xhdGlvbjogYm9vbGVhbjtcclxuICB0cmFuc2xhdGlvblRhcmdldExhbmd1YWdlOiBzdHJpbmc7XHJcbiAgZ29vZ2xlVHJhbnNsYXRpb25BcGlLZXk6IHN0cmluZztcclxuICBzdW1tYXJpemF0aW9uTW9kZWxOYW1lOiBzdHJpbmc7XHJcbiAgZmFsbGJhY2tTdW1tYXJpemF0aW9uTW9kZWxOYW1lOiBzdHJpbmc7XHJcbiAgZml4QnJva2VuRW1vamlzOiBib29sZWFuOyAvLyDQndCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8g0LTQu9GPINCy0LjQv9GA0LDQstC70LXQvdC90Y8g0LXQvNC+0LTQt9GWXHJcbiAgdHJhbnNsYXRpb25Qcm92aWRlcjogVHJhbnNsYXRpb25Qcm92aWRlcjsgLy8g0JLQuNCx0ZbRgCDQv9GA0L7QstCw0LnQtNC10YDQsFxyXG4gIG9sbGFtYVRyYW5zbGF0aW9uTW9kZWw6IHN0cmluZzsgLy8g0JzQvtC00LXQu9GMIE9sbGFtYSDQtNC70Y8g0L/QtdGA0LXQutC70LDQtNGDXHJcbiAgcmFnQXV0b0luZGV4T25TdGFydHVwOiBib29sZWFuOyAvLyA8LS0tINCU0J7QlNCQ0J3QniDQotCj0KJcclxuICBzaWRlYmFyV2lkdGg/OiBudW1iZXI7IC8vINCe0L/RhtGW0L7QvdCw0LvRjNC90LAg0LLQu9Cw0YHRgtC40LLRltGB0YLRjCDQtNC70Y8g0LfQsdC10YDQtdC20LXQvdC+0Zcg0YjQuNGA0LjQvdC4INGB0LDQudC00LHQsNGA0YNcclxuICBlbmFibGVUb29sVXNlOiBib29sZWFuO1xyXG59XHJcblxyXG4vLyAtLS0g0JfQvdCw0YfQtdC90L3RjyDQt9CwINC30LDQvNC+0LLRh9GD0LLQsNC90L3Rj9C8IC0tLVxyXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogT2xsYW1hUGx1Z2luU2V0dGluZ3MgPSB7XHJcbiAgLy8gQ29ubmVjdGlvbiAmIE1vZGVsXHJcbiAgb2xsYW1hU2VydmVyVXJsOiBcImh0dHA6Ly9sb2NhbGhvc3Q6MTE0MzRcIixcclxuICBtb2RlbE5hbWU6IFwiXCIsXHJcbiAgdGVtcGVyYXR1cmU6IDAuNyxcclxuICBjb250ZXh0V2luZG93OiA0MDk2LFxyXG5cclxuICAvLyBSb2xlc1xyXG4gIHVzZXJSb2xlc0ZvbGRlclBhdGg6IFwiL2V0Yy9haS1mb3JnZS9yb2xlc1wiLCAvLyDQn9GA0LjQutC70LDQtCDRiNC70Y/RhdGDXHJcbiAgc2VsZWN0ZWRSb2xlUGF0aDogXCJcIixcclxuICBmb2xsb3dSb2xlOiB0cnVlLFxyXG5cclxuICAvLyBTdG9yYWdlICYgSGlzdG9yeVxyXG4gIHNhdmVNZXNzYWdlSGlzdG9yeTogdHJ1ZSxcclxuICBjaGF0SGlzdG9yeUZvbGRlclBhdGg6IFwiL2V0Yy9haS1mb3JnZS9jaGF0c1wiLCAvLyDQn9GA0LjQutC70LDQtCDRiNC70Y/RhdGDXHJcbiAgY2hhdEV4cG9ydEZvbGRlclBhdGg6IFwiL2V0Yy9haS1mb3JnZS94cG9ydHNcIiwgLy8g0J/RgNC40LrQu9Cw0LQg0YjQu9GP0YXRg1xyXG5cclxuICAvLyBWaWV3IEJlaGF2aW9yXHJcbiAgb3BlbkNoYXRJblRhYjogZmFsc2UsXHJcbiAgbWF4TWVzc2FnZUhlaWdodDogMzAwLFxyXG5cclxuICAvLyBBcHBlYXJhbmNlXHJcbiAgdXNlckF2YXRhclR5cGU6IFwiaW5pdGlhbHNcIixcclxuICB1c2VyQXZhdGFyQ29udGVudDogXCJVXCIsXHJcbiAgYWlBdmF0YXJUeXBlOiBcImljb25cIixcclxuICBhaUF2YXRhckNvbnRlbnQ6IFwiYm90XCIsXHJcblxyXG4gIC8vIFJBR1xyXG4gIHJhZ0VuYWJsZWQ6IGZhbHNlLFxyXG4gIHJhZ0ZvbGRlclBhdGg6IFwiZXRjL2FpLWZvcmdlL3JhZ1wiLCAvLyDQn9GA0LjQutC70LDQtCDRiNC70Y/RhdGDXHJcbiAgcmFnRW5hYmxlU2VtYW50aWNTZWFyY2g6IHRydWUsXHJcbiAgcmFnRW1iZWRkaW5nTW9kZWw6IFwibm9taWMtZW1iZWQtdGV4dFwiLFxyXG4gIHJhZ0NodW5rU2l6ZTogNTEyLFxyXG4gIHJhZ1NpbWlsYXJpdHlUaHJlc2hvbGQ6IDAuNSxcclxuICByYWdUb3BLOiAzLFxyXG4gIG1heENoYXJzUGVyRG9jOiAxNTAwLFxyXG4gIHJhZ0F1dG9JbmRleE9uU3RhcnR1cDogdHJ1ZSwgXHJcblxyXG4gIC8vIFByb2R1Y3Rpdml0eVxyXG4gIGVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzOiBmYWxzZSxcclxuICBkYWlseVRhc2tGaWxlTmFtZTogXCJUYXNrc19Ub2RheS5tZFwiLFxyXG4gIHVzZUFkdmFuY2VkQ29udGV4dFN0cmF0ZWd5OiBmYWxzZSxcclxuICBlbmFibGVTdW1tYXJpemF0aW9uOiBmYWxzZSxcclxuICBzdW1tYXJpemF0aW9uUHJvbXB0OiBcIlN1bW1hcml6ZSB0aGUga2V5IHBvaW50cyBkaXNjdXNzZWQgc28gZmFyIGluIHRoaXMgY29udmVyc2F0aW9uOlxcblxcbnt0ZXh0X3RvX3N1bW1hcml6ZX1cIixcclxuICBrZWVwTGFzdE5NZXNzYWdlc0JlZm9yZVN1bW1hcnk6IDEwLFxyXG4gIHN1bW1hcml6YXRpb25DaHVua1NpemU6IDE1MDAsXHJcbiAgc3VtbWFyaXphdGlvbk1vZGVsTmFtZTogXCJcIixcclxuXHJcbiAgLy8gU3BlZWNoICYgVHJhbnNsYXRpb25cclxuICBnb29nbGVBcGlLZXk6IFwiXCIsXHJcbiAgc3BlZWNoTGFuZ3VhZ2U6IFwidWstVUFcIixcclxuICBlbmFibGVUcmFuc2xhdGlvbjogZmFsc2UsXHJcbiAgdHJhbnNsYXRpb25UYXJnZXRMYW5ndWFnZTogXCJ1a1wiLFxyXG4gIGdvb2dsZVRyYW5zbGF0aW9uQXBpS2V5OiBcIlwiLFxyXG5cclxuICAvLyBMb2dnZXIgU2V0dGluZ3NcclxuICBjb25zb2xlTG9nTGV2ZWw6IFwiSU5GT1wiLFxyXG4gIGZpbGVMb2dnaW5nRW5hYmxlZDogZmFsc2UsXHJcbiAgZmlsZUxvZ0xldmVsOiBcIldBUk5cIixcclxuICBsb2dDYWxsZXJJbmZvOiBmYWxzZSxcclxuICBsb2dGaWxlUGF0aDogXCJcIiwgLy8gTG9nZ2VyINGB0LDQvCDQv9GW0LTRgdGC0LDQstC40YLRjCDRiNC70Y/RhSDQtNC+INC/0LDQv9C60Lgg0L/Qu9Cw0LPRltC90LBcclxuICBsb2dGaWxlTWF4U2l6ZU1COiA1LFxyXG4gIGZhbGxiYWNrU3VtbWFyaXphdGlvbk1vZGVsTmFtZTogXCJnZW1tYTM6NGJcIixcclxuICBmaXhCcm9rZW5FbW9qaXM6IHRydWUsXHJcbiAgdHJhbnNsYXRpb25Qcm92aWRlcjogJ29sbGFtYScsIC8vINCX0LAg0LfQsNC80L7QstGH0YPQstCw0L3QvdGP0Lwg0LLQuNC80LrQvdC10L3QvlxyXG4gIG9sbGFtYVRyYW5zbGF0aW9uTW9kZWw6ICcnLFxyXG4gIHNpZGViYXJXaWR0aDogdW5kZWZpbmVkLCAvLyDQkNCx0L4gbnVsbC4g0J7Qt9C90LDRh9Cw0ZQsINGJ0L4g0YjQuNGA0LjQvdCwINC90LUg0LLRgdGC0LDQvdC+0LLQu9C10L3QsCDQutC+0YDQuNGB0YLRg9Cy0LDRh9C10LxcclxuICBlbmFibGVUb29sVXNlOiB0cnVlLFxyXG59O1xyXG5cclxuLy8gLS0tINCa0LvQsNGBINCy0LrQu9Cw0LTQutC4INC90LDQu9Cw0YjRgtGD0LLQsNC90YwgLS0tXHJcbmV4cG9ydCBjbGFzcyBPbGxhbWFTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XHJcbiAgcGx1Z2luOiBPbGxhbWFQbHVnaW47XHJcbiAgcHJpdmF0ZSBkZWJvdW5jZWRVcGRhdGVDaGF0UGF0aDogKCkgPT4gdm9pZDtcclxuICBwcml2YXRlIGRlYm91bmNlZFVwZGF0ZVJvbGVQYXRoOiAoKSA9PiB2b2lkO1xyXG4gIHByaXZhdGUgZGVib3VuY2VkVXBkYXRlUmFnUGF0aDogKCkgPT4gdm9pZDtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogT2xsYW1hUGx1Z2luKSB7XHJcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XHJcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuXHJcbiAgICB0aGlzLmRlYm91bmNlZFVwZGF0ZUNoYXRQYXRoID0gZGVib3VuY2UoXHJcbiAgICAgIGFzeW5jICgpID0+IHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJEZWJvdW5jZWQ6IFVwZGF0aW5nIGNoYXQgcGF0aCBhbmQgZW5zdXJpbmcgZm9sZGVyIGV4aXN0cy4uLlwiKTtcclxuICAgICAgICBpZiAodGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIpIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLnVwZGF0ZUNoYXRzRm9sZGVyUGF0aCgpO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZW5zdXJlRm9sZGVyc0V4aXN0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICAxMDAwLFxyXG4gICAgICB0cnVlXHJcbiAgICApO1xyXG5cclxuICAgIHRoaXMuZGVib3VuY2VkVXBkYXRlUm9sZVBhdGggPSBkZWJvdW5jZShcclxuICAgICAgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIkRlYm91bmNlZDogUmVmcmVzaGluZyByb2xlIGxpc3QgZHVlIHRvIHBhdGggY2hhbmdlLi4uXCIpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmxpc3RSb2xlRmlsZXModHJ1ZSk7XHJcbiAgICAgICAgKHRoaXMucGx1Z2luIGFzIE9sbGFtYVBsdWdpbikuZW1pdChcInJvbGVzLXVwZGF0ZWRcIik7XHJcbiAgICAgIH0sXHJcbiAgICAgIDEwMDAsXHJcbiAgICAgIHRydWVcclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5kZWJvdW5jZWRVcGRhdGVSYWdQYXRoID0gZGVib3VuY2UoXHJcbiAgICAgIGFzeW5jICgpID0+IHtcclxuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJEZWJvdW5jZWQ6IFJlLWluZGV4aW5nIFJBRyBkdWUgdG8gcGF0aCBjaGFuZ2UuLi5cIik7XHJcbiAgICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0VuYWJsZWQgJiYgdGhpcy5wbHVnaW4ucmFnU2VydmljZSkge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ucmFnU2VydmljZS5pbmRleERvY3VtZW50cygpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgICAgMTAwMCxcclxuICAgICAgdHJ1ZVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIC8vINCU0L7Qv9C+0LzRltC20L3QsCDRhNGD0L3QutGG0ZbRjyDQtNC70Y8g0YHRgtCy0L7RgNC10L3QvdGPINC30LDQs9C+0LvQvtCy0LrRltCyINGB0LXQutGG0ZbQuVxyXG4gIHByaXZhdGUgY3JlYXRlU2VjdGlvbkhlYWRlcih0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIHRoaXMuY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQgfSkuYWRkQ2xhc3MoXCJhaS1mb3JnZS1zZXR0aW5ncy1oZWFkZXJcIik7XHJcbiAgfVxyXG5cclxuICBkaXNwbGF5KCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcclxuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJBSSBGb3JnZSBTZXR0aW5nc1wiIH0pO1xyXG5cclxuICAgIC8vIC0tLSDQodC10LrRhtGW0Y86IENvbm5lY3Rpb24gJiBNb2RlbCBEZWZhdWx0cyAtLS1cclxuICAgIHRoaXMuY3JlYXRlU2VjdGlvbkhlYWRlcihcIkNvbm5lY3Rpb24gJiBNb2RlbCBEZWZhdWx0c1wiKTtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIk9sbGFtYSBTZXJ2ZXIgVVJMXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiVGhlIFVSTCBvZiB5b3VyIHJ1bm5pbmcgT2xsYW1hIHNlcnZlciAoZS5nLiwgaHR0cDovL2xvY2FsaG9zdDoxMTQzNCBvciBodHRwOi8vMTkyLjE2OC5YLlg6MTE0MzQpLlwiKVxyXG4gICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Mub2xsYW1hU2VydmVyVXJsKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm9sbGFtYVNlcnZlclVybClcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIGxldCB1cmwgPSB2YWx1ZS50cmltKCk7XHJcbiAgICAgICAgICAgIGlmICh1cmwgJiYgIXVybC5zdGFydHNXaXRoKFwiaHR0cDovL1wiKSAmJiAhdXJsLnN0YXJ0c1dpdGgoXCJodHRwczovL1wiKSkge1xyXG4gICAgICAgICAgICAgIHVybCA9IFwiaHR0cDovL1wiICsgdXJsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh1cmwuZW5kc1dpdGgoXCIvXCIpKSB7XHJcbiAgICAgICAgICAgICAgdXJsID0gdXJsLnNsaWNlKDAsIC0xKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vbGxhbWFTZXJ2ZXJVcmwgPSB1cmwgfHwgREVGQVVMVF9TRVRUSU5HUy5vbGxhbWFTZXJ2ZXJVcmw7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBsZXQgbW9kZWxEcm9wZG93bjogRHJvcGRvd25Db21wb25lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIGNvbnN0IHVwZGF0ZU9wdGlvbnMgPSBhc3luYyAoZHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCwgYnV0dG9uPzogRXh0cmFCdXR0b25Db21wb25lbnQpID0+IHtcclxuICAgICAgaWYgKCFkcm9wZG93bikgcmV0dXJuO1xyXG4gICAgICBjb25zdCBjdXJyZW50VmFsID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xyXG4gICAgICBkcm9wZG93bi5zZWxlY3RFbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICBkcm9wZG93bi5hZGRPcHRpb24oXCJcIiwgXCJMb2FkaW5nIG1vZGVscy4uLlwiKTtcclxuICAgICAgZHJvcGRvd24uc2V0RGlzYWJsZWQodHJ1ZSk7XHJcbiAgICAgIGJ1dHRvbj8uc2V0RGlzYWJsZWQodHJ1ZSkuc2V0SWNvbihcImxvYWRlclwiKTtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdldE1vZGVscygpO1xyXG4gICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiLS0gU2VsZWN0IGRlZmF1bHQgbW9kZWwgLS1cIik7XHJcbiAgICAgICAgaWYgKG1vZGVscyAmJiBtb2RlbHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgbW9kZWxzLmZvckVhY2gobW9kZWxOYW1lID0+IHtcclxuICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKG1vZGVsTmFtZSwgbW9kZWxOYW1lKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgLy8g0JLRgdGC0LDQvdC+0LLQu9GO0ZTQvNC+INC30L3QsNGH0LXQvdC90Y8sINGC0ZbQu9GM0LrQuCDRj9C60YnQviDQstC+0L3QviDRlCDRgyDRgdC/0LjRgdC60YNcclxuICAgICAgICAgIGRyb3Bkb3duLnNldFZhbHVlKG1vZGVscy5pbmNsdWRlcyhjdXJyZW50VmFsKSA/IGN1cnJlbnRWYWwgOiBcIlwiKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiTm8gbW9kZWxzIGZvdW5kXCIpO1xyXG4gICAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUoXCJcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIGZldGNoaW5nIG1vZGVscyBmb3Igc2V0dGluZ3M6XCIsIGVycm9yKTtcclxuICAgICAgICBkcm9wZG93bi5zZWxlY3RFbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIkVycm9yIGxvYWRpbmcgbW9kZWxzIVwiKTtcclxuICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZShcIlwiKTtcclxuICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICBkcm9wZG93bi5zZXREaXNhYmxlZChmYWxzZSk7XHJcbiAgICAgICAgYnV0dG9uPy5zZXREaXNhYmxlZChmYWxzZSkuc2V0SWNvbihcInJlZnJlc2gtY3dcIik7XHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiRGVmYXVsdCBNb2RlbCBOYW1lXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiVGhlIGRlZmF1bHQgT2xsYW1hIG1vZGVsIGZvciBuZXcgY2hhdHMuXCIpXHJcbiAgICAgIC5hZGREcm9wZG93bihhc3luYyBkcm9wZG93biA9PiB7XHJcbiAgICAgICAgbW9kZWxEcm9wZG93biA9IGRyb3Bkb3duO1xyXG4gICAgICAgIGRyb3Bkb3duLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZSA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgYXdhaXQgdXBkYXRlT3B0aW9ucyhkcm9wZG93bik7IC8vINCf0L7Rh9Cw0YLQutC+0LLQtSDQt9Cw0LLQsNC90YLQsNC20LXQvdC90Y9cclxuICAgICAgfSlcclxuICAgICAgLmFkZEV4dHJhQnV0dG9uKGJ1dHRvbiA9PiB7XHJcbiAgICAgICAgYnV0dG9uXHJcbiAgICAgICAgICAuc2V0SWNvbihcInJlZnJlc2gtY3dcIilcclxuICAgICAgICAgIC5zZXRUb29sdGlwKFwiUmVmcmVzaCBtb2RlbCBsaXN0XCIpXHJcbiAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIGF3YWl0IHVwZGF0ZU9wdGlvbnMobW9kZWxEcm9wZG93biwgYnV0dG9uKTtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShcIk1vZGVsIGxpc3QgcmVmcmVzaGVkIVwiKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJEZWZhdWx0IFRlbXBlcmF0dXJlXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiQ29udHJvbHMgcmFuZG9tbmVzcyAoMC4wID0gZGV0ZXJtaW5pc3RpYywgPjEuMCA9IGNyZWF0aXZlKS5cIilcclxuICAgICAgLmFkZFNsaWRlcihzbGlkZXIgPT5cclxuICAgICAgICBzbGlkZXJcclxuICAgICAgICAgIC5zZXRMaW1pdHMoMCwgMiwgMC4xKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnRlbXBlcmF0dXJlKVxyXG4gICAgICAgICAgLnNldER5bmFtaWNUb29sdGlwKClcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRlbXBlcmF0dXJlID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJDb250ZXh0IFdpbmRvdyBTaXplIChUb2tlbnMpXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiTWF4IHRva2VucyBtb2RlbCBjb25zaWRlcnMuIFJlcXVpcmVzIHJlc3RhcnQvcmVsb2FkIGlmIGNoYW5nZWQgd2hpbGUgbW9kZWwgaXMgbG9hZGVkLlwiKVxyXG4gICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuY29udGV4dFdpbmRvdy50b1N0cmluZygpKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3cudG9TdHJpbmcoKSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLnRyaW0oKSwgMTApO1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb250ZXh0V2luZG93ID0gIWlzTmFOKG51bSkgJiYgbnVtID4gMCA/IG51bSA6IERFRkFVTFRfU0VUVElOR1MuY29udGV4dFdpbmRvdztcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiRW5hYmxlIFRvb2wgVXNlIChFeHBlcmltZW50YWwpXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiQWxsb3cgQUkgbW9kZWxzIHRvIHVzZSByZWdpc3RlcmVkIHRvb2xzL2FnZW50cyB0byBwZXJmb3JtIGFjdGlvbnMuIFJlcXVpcmVzIGNvbXBhdGlibGUgbW9kZWxzIChlLmcuLCBMbGFtYSAzLjEsIHNvbWUgTWlzdHJhbCBtb2RlbHMpLlwiKVxyXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PlxyXG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVUb29sVXNlKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVUb29sVXNlID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAvLyDQnNC+0LbQu9C40LLQviwg0L/QvtGC0YDRltCx0L3QviDRgdC/0L7QstGW0YHRgtC40YLQuCBPbGxhbWFTZXJ2aWNlINCw0LHQviBQcm9tcHRTZXJ2aWNlINC/0YDQviDQt9C80ZbQvdGDXHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIC8vIC0tLSDQodC10LrRhtGW0Y86IFZpZXcgQmVoYXZpb3IgLS0tXHJcbiAgICB0aGlzLmNyZWF0ZVNlY3Rpb25IZWFkZXIoXCJWaWV3IEJlaGF2aW9yXCIpO1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiT3BlbiBDaGF0IGluIE1haW4gVGFiXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiT046IE9wZW4gaW4gYSBtYWluIHRhYi4gT0ZGOiBPcGVuIGluIHRoZSByaWdodCBzaWRlYmFyLlwiKVxyXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PlxyXG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuQ2hhdEluVGFiKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuQ2hhdEluVGFiID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIG5ldyBOb3RpY2UoXCJDaGF0IHZpZXcgbG9jYXRpb24gc2V0dGluZyBzYXZlZC4gUmUtb3BlbiB0aGUgdmlldyB0byBhcHBseS5cIiwgNTAwMCk7XHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJNYXggTWVzc2FnZSBIZWlnaHQgKHBpeGVscylcIilcclxuICAgICAgLnNldERlc2MoXCJDb2xsYXBzZSBsb25nZXIgbWVzc2FnZXMgd2l0aCAnU2hvdyBNb3JlJy4gMCBkaXNhYmxlcy5cIilcclxuICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIkV4YW1wbGU6IDMwMFwiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1heE1lc3NhZ2VIZWlnaHQudG9TdHJpbmcoKSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLnRyaW0oKSwgMTApO1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXhNZXNzYWdlSGVpZ2h0ID0gIWlzTmFOKG51bSkgJiYgbnVtID49IDAgPyBudW0gOiBERUZBVUxUX1NFVFRJTkdTLm1heE1lc3NhZ2VIZWlnaHQ7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi52aWV3Py5jaGVja0FsbE1lc3NhZ2VzRm9yQ29sbGFwc2luZz8uKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIC8vIC0tLSDQodC10LrRhtGW0Y86IEFwcGVhcmFuY2UgLS0tXHJcbiAgICB0aGlzLmNyZWF0ZVNlY3Rpb25IZWFkZXIoXCJBcHBlYXJhbmNlXCIpO1xyXG5cclxuICAgIC8vIFVzZXIgQXZhdGFyXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZShcIlVzZXIgQXZhdGFyIFN0eWxlXCIpLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+XHJcbiAgICAgIGRyb3Bkb3duXHJcbiAgICAgICAgLmFkZE9wdGlvbihcImluaXRpYWxzXCIsIFwiSW5pdGlhbHNcIilcclxuICAgICAgICAuYWRkT3B0aW9uKFwiaWNvblwiLCBcIkljb25cIilcclxuICAgICAgICAuYWRkT3B0aW9uKFwiaW1hZ2VcIiwgXCJJbWFnZSAoVmF1bHQgUGF0aClcIikgLy8g0JTQvtC00LDQvdC+XHJcbiAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJBdmF0YXJUeXBlKVxyXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IEF2YXRhclR5cGUpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJBdmF0YXJUeXBlID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIHRoaXMuZGlzcGxheSgpOyAvLyDQn9C10YDQtdC80LDQu9GO0LLQsNGC0Lgg0L3QsNC70LDRiNGC0YPQstCw0L3QvdGPXHJcbiAgICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdXNlckF2YXRhclNldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0RGVzYyhcIiBcIik7IC8vINCf0YPRgdGC0LjQuSDQvtC/0LjRgSDQtNC70Y8g0LLQuNGA0ZbQstC90Y7QstCw0L3QvdGPXHJcbiAgICB1c2VyQXZhdGFyU2V0dGluZy5jb250cm9sRWwuYWRkQ2xhc3MoXCJhaS1mb3JnZS1hdmF0YXItY29udGVudC1zZXR0aW5nXCIpO1xyXG5cclxuICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VyQXZhdGFyVHlwZSA9PT0gXCJpbml0aWFsc1wiKSB7XHJcbiAgICAgIHVzZXJBdmF0YXJTZXR0aW5nLnNldE5hbWUoXCJVc2VyIEluaXRpYWxzXCIpLnNldERlc2MoXCJNYXggMiBjaGFycy5cIik7XHJcbiAgICAgIHVzZXJBdmF0YXJTZXR0aW5nLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckF2YXRhckNvbnRlbnQpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgIC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0LTQtdGE0L7Qu9GC0L3QtSDQt9C90LDRh9C10L3QvdGPINC3IERFRkFVTFRfU0VUVElOR1MsINGP0LrRidC+INC/0L7Qu9C1INC/0L7RgNC+0LbQvdGUXHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VyQXZhdGFyQ29udGVudCA9IHZhbHVlLnRyaW0oKS5zdWJzdHJpbmcoMCwgMikgfHwgREVGQVVMVF9TRVRUSU5HUy51c2VyQXZhdGFyQ29udGVudDtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICB9IGVsc2UgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJBdmF0YXJUeXBlID09PSBcImljb25cIikge1xyXG4gICAgICB1c2VyQXZhdGFyU2V0dGluZy5zZXROYW1lKFwiVXNlciBJY29uIElEXCIpLnNldERlc2MoJ09ic2lkaWFuIGljb24gSUQgKGUuZy4sIFwidXNlclwiKS4nKTtcclxuICAgICAgdXNlckF2YXRhclNldHRpbmcuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgdGV4dFxyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwidXNlclwiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJBdmF0YXJDb250ZW50KVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckF2YXRhckNvbnRlbnQgPSB2YWx1ZS50cmltKCkgfHwgXCJ1c2VyXCI7IC8vINCU0LXRhNC+0LvRgtC90LAg0ZbQutC+0L3QutCwXHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIH0gZWxzZSBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckF2YXRhclR5cGUgPT09IFwiaW1hZ2VcIikge1xyXG4gICAgICB1c2VyQXZhdGFyU2V0dGluZy5zZXROYW1lKFwiVXNlciBBdmF0YXIgSW1hZ2UgUGF0aFwiKTtcclxuICAgICAgdXNlckF2YXRhclNldHRpbmcuc2V0RGVzYyhcIkZ1bGwgcGF0aCB0byB0aGUgaW1hZ2UgZmlsZSAocG5nL2pwZWcvanBnKSB3aXRoaW4geW91ciB2YXVsdC5cIik7XHJcbiAgICAgIHVzZXJBdmF0YXJTZXR0aW5nLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgIHRleHQgLy8g0J/QvtC70LUg0LTQu9GPINCy0LLQtdC00LXQvdC90Y8g0YjQu9GP0YXRg1xyXG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiZS5nLiwgQXNzZXRzL0ltYWdlcy91c2VyLnBuZ1wiKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJBdmF0YXJDb250ZW50KVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgLy8gLS0tINCS0JjQn9Cg0JDQktCb0JXQndCd0K86INCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0LvQvtC60LDQu9GM0L3RgyDQt9C80ZbQvdC90YMgLS0tXHJcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkpO1xyXG4gICAgICAgICAgICBpZiAobm9ybWFsaXplZFBhdGggPT09IFwiXCIgfHwgL1xcLihwbmd8anBnfGpwZWcpJC9pLnRlc3Qobm9ybWFsaXplZFBhdGgpKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckF2YXRhckNvbnRlbnQgPSBub3JtYWxpemVkUGF0aDtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiSW52YWxpZCBwYXRoLiBQbGVhc2UgcHJvdmlkZSBhIHBhdGggdG8gYSAucG5nIG9yIC5qcGVnL2pwZyBmaWxlLCBvciBsZWF2ZSBlbXB0eS5cIik7XHJcbiAgICAgICAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VyQXZhdGFyQ29udGVudCk7IC8vINCf0L7QstC10YDRgtCw0ZTQvNC+INGB0YLQsNGA0LUg0LfQvdCw0YfQtdC90L3Rj1xyXG4gICAgICAgICAgICAgIHJldHVybjsgLy8g0J3QtSDQt9Cx0LXRgNGW0LPQsNGU0LzQvlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vIC0tLSDQmtGW0L3QtdGG0Ywg0LLQuNC/0YDQsNCy0LvQtdC90L3RjyAtLS1cclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEFJIEF2YXRhclxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJBSSBBdmF0YXIgU3R5bGVcIikuYWRkRHJvcGRvd24oZHJvcGRvd24gPT5cclxuICAgICAgZHJvcGRvd25cclxuICAgICAgICAuYWRkT3B0aW9uKFwiaW5pdGlhbHNcIiwgXCJJbml0aWFsc1wiKVxyXG4gICAgICAgIC5hZGRPcHRpb24oXCJpY29uXCIsIFwiSWNvblwiKVxyXG4gICAgICAgIC5hZGRPcHRpb24oXCJpbWFnZVwiLCBcIkltYWdlIChWYXVsdCBQYXRoKVwiKSAvLyDQlNC+0LTQsNC90L5cclxuICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlBdmF0YXJUeXBlKVxyXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IEF2YXRhclR5cGUpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFpQXZhdGFyVHlwZSA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB0aGlzLmRpc3BsYXkoKTsgLy8g0J/QtdGA0LXQvNCw0LvRjtCy0LDRgtC4XHJcbiAgICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgYWlBdmF0YXJTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldERlc2MoXCIgXCIpO1xyXG4gICAgYWlBdmF0YXJTZXR0aW5nLmNvbnRyb2xFbC5hZGRDbGFzcyhcImFpLWZvcmdlLWF2YXRhci1jb250ZW50LXNldHRpbmdcIik7XHJcblxyXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmFpQXZhdGFyVHlwZSA9PT0gXCJpbml0aWFsc1wiKSB7XHJcbiAgICAgIGFpQXZhdGFyU2V0dGluZy5zZXROYW1lKFwiQUkgSW5pdGlhbHNcIikuc2V0RGVzYyhcIk1heCAyIGNoYXJzLlwiKTtcclxuICAgICAgYWlBdmF0YXJTZXR0aW5nLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlBdmF0YXJDb250ZW50KS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5haUF2YXRhckNvbnRlbnQgPSB2YWx1ZS50cmltKCkuc3Vic3RyaW5nKDAsIDIpIHx8IERFRkFVTFRfU0VUVElOR1MuYWlBdmF0YXJDb250ZW50O1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIH0gZWxzZSBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlBdmF0YXJUeXBlID09PSBcImljb25cIikge1xyXG4gICAgICBhaUF2YXRhclNldHRpbmcuc2V0TmFtZShcIkFJIEljb24gSURcIikuc2V0RGVzYygnT2JzaWRpYW4gaWNvbiBJRCAoZS5nLiwgXCJib3RcIikuJyk7XHJcbiAgICAgIGFpQXZhdGFyU2V0dGluZy5hZGRUZXh0KHRleHQgPT5cclxuICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoXCJib3RcIilcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5haUF2YXRhckNvbnRlbnQpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5haUF2YXRhckNvbnRlbnQgPSB2YWx1ZS50cmltKCkgfHwgXCJib3RcIjsgLy8g0JTQtdGE0L7Qu9GC0L3QsCDRltC60L7QvdC60LBcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgfSBlbHNlIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5haUF2YXRhclR5cGUgPT09IFwiaW1hZ2VcIikge1xyXG4gICAgICBhaUF2YXRhclNldHRpbmcuc2V0TmFtZShcIkFJIEF2YXRhciBJbWFnZSBQYXRoXCIpO1xyXG4gICAgICBhaUF2YXRhclNldHRpbmcuc2V0RGVzYyhcIkZ1bGwgcGF0aCB0byB0aGUgaW1hZ2UgZmlsZSAocG5nL2pwZWcvanBnKSB3aXRoaW4geW91ciB2YXVsdC5cIik7XHJcbiAgICAgIGFpQXZhdGFyU2V0dGluZy5hZGRUZXh0KHRleHQgPT5cclxuICAgICAgICB0ZXh0IC8vINCf0L7Qu9C1INC00LvRjyDQstCy0LXQtNC10L3QvdGPINGI0LvRj9GF0YNcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImUuZy4sIEFzc2V0cy9JbWFnZXMvYWkucG5nXCIpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlBdmF0YXJDb250ZW50KVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgLy8gLS0tINCS0JjQn9Cg0JDQktCb0JXQndCd0K86INCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0LvQvtC60LDQu9GM0L3RgyDQt9C80ZbQvdC90YMgLS0tXHJcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkpO1xyXG4gICAgICAgICAgICBpZiAobm9ybWFsaXplZFBhdGggPT09IFwiXCIgfHwgL1xcLihwbmd8anBnfGpwZWcpJC9pLnRlc3Qobm9ybWFsaXplZFBhdGgpKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlBdmF0YXJDb250ZW50ID0gbm9ybWFsaXplZFBhdGg7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgbmV3IE5vdGljZShcIkludmFsaWQgcGF0aC4gUGxlYXNlIHByb3ZpZGUgYSBwYXRoIHRvIGEgLnBuZyBvciAuanBlZy9qcGcgZmlsZSwgb3IgbGVhdmUgZW1wdHkuXCIpO1xyXG4gICAgICAgICAgICAgIHRleHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlBdmF0YXJDb250ZW50KTtcclxuICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy8gLS0tINCa0ZbQvdC10YbRjCDQstC40L/RgNCw0LLQu9C10L3QvdGPIC0tLVxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gLS0tINCh0LXQutGG0ZbRjzogUm9sZXMgJiBQZXJzb25hcyAtLS1cclxuICAgIHRoaXMuY3JlYXRlU2VjdGlvbkhlYWRlcihcIlJvbGVzICYgUGVyc29uYXNcIik7XHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJDdXN0b20gUm9sZXMgRm9sZGVyIFBhdGhcIilcclxuICAgICAgLnNldERlc2MoXCJGb2xkZXIgd2l0aCBjdXN0b20gcm9sZSAoLm1kKSBmaWxlcy5cIilcclxuICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnVzZXJSb2xlc0ZvbGRlclBhdGgpXHJcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlclJvbGVzRm9sZGVyUGF0aClcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIC8vIC0tLSDQktCY0J/QoNCQ0JLQm9CV0J3QndCvOiDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+IG5vcm1hbGl6ZVBhdGggLS0tXHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJSb2xlc0ZvbGRlclBhdGggPVxyXG4gICAgICAgICAgICAgIG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpKSB8fCBERUZBVUxUX1NFVFRJTkdTLnVzZXJSb2xlc0ZvbGRlclBhdGg7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB0aGlzLmRlYm91bmNlZFVwZGF0ZVJvbGVQYXRoKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiQWx3YXlzIEFwcGx5IFNlbGVjdGVkIFJvbGVcIilcclxuICAgICAgLnNldERlc2MoXCJBbHdheXMgdXNlIHRoZSBzZWxlY3RlZCByb2xlIGFzIHN5c3RlbSBwcm9tcHQuXCIpXHJcbiAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+XHJcbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZvbGxvd1JvbGUpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmZvbGxvd1JvbGUgPSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgLy8gLS0tINCh0LXQutGG0ZbRjzogU3RvcmFnZSAmIEhpc3RvcnkgLS0tXHJcbiAgICB0aGlzLmNyZWF0ZVNlY3Rpb25IZWFkZXIoXCJTdG9yYWdlICYgSGlzdG9yeVwiKTtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIlNhdmUgTWVzc2FnZSBIaXN0b3J5XCIpXHJcbiAgICAgIC5zZXREZXNjKFwiU2F2ZSBjaGF0IGNvbnZlcnNhdGlvbnMgdG8gZmlsZXMuXCIpXHJcbiAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+XHJcbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNhdmVNZXNzYWdlSGlzdG9yeSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2F2ZU1lc3NhZ2VIaXN0b3J5ID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3Muc2F2ZU1lc3NhZ2VIaXN0b3J5KSB7XHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgIC5zZXROYW1lKFwiQ2hhdCBIaXN0b3J5IEZvbGRlciBQYXRoXCIpXHJcbiAgICAgICAgLnNldERlc2MoJ0ZvbGRlciB0byBzdG9yZSBjaGF0IGhpc3RvcnkgKC5qc29uIGZpbGVzKS4gVXNlIFwiL1wiIGZvciB2YXVsdCByb290LicpXHJcbiAgICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgICAgdGV4dFxyXG4gICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5jaGF0SGlzdG9yeUZvbGRlclBhdGgpXHJcbiAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0SGlzdG9yeUZvbGRlclBhdGgpXHJcbiAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgICAgLy8gLS0tINCS0JjQn9Cg0JDQktCb0JXQndCd0K86INCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4gbm9ybWFsaXplUGF0aCAtLS1cclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0SGlzdG9yeUZvbGRlclBhdGggPVxyXG4gICAgICAgICAgICAgICAgdmFsdWUudHJpbSgpID09PSBcIi9cIiA/IFwiL1wiIDogbm9ybWFsaXplUGF0aCh2YWx1ZS50cmltKCkpIHx8IERFRkFVTFRfU0VUVElOR1MuY2hhdEhpc3RvcnlGb2xkZXJQYXRoO1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgIHRoaXMuZGVib3VuY2VkVXBkYXRlQ2hhdFBhdGgoKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiQ2hhdCBFeHBvcnQgRm9sZGVyIFBhdGhcIilcclxuICAgICAgLnNldERlc2MoXCJEZWZhdWx0IGZvbGRlciBmb3IgZXhwb3J0ZWQgTWFya2Rvd24gY2hhdHMuXCIpXHJcbiAgICAgIC5hZGRUZXh0KHRleHQgPT5cclxuICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5jaGF0RXhwb3J0Rm9sZGVyUGF0aCB8fCBcIlZhdWx0IFJvb3RcIilcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5jaGF0RXhwb3J0Rm9sZGVyUGF0aClcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIC8vIC0tLSDQktCY0J/QoNCQ0JLQm9CV0J3QndCvOiDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+IG5vcm1hbGl6ZVBhdGggLS0tXHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmNoYXRFeHBvcnRGb2xkZXJQYXRoID1cclxuICAgICAgICAgICAgICBub3JtYWxpemVQYXRoKHZhbHVlLnRyaW0oKSkgfHwgREVGQVVMVF9TRVRUSU5HUy5jaGF0RXhwb3J0Rm9sZGVyUGF0aDtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcikgYXdhaXQgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZW5zdXJlRm9sZGVyc0V4aXN0KCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIC8vIC0tLSDQodC10LrRhtGW0Y86IFJldHJpZXZhbC1BdWdtZW50ZWQgR2VuZXJhdGlvbiAoUkFHKSAtLS1cclxuICAgIHRoaXMuY3JlYXRlU2VjdGlvbkhlYWRlcihcIlJldHJpZXZhbC1BdWdtZW50ZWQgR2VuZXJhdGlvbiAoUkFHKVwiKTtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIkVuYWJsZSBSQUdcIilcclxuICAgICAgLnNldERlc2MoXCJBbGxvdyByZXRyaWV2aW5nIGluZm8gZnJvbSBub3RlcyBmb3IgY29udGV4dC5cIilcclxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT5cclxuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlZCkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlZCA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcclxuICAgICAgICAgIGlmICh2YWx1ZSkgdGhpcy5kZWJvdW5jZWRVcGRhdGVSYWdQYXRoKCk7XHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdFbmFibGVkKSB7XHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgIC5zZXROYW1lKFwiUkFHIERvY3VtZW50cyBGb2xkZXIgUGF0aFwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiRm9sZGVyIHdpdGggbm90ZXMgZm9yIFJBRy5cIilcclxuICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnJhZ0ZvbGRlclBhdGgpXHJcbiAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdGb2xkZXJQYXRoKVxyXG4gICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgIC8vIC0tLSDQktCY0J/QoNCQ0JLQm9CV0J3QndCvOiDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+IG5vcm1hbGl6ZVBhdGggLS0tXHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRm9sZGVyUGF0aCA9IG5vcm1hbGl6ZVBhdGgodmFsdWUudHJpbSgpKSB8fCBERUZBVUxUX1NFVFRJTkdTLnJhZ0ZvbGRlclBhdGg7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgdGhpcy5kZWJvdW5jZWRVcGRhdGVSYWdQYXRoKCk7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4udXBkYXRlRGFpbHlUYXNrRmlsZVBhdGg/LigpO1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvYWRBbmRQcm9jZXNzSW5pdGlhbFRhc2tzPy4oKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICApO1xyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAuc2V0TmFtZShcIkVuYWJsZSBTZW1hbnRpYyBTZWFyY2hcIilcclxuICAgICAgICAuc2V0RGVzYyhcIlVzZSBlbWJlZGRpbmdzIChtb3JlIGFjY3VyYXRlKS4gSWYgT0ZGLCB1c2VzIGtleXdvcmQgc2VhcmNoLlwiKVxyXG4gICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+XHJcbiAgICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlU2VtYW50aWNTZWFyY2gpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlU2VtYW50aWNTZWFyY2ggPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICAgICAgICB0aGlzLmRlYm91bmNlZFVwZGF0ZVJhZ1BhdGgoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0VuYWJsZVNlbWFudGljU2VhcmNoKSB7XHJcbiAgICAgICAgbGV0IGVtYmVkZGluZ0Ryb3Bkb3duOiBEcm9wZG93bkNvbXBvbmVudCB8IG51bGwgPSBudWxsO1xyXG4gICAgICAgIGNvbnN0IHVwZGF0ZUVtYmVkZGluZ09wdGlvbnMgPSBhc3luYyAoZHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCwgYnV0dG9uPzogRXh0cmFCdXR0b25Db21wb25lbnQpID0+IHtcclxuICAgICAgICAgIGlmICghZHJvcGRvd24pIHJldHVybjtcclxuICAgICAgICAgIGNvbnN0IHByZXZpb3VzVmFsdWUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdFbWJlZGRpbmdNb2RlbDtcclxuICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oXCJcIiwgXCJMb2FkaW5nIG1vZGVscy4uLlwiKTtcclxuICAgICAgICAgIGRyb3Bkb3duLnNldERpc2FibGVkKHRydWUpO1xyXG4gICAgICAgICAgYnV0dG9uPy5zZXREaXNhYmxlZCh0cnVlKS5zZXRJY29uKFwibG9hZGVyXCIpO1xyXG4gICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgbW9kZWxzID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZXRNb2RlbHMoKTtcclxuICAgICAgICAgICAgZHJvcGRvd24uc2VsZWN0RWwuaW5uZXJIVE1MID0gXCJcIjtcclxuICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiLS0gU2VsZWN0IEVtYmVkZGluZyBNb2RlbCAtLVwiKTtcclxuICAgICAgICAgICAgY29uc3QgY29tbW9uRW1iZWRNb2RlbHMgPSBbXHJcbiAgICAgICAgICAgICAgXCJub21pYy1lbWJlZC10ZXh0XCIsXHJcbiAgICAgICAgICAgICAgXCJhbGwtbWluaWxtXCIsXHJcbiAgICAgICAgICAgICAgXCJteGJhaS1lbWJlZC1sYXJnZVwiLFxyXG4gICAgICAgICAgICAgIFwiYmdlLWJhc2UtZW5cIixcclxuICAgICAgICAgICAgICBcImd0ZS1iYXNlXCIsXHJcbiAgICAgICAgICAgIF07XHJcbiAgICAgICAgICAgIGNvbW1vbkVtYmVkTW9kZWxzLmZvckVhY2gobW9kZWxOYW1lID0+IGRyb3Bkb3duLmFkZE9wdGlvbihtb2RlbE5hbWUsIG1vZGVsTmFtZSkpO1xyXG4gICAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oXCItLS1cIiwgXCItLS0gT3RoZXIgSW5zdGFsbGVkIE1vZGVscyAtLS1cIikuc2V0RGlzYWJsZWQodHJ1ZSk7XHJcbiAgICAgICAgICAgIGlmIChtb2RlbHMgJiYgbW9kZWxzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICBtb2RlbHMuZm9yRWFjaChtb2RlbE5hbWUgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFjb21tb25FbWJlZE1vZGVscy5pbmNsdWRlcyhtb2RlbE5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihtb2RlbE5hbWUsIG1vZGVsTmFtZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy8g0JLRgdGC0LDQvdC+0LLQu9GO0ZTQvNC+INC/0L7Qv9C10YDQtdC00L3RlCDQt9C90LDRh9C10L3QvdGPLCDRj9C60YnQviDQstC+0L3QviDRlCDRgyDRgdC/0LjRgdC60YMsINCw0LHQviDQv9C10YDRiNC40Lkg0YDQtdC60L7QvNC10L3QtNC+0LLQsNC90LjQuVxyXG4gICAgICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZShcclxuICAgICAgICAgICAgICBtb2RlbHMuaW5jbHVkZXMocHJldmlvdXNWYWx1ZSkgPyBwcmV2aW91c1ZhbHVlIDogY29tbW9uRW1iZWRNb2RlbHMubGVuZ3RoID4gMCA/IGNvbW1vbkVtYmVkTW9kZWxzWzBdIDogXCJcIlxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGZldGNoaW5nIG1vZGVscyBmb3IgZW1iZWRkaW5nIGRyb3Bkb3duOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIkVycm9yIGxvYWRpbmcgbW9kZWxzIVwiKTtcclxuICAgICAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUocHJldmlvdXNWYWx1ZSk7IC8vINCf0L7QstC10YDRgtCw0ZTQvNC+INGB0YLQsNGA0LUg0LfQvdCw0YfQtdC90L3RjyDQv9GA0Lgg0L/QvtC80LjQu9GG0ZZcclxuICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgIGRyb3Bkb3duLnNldERpc2FibGVkKGZhbHNlKTtcclxuICAgICAgICAgICAgYnV0dG9uPy5zZXREaXNhYmxlZChmYWxzZSkuc2V0SWNvbihcInJlZnJlc2gtY3dcIik7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAgIC5zZXROYW1lKFwiRW1iZWRkaW5nIE1vZGVsIE5hbWVcIilcclxuICAgICAgICAgIC5zZXREZXNjKFwiT2xsYW1hIG1vZGVsIGZvciBlbWJlZGRpbmdzLlwiKVxyXG4gICAgICAgICAgLnNldENsYXNzKFwib2xsYW1hLW1vZGVsLXNldHRpbmctY29udGFpbmVyXCIpXHJcbiAgICAgICAgICAuYWRkRHJvcGRvd24oYXN5bmMgZHJvcGRvd24gPT4ge1xyXG4gICAgICAgICAgICBlbWJlZGRpbmdEcm9wZG93biA9IGRyb3Bkb3duO1xyXG4gICAgICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW1iZWRkaW5nTW9kZWwgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB0aGlzLmRlYm91bmNlZFVwZGF0ZVJhZ1BhdGgoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGF3YWl0IHVwZGF0ZUVtYmVkZGluZ09wdGlvbnMoZHJvcGRvd24pO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgICAgIC5hZGRFeHRyYUJ1dHRvbihidXR0b24gPT4ge1xyXG4gICAgICAgICAgICBidXR0b25cclxuICAgICAgICAgICAgICAuc2V0SWNvbihcInJlZnJlc2gtY3dcIilcclxuICAgICAgICAgICAgICAuc2V0VG9vbHRpcChcIlJlZnJlc2ggbW9kZWwgbGlzdFwiKVxyXG4gICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHVwZGF0ZUVtYmVkZGluZ09wdGlvbnMoZW1iZWRkaW5nRHJvcGRvd24sIGJ1dHRvbik7XHJcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKFwiTW9kZWwgbGlzdCByZWZyZXNoZWQhXCIpO1xyXG4gICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAuc2V0TmFtZShcIkNodW5rIFNpemUgKENoYXJhY3RlcnMpXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIlNpemUgb2YgdGV4dCBjaHVua3MgZm9yIGluZGV4aW5nLlwiKVxyXG4gICAgICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFN0cmluZyhERUZBVUxUX1NFVFRJTkdTLnJhZ0NodW5rU2l6ZSkpXHJcbiAgICAgICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdDaHVua1NpemUpKVxyXG4gICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBudW0gPSBwYXJzZUludCh2YWx1ZS50cmltKCksIDEwKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0NodW5rU2l6ZSA9ICFpc05hTihudW0pICYmIG51bSA+IDUwID8gbnVtIDogREVGQVVMVF9TRVRUSU5HUy5yYWdDaHVua1NpemU7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZGVib3VuY2VkVXBkYXRlUmFnUGF0aCgpO1xyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgLnNldE5hbWUoXCJTaW1pbGFyaXR5IFRocmVzaG9sZFwiKVxyXG4gICAgICAgICAgLnNldERlc2MoXCJNaW4gcmVsZXZhbmNlIHNjb3JlICgwLjAtMS4wKS4gSGlnaGVyID0gc3RyaWN0ZXIgbWF0Y2hpbmcuXCIpXHJcbiAgICAgICAgICAuYWRkU2xpZGVyKChzbGlkZXI6IFNsaWRlckNvbXBvbmVudCkgPT5cclxuICAgICAgICAgICAgc2xpZGVyXHJcbiAgICAgICAgICAgICAgLnNldExpbWl0cygwLCAxLCAwLjA1KVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdTaW1pbGFyaXR5VGhyZXNob2xkKVxyXG4gICAgICAgICAgICAgIC5zZXREeW5hbWljVG9vbHRpcCgpXHJcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ1NpbWlsYXJpdHlUaHJlc2hvbGQgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgLnNldE5hbWUoXCJUb3AgSyBSZXN1bHRzXCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIk1heCBudW1iZXIgb2YgcmVsZXZhbnQgY2h1bmtzIHRvIHJldHJpZXZlLlwiKVxyXG4gICAgICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFN0cmluZyhERUZBVUxUX1NFVFRJTkdTLnJhZ1RvcEspKVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnVG9wSykpXHJcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLnRyaW0oKSwgMTApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnVG9wSyA9ICFpc05hTihudW0pICYmIG51bSA+IDAgPyBudW0gOiBERUZBVUxUX1NFVFRJTkdTLnJhZ1RvcEs7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgKTtcclxuICAgICAgfVxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAuc2V0TmFtZShcIk1heCBDaGFycyBQZXIgRG9jdW1lbnQgKER1cmluZyBDb250ZXh0IEJ1aWxkKVwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiTGltaXRzIGNoYXJhY3RlcnMgaW5jbHVkZWQgcGVyIHJldHJpZXZlZCBkb2N1bWVudCBpbiB0aGUgZmluYWwgcHJvbXB0ICgwPW5vIGxpbWl0KS5cIilcclxuICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihTdHJpbmcoREVGQVVMVF9TRVRUSU5HUy5tYXhDaGFyc1BlckRvYykpXHJcbiAgICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MubWF4Q2hhcnNQZXJEb2MpKVxyXG4gICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLnRyaW0oKSwgMTApO1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm1heENoYXJzUGVyRG9jID0gIWlzTmFOKG51bSkgJiYgbnVtID49IDAgPyBudW0gOiBERUZBVUxUX1NFVFRJTkdTLm1heENoYXJzUGVyRG9jO1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5jcmVhdGVTZWN0aW9uSGVhZGVyKFwiQWR2YW5jZWQgQ29udGV4dCBNYW5hZ2VtZW50XCIpO1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKFwiVXNlIEFkdmFuY2VkIENvbnRleHQgU3RyYXRlZ3lcIilcclxuICAgICAgLnNldERlc2MoXCJFbmFibGUgYXV0b21hdGljIGNoYXQgc3VtbWFyaXphdGlvbiBhbmQgbWVzc2FnZSBjaHVua2luZyBmb3IgbG9uZyBjb252ZXJzYXRpb25zLlwiKVxyXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PlxyXG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy51c2VBZHZhbmNlZENvbnRleHRTdHJhdGVneSkub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlQWR2YW5jZWRDb250ZXh0U3RyYXRlZ3kgPSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgdGhpcy5kaXNwbGF5KCk7IC8vIFJlLXJlbmRlciBzZXR0aW5ncyB0byBzaG93L2hpZGUgc3VtbWFyaXphdGlvbiBvcHRpb25zXHJcbiAgICAgICAgfSlcclxuICAgICAgKTtcclxuXHJcbiAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlQWR2YW5jZWRDb250ZXh0U3RyYXRlZ3kpIHtcclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLnNldE5hbWUoXCJFbmFibGUgQ29udGV4dCBTdW1tYXJpemF0aW9uXCIpXHJcbiAgICAgICAgLnNldERlc2MoXCJBdXRvbWF0aWNhbGx5IHN1bW1hcml6ZSBvbGRlciBwYXJ0cyBvZiB0aGUgY29udmVyc2F0aW9uLlwiKVxyXG4gICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+XHJcbiAgICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlU3VtbWFyaXphdGlvbikub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVTdW1tYXJpemF0aW9uID0gdmFsdWU7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTsgLy8gUmUtcmVuZGVyIHRvIHNob3cvaGlkZSBwcm9tcHRcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVTdW1tYXJpemF0aW9uKSB7XHJcbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAuc2V0TmFtZShcIlN1bW1hcml6YXRpb24gUHJvbXB0XCIpXHJcbiAgICAgICAgICAuc2V0RGVzYyhcIlByb21wdCB1c2VkIGZvciBzdW1tYXJpemF0aW9uLiBVc2Uge3RleHRfdG9fc3VtbWFyaXplfSBwbGFjZWhvbGRlci5cIilcclxuICAgICAgICAgIC5hZGRUZXh0QXJlYSh0ZXh0ID0+XHJcbiAgICAgICAgICAgIHRleHRcclxuICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5zdW1tYXJpemF0aW9uUHJvbXB0KVxyXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uUHJvbXB0KVxyXG4gICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uUHJvbXB0ID0gdmFsdWUgfHwgREVGQVVMVF9TRVRUSU5HUy5zdW1tYXJpemF0aW9uUHJvbXB0O1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAuaW5wdXRFbC5zZXRBdHRycyh7IHJvd3M6IDQgfSlcclxuICAgICAgICAgICk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIC0tLSDQndCe0JLQlTog0JLQuNCx0ZbRgCDQvNC+0LTQtdC70ZYg0LTQu9GPINGB0YPQvNCw0YDQuNC30LDRhtGW0ZcgLS0tXHJcbiAgICAgIGxldCBzdW1tYXJpemF0aW9uTW9kZWxEcm9wZG93bjogRHJvcGRvd25Db21wb25lbnQgfCBudWxsID0gbnVsbDtcclxuICAgICAgY29uc3QgdXBkYXRlU3VtbWFyaXphdGlvbk9wdGlvbnMgPSBhc3luYyAoZHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCwgYnV0dG9uPzogRXh0cmFCdXR0b25Db21wb25lbnQpID0+IHtcclxuICAgICAgICBpZiAoIWRyb3Bkb3duKSByZXR1cm47XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZhbCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnN1bW1hcml6YXRpb25Nb2RlbE5hbWU7IC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0L3QvtCy0LUg0L/QvtC70LVcclxuICAgICAgICBkcm9wZG93bi5zZWxlY3RFbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIkxvYWRpbmcgbW9kZWxzLi4uXCIpO1xyXG4gICAgICAgIGRyb3Bkb3duLnNldERpc2FibGVkKHRydWUpO1xyXG4gICAgICAgIGJ1dHRvbj8uc2V0RGlzYWJsZWQodHJ1ZSkuc2V0SWNvbihcImxvYWRlclwiKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgY29uc3QgbW9kZWxzID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZXRNb2RlbHMoKTtcclxuICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oXCJcIiwgXCItLSBTZWxlY3QgU3VtbWFyaXphdGlvbiBNb2RlbCAtLVwiKTsgLy8g0JfQvNGW0L3QtdC90L4g0YLQtdC60YHRglxyXG4gICAgICAgICAgaWYgKG1vZGVscyAmJiBtb2RlbHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICBtb2RlbHMuZm9yRWFjaChtb2RlbE5hbWUgPT4ge1xyXG4gICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihtb2RlbE5hbWUsIG1vZGVsTmFtZSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZShtb2RlbHMuaW5jbHVkZXMoY3VycmVudFZhbCkgPyBjdXJyZW50VmFsIDogXCJcIik7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oXCJcIiwgXCJObyBtb2RlbHMgZm91bmRcIik7XHJcbiAgICAgICAgICAgIGRyb3Bkb3duLnNldFZhbHVlKFwiXCIpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJFcnJvciBmZXRjaGluZyBtb2RlbHMgZm9yIHN1bW1hcml6YXRpb24gc2V0dGluZ3M6XCIsIGVycm9yKTtcclxuICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oXCJcIiwgXCJFcnJvciBsb2FkaW5nIG1vZGVscyFcIik7XHJcbiAgICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZShcIlwiKTtcclxuICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgZHJvcGRvd24uc2V0RGlzYWJsZWQoZmFsc2UpO1xyXG4gICAgICAgICAgYnV0dG9uPy5zZXREaXNhYmxlZChmYWxzZSkuc2V0SWNvbihcInJlZnJlc2gtY3dcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9O1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLnNldE5hbWUoXCJTdW1tYXJpemF0aW9uIE1vZGVsXCIpIC8vINCd0L7QstCwINC90LDQt9Cy0LBcclxuICAgICAgICAuc2V0RGVzYyhcIk1vZGVsIHVzZWQgZm9yIHN1bW1hcml6aW5nIGNoYXQgaGlzdG9yeSBhbmQgaW5kaXZpZHVhbCBtZXNzYWdlcy5cIikgLy8g0J7QvdC+0LLQu9C10L3QuNC5INC+0L/QuNGBXHJcbiAgICAgICAgLmFkZERyb3Bkb3duKGFzeW5jIGRyb3Bkb3duID0+IHtcclxuICAgICAgICAgIHN1bW1hcml6YXRpb25Nb2RlbERyb3Bkb3duID0gZHJvcGRvd247XHJcbiAgICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN1bW1hcml6YXRpb25Nb2RlbE5hbWUgPSB2YWx1ZTsgLy8g0JfQsdC10YDRltCz0LDRlNC80L4g0LIg0L3QvtCy0LUg0L/QvtC70LVcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGF3YWl0IHVwZGF0ZVN1bW1hcml6YXRpb25PcHRpb25zKGRyb3Bkb3duKTsgLy8gSW5pdGlhbCBsb2FkXHJcbiAgICAgICAgfSlcclxuICAgICAgICAuYWRkRXh0cmFCdXR0b24oYnV0dG9uID0+IHtcclxuICAgICAgICAgIGJ1dHRvblxyXG4gICAgICAgICAgICAuc2V0SWNvbihcInJlZnJlc2gtY3dcIilcclxuICAgICAgICAgICAgLnNldFRvb2x0aXAoXCJSZWZyZXNoIG1vZGVsIGxpc3RcIilcclxuICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgIGF3YWl0IHVwZGF0ZVN1bW1hcml6YXRpb25PcHRpb25zKHN1bW1hcml6YXRpb25Nb2RlbERyb3Bkb3duLCBidXR0b24pO1xyXG4gICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJNb2RlbCBsaXN0IHJlZnJlc2hlZCFcIik7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLnNldE5hbWUoXCJLZWVwIExhc3QgTiBNZXNzYWdlcyBCZWZvcmUgU3VtbWFyeVwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiTnVtYmVyIG9mIHJlY2VudCBtZXNzYWdlcyBleGNsdWRlZCBmcm9tIHN1bW1hcml6YXRpb24uXCIpXHJcbiAgICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgICAgdGV4dFxyXG4gICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5rZWVwTGFzdE5NZXNzYWdlc0JlZm9yZVN1bW1hcnkudG9TdHJpbmcoKSlcclxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmtlZXBMYXN0Tk1lc3NhZ2VzQmVmb3JlU3VtbWFyeS50b1N0cmluZygpKVxyXG4gICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLnRyaW0oKSwgMTApO1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmtlZXBMYXN0Tk1lc3NhZ2VzQmVmb3JlU3VtbWFyeSA9XHJcbiAgICAgICAgICAgICAgICAhaXNOYU4obnVtKSAmJiBudW0gPj0gMCA/IG51bSA6IERFRkFVTFRfU0VUVElOR1Mua2VlcExhc3ROTWVzc2FnZXNCZWZvcmVTdW1tYXJ5O1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgIC5zZXROYW1lKFwiRmFsbGJhY2sgU3VtbWFyaXphdGlvbiBNb2RlbFwiKVxyXG4gICAgICAgIC5zZXREZXNjKFxyXG4gICAgICAgICAgXCJPcHRpb25hbC4gTW9kZWwgdG8gdXNlIGlmIHRoZSBwcmltYXJ5IHN1bW1hcml6YXRpb24gbW9kZWwgaXMgbm90IHNldCBvciBub3QgZm91bmQuIFVzZXMgdGhlIG1haW4gT2xsYW1hIHNlcnZlci5cIlxyXG4gICAgICAgIClcclxuICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcImUuZy4sIG9yY2EtbWluaSBvciBsZWF2ZSBlbXB0eVwiKSAvLyDQn9GA0LjQutC70LDQtFxyXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZmFsbGJhY2tTdW1tYXJpemF0aW9uTW9kZWxOYW1lKVxyXG4gICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmZhbGxiYWNrU3VtbWFyaXphdGlvbk1vZGVsTmFtZSA9IHZhbHVlLnRyaW0oKTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLnNldE5hbWUoXCJTdW1tYXJpemF0aW9uIENodW5rIFNpemUgKFRva2VucylcIilcclxuICAgICAgICAuc2V0RGVzYyhcIkFwcHJveGltYXRlIHNpemUgb2YgdGV4dCBjaHVua3MgcGFzc2VkIHRvIHRoZSBzdW1tYXJpemF0aW9uIG1vZGVsLlwiKVxyXG4gICAgICAgIC5hZGRUZXh0KHRleHQgPT5cclxuICAgICAgICAgIHRleHRcclxuICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Muc3VtbWFyaXphdGlvbkNodW5rU2l6ZS50b1N0cmluZygpKVxyXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvbkNodW5rU2l6ZS50b1N0cmluZygpKVxyXG4gICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgIGNvbnN0IG51bSA9IHBhcnNlSW50KHZhbHVlLnRyaW0oKSwgMTApO1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN1bW1hcml6YXRpb25DaHVua1NpemUgPVxyXG4gICAgICAgICAgICAgICAgIWlzTmFOKG51bSkgJiYgbnVtID4gMTAwID8gbnVtIDogREVGQVVMVF9TRVRUSU5HUy5zdW1tYXJpemF0aW9uQ2h1bmtTaXplO1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gLS0tINCh0LXQutGG0ZbRjzogUHJvZHVjdGl2aXR5IEFzc2lzdGFudCBGZWF0dXJlcyAtLS1cclxuICAgIHRoaXMuY3JlYXRlU2VjdGlvbkhlYWRlcihcIlByb2R1Y3Rpdml0eSBBc3Npc3RhbnQgRmVhdHVyZXNcIik7XHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJFbmFibGUgUHJvZHVjdGl2aXR5IEZlYXR1cmVzXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiQWN0aXZhdGUgZGFpbHkgdGFzayBpbnRlZ3JhdGlvbi5cIilcclxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT5cclxuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4udXBkYXRlRGFpbHlUYXNrRmlsZVBhdGg/LigpO1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ubG9hZEFuZFByb2Nlc3NJbml0aWFsVGFza3M/LigpO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVByb2R1Y3Rpdml0eUZlYXR1cmVzKSB7XHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgIC5zZXROYW1lKFwiRGFpbHkgVGFzayBGaWxlIE5hbWVcIilcclxuICAgICAgICAuc2V0RGVzYyhcIkZpbGVuYW1lIHdpdGhpbiB0aGUgUkFHIGZvbGRlciB1c2VkIGZvciBkYWlseSB0YXNrcy5cIilcclxuICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmRhaWx5VGFza0ZpbGVOYW1lKVxyXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZGFpbHlUYXNrRmlsZU5hbWUpXHJcbiAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGFpbHlUYXNrRmlsZU5hbWUgPSB2YWx1ZS50cmltKCkgfHwgREVGQVVMVF9TRVRUSU5HUy5kYWlseVRhc2tGaWxlTmFtZTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi51cGRhdGVEYWlseVRhc2tGaWxlUGF0aD8uKCk7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9hZEFuZFByb2Nlc3NJbml0aWFsVGFza3M/LigpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gLS0tINCh0LXQutGG0ZbRjzogU3BlZWNoICYgVHJhbnNsYXRpb24gLS0tXHJcbiAgICB0aGlzLmNyZWF0ZVNlY3Rpb25IZWFkZXIoXCJTcGVlY2ggJiBUcmFuc2xhdGlvblwiKTtcclxuICAgIC8vIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgLy8gLnNldE5hbWUoXCJFbmFibGUgVHJhbnNsYXRpb24gRmVhdHVyZVwiKVxyXG4gICAgLy8gLnNldERlc2MoXCJTaG93IHRyYW5zbGF0ZSBidXR0b25zLlwiKVxyXG4gICAgLy8gLmFkZFRvZ2dsZSh0b2dnbGUgPT5cclxuICAgIC8vICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVRyYW5zbGF0aW9uKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAvLyAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlVHJhbnNsYXRpb24gPSB2YWx1ZTtcclxuICAgIC8vICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgIC8vICAgICB0aGlzLmRpc3BsYXkoKTsgLy8g0J/QtdGA0LXQvNCw0LvRjtCy0LDRgtC4XHJcbiAgICAvLyAgIH0pXHJcbiAgICAvLyApO1xyXG4gICAgLy8gLS0tINCd0J7QktCVOiDQktC40LHRltGAINCf0YDQvtCy0LDQudC00LXRgNCwINCf0LXRgNC10LrQu9Cw0LTRgyAtLS1cclxuICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVRyYW5zbGF0aW9uID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MudHJhbnNsYXRpb25Qcm92aWRlciAhPT0gJ25vbmUnOyBcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIlRyYW5zbGF0aW9uIFByb3ZpZGVyXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiU2VsZWN0IHRoZSBzZXJ2aWNlIGZvciBtZXNzYWdlIGFuZCBpbnB1dCB0cmFuc2xhdGlvbi5cIilcclxuICAgICAgLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IGRyb3Bkb3duXHJcbiAgICAgICAgLmFkZE9wdGlvbignbm9uZScsICdEaXNhYmxlZCcpXHJcbiAgICAgICAgLmFkZE9wdGlvbignZ29vZ2xlJywgJ0dvb2dsZSBUcmFuc2xhdGUgQVBJJylcclxuICAgICAgICAuYWRkT3B0aW9uKCdvbGxhbWEnLCAnT2xsYW1hIChMb2NhbCBNb2RlbCknKVxyXG4gICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblByb3ZpZGVyKVxyXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IFRyYW5zbGF0aW9uUHJvdmlkZXIpID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uUHJvdmlkZXIgPSB2YWx1ZTtcclxuICAgICAgICAgIC8vINCS0LzQuNC60LDRlNC80L4v0LLQuNC80LjQutCw0ZTQvNC+INC30LDQs9Cw0LvRjNC90LjQuSDQv9C10YDQtdC80LjQutCw0Ycg0LfQsNC70LXQttC90L4g0LLRltC0INCy0LjQsdC+0YDRg1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlVHJhbnNsYXRpb24gPSB2YWx1ZSAhPT0gJ25vbmUnO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB0aGlzLmRpc3BsYXkoKTsgLy8g0J/QtdGA0LXQvNCw0LvRjtCy0LDRgtC4INC90LDQu9Cw0YjRgtGD0LLQsNC90L3Rjywg0YnQvtCxINC/0L7QutCw0LfQsNGC0Lgv0YHRhdC+0LLQsNGC0Lgg0LfQsNC70LXQttC90ZYg0L7Qv9GG0ZbRl1xyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgLy8gLS0tINCj0LzQvtCy0L3RliDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8g0LTQu9GPIEdvb2dsZSBUcmFuc2xhdGUgLS0tXHJcbiAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MudHJhbnNsYXRpb25Qcm92aWRlciA9PT0gJ2dvb2dsZScpIHtcclxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAuc2V0TmFtZShcIlRhcmdldCBUcmFuc2xhdGlvbiBMYW5ndWFnZSAoR29vZ2xlKVwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiVHJhbnNsYXRlIG1lc3NhZ2VzL2lucHV0IGludG8gdGhpcyBsYW5ndWFnZSB1c2luZyBHb29nbGUuXCIpXHJcbiAgICAgICAgLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcclxuICAgICAgICAgIGZvciAoY29uc3QgY29kZSBpbiBMQU5HVUFHRVMpIHtcclxuICAgICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKGNvZGUsIExBTkdVQUdFU1tjb2RlXSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblRhcmdldExhbmd1YWdlKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uVGFyZ2V0TGFuZ3VhZ2UgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLnNldE5hbWUoXCJHb29nbGUgQ2xvdWQgVHJhbnNsYXRpb24gQVBJIEtleVwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiUmVxdWlyZWQgZm9yIEdvb2dsZSB0cmFuc2xhdGlvbiBmZWF0dXJlLiBLZWVwIGNvbmZpZGVudGlhbC5cIilcclxuICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+XHJcbiAgICAgICAgICB0ZXh0XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIkVudGVyIEFQSSBLZXlcIilcclxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmdvb2dsZVRyYW5zbGF0aW9uQXBpS2V5KVxyXG4gICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmdvb2dsZVRyYW5zbGF0aW9uQXBpS2V5ID0gdmFsdWUudHJpbSgpO1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICBcclxuICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlVHJhbnNsYXRpb24pIHtcclxuICAgIC8vIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgLy8gICAuc2V0TmFtZShcIlRhcmdldCBUcmFuc2xhdGlvbiBMYW5ndWFnZVwiKVxyXG4gICAgLy8gICAuc2V0RGVzYyhcIlRyYW5zbGF0ZSBtZXNzYWdlcy9pbnB1dCBpbnRvIHRoaXMgbGFuZ3VhZ2UuXCIpXHJcbiAgICAvLyAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiB7XHJcbiAgICAvLyAgICAgZm9yIChjb25zdCBjb2RlIGluIExBTkdVQUdFUykge1xyXG4gICAgLy8gICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKGNvZGUsIExBTkdVQUdFU1tjb2RlXSk7XHJcbiAgICAvLyAgICAgfVxyXG4gICAgLy8gICAgIGRyb3Bkb3duLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uVGFyZ2V0TGFuZ3VhZ2UpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgIC8vICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRyYW5zbGF0aW9uVGFyZ2V0TGFuZ3VhZ2UgPSB2YWx1ZTtcclxuICAgIC8vICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgLy8gICAgIH0pO1xyXG4gICAgLy8gICB9KTtcclxuICAgIFxyXG4gICAgLy8gLS0tINCj0LzQvtCy0L3RliDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8g0LTQu9GPIE9sbGFtYSAtLS1cclxuICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblByb3ZpZGVyID09PSAnb2xsYW1hJykge1xyXG4gICAgICAgIGxldCBvbGxhbWFUcmFuc2xhdGlvbk1vZGVsRHJvcGRvd246IERyb3Bkb3duQ29tcG9uZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICAgICAgY29uc3QgdXBkYXRlT2xsYW1hVHJhbnNsYXRpb25PcHRpb25zID0gYXN5bmMgKGRyb3Bkb3duOiBEcm9wZG93bkNvbXBvbmVudCB8IG51bGwsIGJ1dHRvbj86IEV4dHJhQnV0dG9uQ29tcG9uZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghZHJvcGRvd24pIHJldHVybjtcclxuICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLm9sbGFtYVRyYW5zbGF0aW9uTW9kZWw7XHJcbiAgICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7IGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIkxvYWRpbmcgbW9kZWxzLi4uXCIpOyBkcm9wZG93bi5zZXREaXNhYmxlZCh0cnVlKTtcclxuICAgICAgICAgICAgYnV0dG9uPy5zZXREaXNhYmxlZCh0cnVlKS5zZXRJY29uKFwibG9hZGVyXCIpO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbW9kZWxzID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZXRNb2RlbHMoKTtcclxuICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNlbGVjdEVsLmlubmVySFRNTCA9IFwiXCI7IGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIi0tIFNlbGVjdCBPbGxhbWEgVHJhbnNsYXRpb24gTW9kZWwgLS1cIik7XHJcbiAgICAgICAgICAgICAgICBpZiAobW9kZWxzICYmIG1vZGVscy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbW9kZWxzLmZvckVhY2gobSA9PiBkcm9wZG93bi5hZGRPcHRpb24obSwgbSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGRyb3Bkb3duLnNldFZhbHVlKG1vZGVscy5pbmNsdWRlcyhjdXJyZW50VmFsKSA/IGN1cnJlbnRWYWwgOiBcIlwiKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7IGRyb3Bkb3duLmFkZE9wdGlvbihcIlwiLCBcIk5vIG1vZGVscyBmb3VuZFwiKTsgZHJvcGRvd24uc2V0VmFsdWUoXCJcIik7IH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHsgLyogLi4uINC+0LHRgNC+0LHQutCwINC/0L7QvNC40LvQutC4IC4uLiAqL1xyXG4gICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIkVycm9yIGZldGNoaW5nIG1vZGVscyBmb3IgT2xsYW1hIHRyYW5zbGF0aW9uIHNldHRpbmdzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgZHJvcGRvd24uc2VsZWN0RWwuaW5uZXJIVE1MID0gXCJcIjsgZHJvcGRvd24uYWRkT3B0aW9uKFwiXCIsIFwiRXJyb3IgbG9hZGluZyBtb2RlbHMhXCIpOyBkcm9wZG93bi5zZXRWYWx1ZShcIlwiKTtcclxuICAgICAgICAgICAgIH0gZmluYWxseSB7IGRyb3Bkb3duLnNldERpc2FibGVkKGZhbHNlKTsgYnV0dG9uPy5zZXREaXNhYmxlZChmYWxzZSkuc2V0SWNvbihcInJlZnJlc2gtY3dcIik7IH1cclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgICAgIC5zZXROYW1lKFwiT2xsYW1hIFRyYW5zbGF0aW9uIE1vZGVsXCIpXHJcbiAgICAgICAgICAgIC5zZXREZXNjKFwiT2xsYW1hIG1vZGVsIHRvIHVzZSBmb3IgdHJhbnNsYXRpb24gdGFza3MuXCIpXHJcbiAgICAgICAgICAgIC5hZGREcm9wZG93bihhc3luYyBkcm9wZG93biA9PiB7XHJcbiAgICAgICAgICAgICAgICBvbGxhbWFUcmFuc2xhdGlvbk1vZGVsRHJvcGRvd24gPSBkcm9wZG93bjtcclxuICAgICAgICAgICAgICAgIGRyb3Bkb3duLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vbGxhbWFUcmFuc2xhdGlvbk1vZGVsID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHVwZGF0ZU9sbGFtYVRyYW5zbGF0aW9uT3B0aW9ucyhkcm9wZG93bik7IC8vIEluaXRpYWwgbG9hZFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAuYWRkRXh0cmFCdXR0b24oYnV0dG9uID0+IHtcclxuICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXRJY29uKFwicmVmcmVzaC1jd1wiKS5zZXRUb29sdGlwKFwiUmVmcmVzaCBtb2RlbCBsaXN0XCIpXHJcbiAgICAgICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4geyBhd2FpdCB1cGRhdGVPbGxhbWFUcmFuc2xhdGlvbk9wdGlvbnMob2xsYW1hVHJhbnNsYXRpb25Nb2RlbERyb3Bkb3duLCBidXR0b24pOyBuZXcgTm90aWNlKFwiTW9kZWwgbGlzdCByZWZyZXNoZWQhXCIpOyB9KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAvLyBUYXJnZXQgbGFuZ3VhZ2UgZm9yIE9sbGFtYSAo0LzQvtC20LUg0LHRg9GC0Lgg0YLQvtC5INGB0LDQvNC40LksINGJ0L4g0Lkg0LTQu9GPIEdvb2dsZSwg0LDQsdC+INC+0LrRgNC10LzQuNC5KVxyXG4gICAgICAgICAvLyDQn9C+0LrQuCDRidC+INCy0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0YHQv9GW0LvRjNC90LjQuSB0cmFuc2xhdGlvblRhcmdldExhbmd1YWdlXHJcbiAgICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgICAgICAuc2V0TmFtZShcIlRhcmdldCBUcmFuc2xhdGlvbiBMYW5ndWFnZSAoT2xsYW1hKVwiKVxyXG4gICAgICAgICAgICAuc2V0RGVzYyhcIlRyYW5zbGF0ZSBtZXNzYWdlcy9pbnB1dCBpbnRvIHRoaXMgbGFuZ3VhZ2UgdXNpbmcgT2xsYW1hLlwiKVxyXG4gICAgICAgICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4ge1xyXG4gICAgICAgICAgICAgIGZvciAoY29uc3QgY29kZSBpbiBMQU5HVUFHRVMpIHtcclxuICAgICAgICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihjb2RlLCBMQU5HVUFHRVNbY29kZV0pO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBkcm9wZG93bi5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblRhcmdldExhbmd1YWdlKS5vbkNoYW5nZShhc3luYyB2YWx1ZSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmFuc2xhdGlvblRhcmdldExhbmd1YWdlID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIC8vIFRPRE86INCc0L7QttC70LjQstC+LCDQtNC+0LTQsNGC0Lgg0L/QvtC70LUg0LTQu9GPIFwiU291cmNlIExhbmd1YWdlXCIg0LTQu9GPIE9sbGFtYSxcclxuICAgICAgICAgICAgLy8g0LDQsdC+INGA0LXQsNC70ZbQt9GD0LLQsNGC0Lgg0LDQstGC0L7QtNC10YLQtdC60YLRg9Cy0LDQvdC90Y8gKNGJ0L4g0YHQutC70LDQtNC90ZbRiNC1KS4g0J/QvtC60Lgg0YnQviDQv9GA0LjQv9GD0YHQutCw0ZTQvNC+XHJcbiAgICAgICAgICAgICAgICAgIC8vINC/0LXRgNC10LrQu9Cw0LQg0Lcg0LzQvtCy0Lgg0ZbQvdGC0LXRgNGE0LXQudGB0YMg0LDQsdC+INCw0L3Qs9C70ZbQudGB0YzQutC+0ZcuXHJcblxyXG4gICAgfX1cclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJHb29nbGUgQVBJIEtleSAoU3BlZWNoLXRvLVRleHQpXCIpXHJcbiAgICAgIC5zZXREZXNjKFwiUmVxdWlyZWQgZm9yIHZvaWNlIGlucHV0LiBLZWVwIGNvbmZpZGVudGlhbC5cIilcclxuICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgIHRleHRcclxuICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihcIkVudGVyIEFQSSBLZXlcIilcclxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5nb29nbGVBcGlLZXkpXHJcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgdmFsdWUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5nb29nbGVBcGlLZXkgPSB2YWx1ZS50cmltKCk7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgKTtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIlNwZWVjaCBSZWNvZ25pdGlvbiBMYW5ndWFnZVwiKVxyXG4gICAgICAuc2V0RGVzYyhcIkxhbmd1YWdlIGZvciB2b2ljZSBpbnB1dCAoZS5nLiwgZW4tVVMsIHVrLVVBKS5cIilcclxuICAgICAgLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcclxuICAgICAgICBjb25zdCBzcGVlY2hMYW5nczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcclxuICAgICAgICAgIFwidWstVUFcIjogXCJVa3JhaW5pYW5cIixcclxuICAgICAgICAgIFwiZW4tVVNcIjogXCJFbmdsaXNoIChVUylcIiAvKiAuLi4gYWRkIG1vcmUgaWYgbmVlZGVkIC4uLiAqLyxcclxuICAgICAgICB9O1xyXG4gICAgICAgIGZvciAoY29uc3QgY29kZSBpbiBzcGVlY2hMYW5ncykge1xyXG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKGNvZGUsIHNwZWVjaExhbmdzW2NvZGVdKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZHJvcGRvd24uc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3BlZWNoTGFuZ3VhZ2UpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNwZWVjaExhbmd1YWdlID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICBcclxuXHJcbiAgICAvLyAtLS0g0KHQtdC60YbRltGPOiBMb2dnaW5nIC0tLVxyXG4gICAgdGhpcy5jcmVhdGVTZWN0aW9uSGVhZGVyKFwiTG9nZ2luZ1wiKTtcclxuICAgIGNvbnN0IGxvZ0xldmVsT3B0aW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xyXG4gICAgT2JqZWN0LmtleXMoTG9nTGV2ZWwpLmZvckVhY2goa2V5ID0+IHtcclxuICAgICAgaWYgKGlzTmFOKE51bWJlcihrZXkpKSkge1xyXG4gICAgICAgIGxvZ0xldmVsT3B0aW9uc1trZXldID0ga2V5O1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUoXCJDb25zb2xlIExvZyBMZXZlbFwiKVxyXG4gICAgICAuc2V0RGVzYyhcIk1pbmltdW0gbGV2ZWwgZm9yIGRldmVsb3BlciBjb25zb2xlLlwiKVxyXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT5cclxuICAgICAgICBkcm9wZG93blxyXG4gICAgICAgICAgLmFkZE9wdGlvbnMobG9nTGV2ZWxPcHRpb25zKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnNvbGVMb2dMZXZlbCB8fCBcIklORk9cIilcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IGtleW9mIHR5cGVvZiBMb2dMZXZlbCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb25zb2xlTG9nTGV2ZWwgPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShcIkVuYWJsZSBGaWxlIExvZ2dpbmdcIilcclxuICAgICAgLnNldERlc2MoYExvZyB0byAke3RoaXMucGx1Z2luLmxvZ2dlci5nZXRMb2dGaWxlUGF0aCgpfSAoZm9yIGRlYnVnZ2luZykuYCkgLy8g0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviDQvNC10YLQvtC0INC70L7Qs9C10YDQsFxyXG4gICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PlxyXG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5maWxlTG9nZ2luZ0VuYWJsZWQpLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmZpbGVMb2dnaW5nRW5hYmxlZCA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB0aGlzLmRpc3BsYXkoKTsgLy8g0J/QtdGA0LXQvNCw0LvRjtCy0LDRgtC4LCDRidC+0LEg0L/QvtC60LDQt9Cw0YLQuC/RgdGF0L7QstCw0YLQuCDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8g0YTQsNC50LvRg1xyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcblxyXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmZpbGVMb2dnaW5nRW5hYmxlZCkge1xyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAuc2V0TmFtZShcIkZpbGUgTG9nIExldmVsXCIpXHJcbiAgICAgICAgLnNldERlc2MoXCJNaW5pbXVtIGxldmVsIGZvciBsb2cgZmlsZS5cIilcclxuICAgICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT5cclxuICAgICAgICAgIGRyb3Bkb3duXHJcbiAgICAgICAgICAgIC5hZGRPcHRpb25zKGxvZ0xldmVsT3B0aW9ucylcclxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZpbGVMb2dMZXZlbCB8fCBcIldBUk5cIilcclxuICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZToga2V5b2YgdHlwZW9mIExvZ0xldmVsKSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZmlsZUxvZ0xldmVsID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgIC5zZXROYW1lKFwiTG9nIENhbGxlciBNZXRob2QgTmFtZVwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiSW5jbHVkZSBbTWV0aG9kTmFtZV0gaW4gbG9ncy4gTWF5IHNsaWdodGx5IGltcGFjdCBwZXJmb3JtYW5jZS5cIilcclxuICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PlxyXG4gICAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvZ0NhbGxlckluZm8pLm9uQ2hhbmdlKGFzeW5jIHZhbHVlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9nQ2FsbGVySW5mbyA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgIC8vINCS0ZbQtNC+0LHRgNCw0LbQtdC90L3RjyDRiNC70Y/RhdGDINC00L4g0YTQsNC50LvRgyDQu9C+0LPRltCyXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgIC5zZXROYW1lKFwiTG9nIEZpbGUgUGF0aFwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiQ3VycmVudCBsb2NhdGlvbiBvZiB0aGUgbG9nIGZpbGUuXCIpXHJcbiAgICAgICAgLmFkZFRleHQodGV4dCA9PlxyXG4gICAgICAgICAgdGV4dFxyXG4gICAgICAgICAgICAvLyAtLS0g0JLQmNCf0KDQkNCS0JvQldCd0J3Qrzog0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0LzQviDQtNC+0LTQsNC90LjQuSDQvNC10YLQvtC0IC0tLVxyXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4ubG9nZ2VyLmdldExvZ0ZpbGVQYXRoKCkpXHJcbiAgICAgICAgICAgIC8vIC0tLSDQmtGW0L3QtdGG0Ywg0LLQuNC/0YDQsNCy0LvQtdC90L3RjyAtLS1cclxuICAgICAgICAgICAgLnNldERpc2FibGVkKHRydWUpXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIl19