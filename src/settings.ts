// settings.ts
import {
  App,
  PluginSettingTab,
  Setting,
  DropdownComponent,
  setIcon,
  TFolder,
  debounce,
  ExtraButtonComponent,
  SliderComponent,
  Notice,
  TextComponent,
  normalizePath, // <--- ДОДАНО ІМПОРТ
} from "obsidian";
import OllamaPlugin from "./main";
import { LogLevel, LoggerSettings } from "./Logger"; // Імпортуємо LogLevel та LoggerSettings

// --- Мови ---
export const LANGUAGES: Record<string, string> = {
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

// --- Тип аватара (ДОДАНО 'image') ---
export type AvatarType = "initials" | "icon" | "image";

export type TranslationProvider = 'google' | 'ollama' | 'none';

// --- Інтерфейс налаштувань ---
export interface OllamaPluginSettings extends LoggerSettings {
  ollamaServerUrl: string;
  modelName: string;
  temperature: number;
  contextWindow: number;
  userRolesFolderPath: string;
  selectedRolePath: string;
  saveMessageHistory: boolean;
  chatHistoryFolderPath: string;
  chatExportFolderPath: string;
  openChatInTab: boolean;
  userAvatarType: AvatarType;
  userAvatarContent: string;
  aiAvatarType: AvatarType;
  aiAvatarContent: string;
  maxMessageHeight: number;
  ragEnabled: boolean;
  ragFolderPath: string;
  ragEnableSemanticSearch: boolean;
  ragEmbeddingModel: string;
  ragChunkSize: number;
  ragSimilarityThreshold: number;
  ragTopK: number;
  maxCharsPerDoc: number;
  enableProductivityFeatures: boolean;
  dailyTaskFileName: string;
  useAdvancedContextStrategy: boolean;
  enableSummarization: boolean;
  summarizationPrompt: string;
  keepLastNMessagesBeforeSummary: number;
  summarizationChunkSize: number;
  followRole: boolean;
  googleApiKey: string;
  speechLanguage: string;
  enableTranslation: boolean;
  translationTargetLanguage: string;
  googleTranslationApiKey: string;
  summarizationModelName: string;
  fallbackSummarizationModelName: string;
  fixBrokenEmojis: boolean; // Налаштування для виправлення емодзі
  translationProvider: TranslationProvider; // Вибір провайдера
  ollamaTranslationModel: string; // Модель Ollama для перекладу
}

// --- Значення за замовчуванням ---
export const DEFAULT_SETTINGS: OllamaPluginSettings = {
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
  fallbackSummarizationModelName: "http://localhost:11434",
  fixBrokenEmojis: true,
  translationProvider: 'ollama', // За замовчуванням вимкнено
  ollamaTranslationModel: '',
};

// --- Клас вкладки налаштувань ---
export class OllamaSettingTab extends PluginSettingTab {
  plugin: OllamaPlugin;
  private debouncedUpdateChatPath: () => void;
  private debouncedUpdateRolePath: () => void;
  private debouncedUpdateRagPath: () => void;

  constructor(app: App, plugin: OllamaPlugin) {
    super(app, plugin);
    this.plugin = plugin;

    this.debouncedUpdateChatPath = debounce(
      async () => {
        this.plugin.logger.debug("Debounced: Updating chat path and ensuring folder exists...");
        if (this.plugin.chatManager) {
          this.plugin.chatManager.updateChatsFolderPath();
          await this.plugin.chatManager.ensureFoldersExist();
        }
      },
      1000,
      true
    );

    this.debouncedUpdateRolePath = debounce(
      async () => {
        this.plugin.logger.debug("Debounced: Refreshing role list due to path change...");
        await this.plugin.listRoleFiles(true);
        (this.plugin as OllamaPlugin).emit("roles-updated");
      },
      1000,
      true
    );

    this.debouncedUpdateRagPath = debounce(
      async () => {
        this.plugin.logger.debug("Debounced: Re-indexing RAG due to path change...");
        if (this.plugin.settings.ragEnabled && this.plugin.ragService) {
          await this.plugin.ragService.indexDocuments();
        }
      },
      1000,
      true
    );
  }

  // Допоміжна функція для створення заголовків секцій
  private createSectionHeader(text: string): void {
    this.containerEl.createEl("h3", { text }).addClass("ai-forge-settings-header");
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Forge Settings" });

    // --- Секція: Connection & Model Defaults ---
    this.createSectionHeader("Connection & Model Defaults");
    new Setting(containerEl)
      .setName("Ollama Server URL")
      .setDesc("The URL of your running Ollama server (e.g., http://localhost:11434 or http://192.168.X.X:11434).")
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.ollamaServerUrl)
          .setValue(this.plugin.settings.ollamaServerUrl)
          .onChange(async value => {
            let url = value.trim();
            if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
              url = "http://" + url;
            }
            if (url.endsWith("/")) {
              url = url.slice(0, -1);
            }
            this.plugin.settings.ollamaServerUrl = url || DEFAULT_SETTINGS.ollamaServerUrl;
            await this.plugin.saveSettings();
          })
      );

    let modelDropdown: DropdownComponent | null = null;
    const updateOptions = async (dropdown: DropdownComponent | null, button?: ExtraButtonComponent) => {
      if (!dropdown) return;
      const currentVal = this.plugin.settings.modelName;
      dropdown.selectEl.innerHTML = "";
      dropdown.addOption("", "Loading models...");
      dropdown.setDisabled(true);
      button?.setDisabled(true).setIcon("loader");
      try {
        const models = await this.plugin.ollamaService.getModels();
        dropdown.selectEl.innerHTML = "";
        dropdown.addOption("", "-- Select default model --");
        if (models && models.length > 0) {
          models.forEach(modelName => {
            dropdown.addOption(modelName, modelName);
          });
          // Встановлюємо значення, тільки якщо воно є у списку
          dropdown.setValue(models.includes(currentVal) ? currentVal : "");
        } else {
          dropdown.addOption("", "No models found");
          dropdown.setValue("");
        }
      } catch (error) {
        this.plugin.logger.error("Error fetching models for settings:", error);
        dropdown.selectEl.innerHTML = "";
        dropdown.addOption("", "Error loading models!");
        dropdown.setValue("");
      } finally {
        dropdown.setDisabled(false);
        button?.setDisabled(false).setIcon("refresh-cw");
      }
    };

    new Setting(containerEl)
      .setName("Default Model Name")
      .setDesc("The default Ollama model for new chats.")
      .addDropdown(async dropdown => {
        modelDropdown = dropdown;
        dropdown.onChange(async value => {
          this.plugin.settings.modelName = value;
          await this.plugin.saveSettings();
        });
        await updateOptions(dropdown); // Початкове завантаження
      })
      .addExtraButton(button => {
        button
          .setIcon("refresh-cw")
          .setTooltip("Refresh model list")
          .onClick(async () => {
            await updateOptions(modelDropdown, button);
            new Notice("Model list refreshed!");
          });
      });

    new Setting(containerEl)
      .setName("Default Temperature")
      .setDesc("Controls randomness (0.0 = deterministic, >1.0 = creative).")
      .addSlider(slider =>
        slider
          .setLimits(0, 2, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async value => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Context Window Size (Tokens)")
      .setDesc("Max tokens model considers. Requires restart/reload if changed while model is loaded.")
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.contextWindow.toString())
          .setValue(this.plugin.settings.contextWindow.toString())
          .onChange(async value => {
            const num = parseInt(value.trim(), 10);
            this.plugin.settings.contextWindow = !isNaN(num) && num > 0 ? num : DEFAULT_SETTINGS.contextWindow;
            await this.plugin.saveSettings();
          })
      );

    // --- Секція: View Behavior ---
    this.createSectionHeader("View Behavior");
    new Setting(containerEl)
      .setName("Open Chat in Main Tab")
      .setDesc("ON: Open in a main tab. OFF: Open in the right sidebar.")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.openChatInTab).onChange(async value => {
          this.plugin.settings.openChatInTab = value;
          await this.plugin.saveSettings();
          new Notice("Chat view location setting saved. Re-open the view to apply.", 5000);
        })
      );

    new Setting(containerEl)
      .setName("Max Message Height (pixels)")
      .setDesc("Collapse longer messages with 'Show More'. 0 disables.")
      .addText(text =>
        text
          .setPlaceholder("Example: 300")
          .setValue(this.plugin.settings.maxMessageHeight.toString())
          .onChange(async value => {
            const num = parseInt(value.trim(), 10);
            this.plugin.settings.maxMessageHeight = !isNaN(num) && num >= 0 ? num : DEFAULT_SETTINGS.maxMessageHeight;
            await this.plugin.saveSettings();
            this.plugin.view?.checkAllMessagesForCollapsing?.();
          })
      );

    // --- Секція: Appearance ---
    this.createSectionHeader("Appearance");

    // User Avatar
    new Setting(containerEl).setName("User Avatar Style").addDropdown(dropdown =>
      dropdown
        .addOption("initials", "Initials")
        .addOption("icon", "Icon")
        .addOption("image", "Image (Vault Path)") // Додано
        .setValue(this.plugin.settings.userAvatarType)
        .onChange(async (value: AvatarType) => {
          this.plugin.settings.userAvatarType = value;
          await this.plugin.saveSettings();
          this.display(); // Перемалювати налаштування
        })
    );

    const userAvatarSetting = new Setting(containerEl).setDesc(" "); // Пустий опис для вирівнювання
    userAvatarSetting.controlEl.addClass("ai-forge-avatar-content-setting");

    if (this.plugin.settings.userAvatarType === "initials") {
      userAvatarSetting.setName("User Initials").setDesc("Max 2 chars.");
      userAvatarSetting.addText(text =>
        text.setValue(this.plugin.settings.userAvatarContent).onChange(async value => {
          // Використовуємо дефолтне значення з DEFAULT_SETTINGS, якщо поле порожнє
          this.plugin.settings.userAvatarContent = value.trim().substring(0, 2) || DEFAULT_SETTINGS.userAvatarContent;
          await this.plugin.saveSettings();
        })
      );
    } else if (this.plugin.settings.userAvatarType === "icon") {
      userAvatarSetting.setName("User Icon ID").setDesc('Obsidian icon ID (e.g., "user").');
      userAvatarSetting.addText(text =>
        text
          .setPlaceholder("user")
          .setValue(this.plugin.settings.userAvatarContent)
          .onChange(async value => {
            this.plugin.settings.userAvatarContent = value.trim() || "user"; // Дефолтна іконка
            await this.plugin.saveSettings();
          })
      );
    } else if (this.plugin.settings.userAvatarType === "image") {
      userAvatarSetting.setName("User Avatar Image Path");
      userAvatarSetting.setDesc("Full path to the image file (png/jpeg/jpg) within your vault.");
      userAvatarSetting.addText(text =>
        text // Поле для введення шляху
          .setPlaceholder("e.g., Assets/Images/user.png")
          .setValue(this.plugin.settings.userAvatarContent)
          .onChange(async value => {
            // --- ВИПРАВЛЕННЯ: Використовуємо локальну змінну ---
            const normalizedPath = normalizePath(value.trim());
            if (normalizedPath === "" || /\.(png|jpg|jpeg)$/i.test(normalizedPath)) {
              this.plugin.settings.userAvatarContent = normalizedPath;
            } else {
              new Notice("Invalid path. Please provide a path to a .png or .jpeg/jpg file, or leave empty.");
              text.setValue(this.plugin.settings.userAvatarContent); // Повертаємо старе значення
              return; // Не зберігаємо
            }
            // --- Кінець виправлення ---
            await this.plugin.saveSettings();
          })
      );
    }

    // AI Avatar
    new Setting(containerEl).setName("AI Avatar Style").addDropdown(dropdown =>
      dropdown
        .addOption("initials", "Initials")
        .addOption("icon", "Icon")
        .addOption("image", "Image (Vault Path)") // Додано
        .setValue(this.plugin.settings.aiAvatarType)
        .onChange(async (value: AvatarType) => {
          this.plugin.settings.aiAvatarType = value;
          await this.plugin.saveSettings();
          this.display(); // Перемалювати
        })
    );

    const aiAvatarSetting = new Setting(containerEl).setDesc(" ");
    aiAvatarSetting.controlEl.addClass("ai-forge-avatar-content-setting");

    if (this.plugin.settings.aiAvatarType === "initials") {
      aiAvatarSetting.setName("AI Initials").setDesc("Max 2 chars.");
      aiAvatarSetting.addText(text =>
        text.setValue(this.plugin.settings.aiAvatarContent).onChange(async value => {
          this.plugin.settings.aiAvatarContent = value.trim().substring(0, 2) || DEFAULT_SETTINGS.aiAvatarContent;
          await this.plugin.saveSettings();
        })
      );
    } else if (this.plugin.settings.aiAvatarType === "icon") {
      aiAvatarSetting.setName("AI Icon ID").setDesc('Obsidian icon ID (e.g., "bot").');
      aiAvatarSetting.addText(text =>
        text
          .setPlaceholder("bot")
          .setValue(this.plugin.settings.aiAvatarContent)
          .onChange(async value => {
            this.plugin.settings.aiAvatarContent = value.trim() || "bot"; // Дефолтна іконка
            await this.plugin.saveSettings();
          })
      );
    } else if (this.plugin.settings.aiAvatarType === "image") {
      aiAvatarSetting.setName("AI Avatar Image Path");
      aiAvatarSetting.setDesc("Full path to the image file (png/jpeg/jpg) within your vault.");
      aiAvatarSetting.addText(text =>
        text // Поле для введення шляху
          .setPlaceholder("e.g., Assets/Images/ai.png")
          .setValue(this.plugin.settings.aiAvatarContent)
          .onChange(async value => {
            // --- ВИПРАВЛЕННЯ: Використовуємо локальну змінну ---
            const normalizedPath = normalizePath(value.trim());
            if (normalizedPath === "" || /\.(png|jpg|jpeg)$/i.test(normalizedPath)) {
              this.plugin.settings.aiAvatarContent = normalizedPath;
            } else {
              new Notice("Invalid path. Please provide a path to a .png or .jpeg/jpg file, or leave empty.");
              text.setValue(this.plugin.settings.aiAvatarContent);
              return;
            }
            // --- Кінець виправлення ---
            await this.plugin.saveSettings();
          })
      );
    }

    // --- Секція: Roles & Personas ---
    this.createSectionHeader("Roles & Personas");
    new Setting(containerEl)
      .setName("Custom Roles Folder Path")
      .setDesc("Folder with custom role (.md) files.")
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.userRolesFolderPath)
          .setValue(this.plugin.settings.userRolesFolderPath)
          .onChange(async value => {
            // --- ВИПРАВЛЕННЯ: Використовуємо normalizePath ---
            this.plugin.settings.userRolesFolderPath =
              normalizePath(value.trim()) || DEFAULT_SETTINGS.userRolesFolderPath;
            await this.plugin.saveSettings();
            this.debouncedUpdateRolePath();
          })
      );
    new Setting(containerEl)
      .setName("Always Apply Selected Role")
      .setDesc("Always use the selected role as system prompt.")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.followRole).onChange(async value => {
          this.plugin.settings.followRole = value;
          await this.plugin.saveSettings();
        })
      );

    // --- Секція: Storage & History ---
    this.createSectionHeader("Storage & History");
    new Setting(containerEl)
      .setName("Save Message History")
      .setDesc("Save chat conversations to files.")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.saveMessageHistory).onChange(async value => {
          this.plugin.settings.saveMessageHistory = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );
    if (this.plugin.settings.saveMessageHistory) {
      new Setting(containerEl)
        .setName("Chat History Folder Path")
        .setDesc('Folder to store chat history (.json files). Use "/" for vault root.')
        .addText(text =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.chatHistoryFolderPath)
            .setValue(this.plugin.settings.chatHistoryFolderPath)
            .onChange(async value => {
              // --- ВИПРАВЛЕННЯ: Використовуємо normalizePath ---
              this.plugin.settings.chatHistoryFolderPath =
                value.trim() === "/" ? "/" : normalizePath(value.trim()) || DEFAULT_SETTINGS.chatHistoryFolderPath;
              await this.plugin.saveSettings();
              this.debouncedUpdateChatPath();
            })
        );
    }
    new Setting(containerEl)
      .setName("Chat Export Folder Path")
      .setDesc("Default folder for exported Markdown chats.")
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.chatExportFolderPath || "Vault Root")
          .setValue(this.plugin.settings.chatExportFolderPath)
          .onChange(async value => {
            // --- ВИПРАВЛЕННЯ: Використовуємо normalizePath ---
            this.plugin.settings.chatExportFolderPath =
              normalizePath(value.trim()) || DEFAULT_SETTINGS.chatExportFolderPath;
            await this.plugin.saveSettings();
            if (this.plugin.chatManager) await this.plugin.chatManager.ensureFoldersExist();
          })
      );

    // --- Секція: Retrieval-Augmented Generation (RAG) ---
    this.createSectionHeader("Retrieval-Augmented Generation (RAG)");
    new Setting(containerEl)
      .setName("Enable RAG")
      .setDesc("Allow retrieving info from notes for context.")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.ragEnabled).onChange(async value => {
          this.plugin.settings.ragEnabled = value;
          await this.plugin.saveSettings();
          this.display();
          if (value) this.debouncedUpdateRagPath();
        })
      );
    if (this.plugin.settings.ragEnabled) {
      new Setting(containerEl)
        .setName("RAG Documents Folder Path")
        .setDesc("Folder with notes for RAG.")
        .addText(text =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.ragFolderPath)
            .setValue(this.plugin.settings.ragFolderPath)
            .onChange(async value => {
              // --- ВИПРАВЛЕННЯ: Використовуємо normalizePath ---
              this.plugin.settings.ragFolderPath = normalizePath(value.trim()) || DEFAULT_SETTINGS.ragFolderPath;
              await this.plugin.saveSettings();
              this.debouncedUpdateRagPath();
              this.plugin.updateDailyTaskFilePath?.();
              this.plugin.loadAndProcessInitialTasks?.();
            })
        );
      new Setting(containerEl)
        .setName("Enable Semantic Search")
        .setDesc("Use embeddings (more accurate). If OFF, uses keyword search.")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.ragEnableSemanticSearch).onChange(async value => {
            this.plugin.settings.ragEnableSemanticSearch = value;
            await this.plugin.saveSettings();
            this.display();
            this.debouncedUpdateRagPath();
          })
        );
      if (this.plugin.settings.ragEnableSemanticSearch) {
        let embeddingDropdown: DropdownComponent | null = null;
        const updateEmbeddingOptions = async (dropdown: DropdownComponent | null, button?: ExtraButtonComponent) => {
          if (!dropdown) return;
          const previousValue = this.plugin.settings.ragEmbeddingModel;
          dropdown.selectEl.innerHTML = "";
          dropdown.addOption("", "Loading models...");
          dropdown.setDisabled(true);
          button?.setDisabled(true).setIcon("loader");
          try {
            const models = await this.plugin.ollamaService.getModels();
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
            dropdown.setValue(
              models.includes(previousValue) ? previousValue : commonEmbedModels.length > 0 ? commonEmbedModels[0] : ""
            );
          } catch (error) {
            console.error("Error fetching models for embedding dropdown:", error);
            dropdown.selectEl.innerHTML = "";
            dropdown.addOption("", "Error loading models!");
            dropdown.setValue(previousValue); // Повертаємо старе значення при помилці
          } finally {
            dropdown.setDisabled(false);
            button?.setDisabled(false).setIcon("refresh-cw");
          }
        };
        new Setting(containerEl)
          .setName("Embedding Model Name")
          .setDesc("Ollama model for embeddings.")
          .setClass("ollama-model-setting-container")
          .addDropdown(async dropdown => {
            embeddingDropdown = dropdown;
            dropdown.onChange(async value => {
              this.plugin.settings.ragEmbeddingModel = value;
              await this.plugin.saveSettings();
              this.debouncedUpdateRagPath();
            });
            await updateEmbeddingOptions(dropdown);
          })
          .addExtraButton(button => {
            button
              .setIcon("refresh-cw")
              .setTooltip("Refresh model list")
              .onClick(async () => {
                await updateEmbeddingOptions(embeddingDropdown, button);
                new Notice("Model list refreshed!");
              });
          });
        new Setting(containerEl)
          .setName("Chunk Size (Characters)")
          .setDesc("Size of text chunks for indexing.")
          .addText(text =>
            text
              .setPlaceholder(String(DEFAULT_SETTINGS.ragChunkSize))
              .setValue(String(this.plugin.settings.ragChunkSize))
              .onChange(async value => {
                const num = parseInt(value.trim(), 10);
                this.plugin.settings.ragChunkSize = !isNaN(num) && num > 50 ? num : DEFAULT_SETTINGS.ragChunkSize;
                await this.plugin.saveSettings();
                this.debouncedUpdateRagPath();
              })
          );
        new Setting(containerEl)
          .setName("Similarity Threshold")
          .setDesc("Min relevance score (0.0-1.0). Higher = stricter matching.")
          .addSlider((slider: SliderComponent) =>
            slider
              .setLimits(0, 1, 0.05)
              .setValue(this.plugin.settings.ragSimilarityThreshold)
              .setDynamicTooltip()
              .onChange(async value => {
                this.plugin.settings.ragSimilarityThreshold = value;
                await this.plugin.saveSettings();
              })
          );
        new Setting(containerEl)
          .setName("Top K Results")
          .setDesc("Max number of relevant chunks to retrieve.")
          .addText(text =>
            text
              .setPlaceholder(String(DEFAULT_SETTINGS.ragTopK))
              .setValue(String(this.plugin.settings.ragTopK))
              .onChange(async value => {
                const num = parseInt(value.trim(), 10);
                this.plugin.settings.ragTopK = !isNaN(num) && num > 0 ? num : DEFAULT_SETTINGS.ragTopK;
                await this.plugin.saveSettings();
              })
          );
      }
      new Setting(containerEl)
        .setName("Max Chars Per Document (During Context Build)")
        .setDesc("Limits characters included per retrieved document in the final prompt (0=no limit).")
        .addText(text =>
          text
            .setPlaceholder(String(DEFAULT_SETTINGS.maxCharsPerDoc))
            .setValue(String(this.plugin.settings.maxCharsPerDoc))
            .onChange(async value => {
              const num = parseInt(value.trim(), 10);
              this.plugin.settings.maxCharsPerDoc = !isNaN(num) && num >= 0 ? num : DEFAULT_SETTINGS.maxCharsPerDoc;
              await this.plugin.saveSettings();
            })
        );
    }

    this.createSectionHeader("Advanced Context Management");
    new Setting(containerEl)
      .setName("Use Advanced Context Strategy")
      .setDesc("Enable automatic chat summarization and message chunking for long conversations.")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.useAdvancedContextStrategy).onChange(async value => {
          this.plugin.settings.useAdvancedContextStrategy = value;
          await this.plugin.saveSettings();
          this.display(); // Re-render settings to show/hide summarization options
        })
      );

    if (this.plugin.settings.useAdvancedContextStrategy) {
      new Setting(containerEl)
        .setName("Enable Context Summarization")
        .setDesc("Automatically summarize older parts of the conversation.")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.enableSummarization).onChange(async value => {
            this.plugin.settings.enableSummarization = value;
            await this.plugin.saveSettings();
            this.display(); // Re-render to show/hide prompt
          })
        );

      if (this.plugin.settings.enableSummarization) {
        new Setting(containerEl)
          .setName("Summarization Prompt")
          .setDesc("Prompt used for summarization. Use {text_to_summarize} placeholder.")
          .addTextArea(text =>
            text
              .setPlaceholder(DEFAULT_SETTINGS.summarizationPrompt)
              .setValue(this.plugin.settings.summarizationPrompt)
              .onChange(async value => {
                this.plugin.settings.summarizationPrompt = value || DEFAULT_SETTINGS.summarizationPrompt;
                await this.plugin.saveSettings();
              })
              .inputEl.setAttrs({ rows: 4 })
          );
      }

      // --- НОВЕ: Вибір моделі для сумаризації ---
      let summarizationModelDropdown: DropdownComponent | null = null;
      const updateSummarizationOptions = async (dropdown: DropdownComponent | null, button?: ExtraButtonComponent) => {
        if (!dropdown) return;
        const currentVal = this.plugin.settings.summarizationModelName; // Використовуємо нове поле
        dropdown.selectEl.innerHTML = "";
        dropdown.addOption("", "Loading models...");
        dropdown.setDisabled(true);
        button?.setDisabled(true).setIcon("loader");
        try {
          const models = await this.plugin.ollamaService.getModels();
          dropdown.selectEl.innerHTML = "";
          dropdown.addOption("", "-- Select Summarization Model --"); // Змінено текст
          if (models && models.length > 0) {
            models.forEach(modelName => {
              dropdown.addOption(modelName, modelName);
            });
            dropdown.setValue(models.includes(currentVal) ? currentVal : "");
          } else {
            dropdown.addOption("", "No models found");
            dropdown.setValue("");
          }
        } catch (error) {
          this.plugin.logger.error("Error fetching models for summarization settings:", error);
          dropdown.selectEl.innerHTML = "";
          dropdown.addOption("", "Error loading models!");
          dropdown.setValue("");
        } finally {
          dropdown.setDisabled(false);
          button?.setDisabled(false).setIcon("refresh-cw");
        }
      };

      new Setting(containerEl)
        .setName("Summarization Model") // Нова назва
        .setDesc("Model used for summarizing chat history and individual messages.") // Оновлений опис
        .addDropdown(async dropdown => {
          summarizationModelDropdown = dropdown;
          dropdown.onChange(async value => {
            this.plugin.settings.summarizationModelName = value; // Зберігаємо в нове поле
            await this.plugin.saveSettings();
          });
          await updateSummarizationOptions(dropdown); // Initial load
        })
        .addExtraButton(button => {
          button
            .setIcon("refresh-cw")
            .setTooltip("Refresh model list")
            .onClick(async () => {
              await updateSummarizationOptions(summarizationModelDropdown, button);
              new Notice("Model list refreshed!");
            });
        });

      new Setting(containerEl)
        .setName("Keep Last N Messages Before Summary")
        .setDesc("Number of recent messages excluded from summarization.")
        .addText(text =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.keepLastNMessagesBeforeSummary.toString())
            .setValue(this.plugin.settings.keepLastNMessagesBeforeSummary.toString())
            .onChange(async value => {
              const num = parseInt(value.trim(), 10);
              this.plugin.settings.keepLastNMessagesBeforeSummary =
                !isNaN(num) && num >= 0 ? num : DEFAULT_SETTINGS.keepLastNMessagesBeforeSummary;
              await this.plugin.saveSettings();
            })
        );
      new Setting(containerEl)
        .setName("Fallback Summarization Model")
        .setDesc(
          "Optional. Model to use if the primary summarization model is not set or not found. Uses the main Ollama server."
        )
        .addText(text =>
          text
            .setPlaceholder("e.g., orca-mini or leave empty") // Приклад
            .setValue(this.plugin.settings.fallbackSummarizationModelName)
            .onChange(async value => {
              this.plugin.settings.fallbackSummarizationModelName = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Summarization Chunk Size (Tokens)")
        .setDesc("Approximate size of text chunks passed to the summarization model.")
        .addText(text =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.summarizationChunkSize.toString())
            .setValue(this.plugin.settings.summarizationChunkSize.toString())
            .onChange(async value => {
              const num = parseInt(value.trim(), 10);
              this.plugin.settings.summarizationChunkSize =
                !isNaN(num) && num > 100 ? num : DEFAULT_SETTINGS.summarizationChunkSize;
              await this.plugin.saveSettings();
            })
        );
    }

    // --- Секція: Productivity Assistant Features ---
    this.createSectionHeader("Productivity Assistant Features");
    new Setting(containerEl)
      .setName("Enable Productivity Features")
      .setDesc("Activate daily task integration.")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enableProductivityFeatures).onChange(async value => {
          this.plugin.settings.enableProductivityFeatures = value;
          await this.plugin.saveSettings();
          this.display();
          this.plugin.updateDailyTaskFilePath?.();
          this.plugin.loadAndProcessInitialTasks?.();
        })
      );

    if (this.plugin.settings.enableProductivityFeatures) {
      new Setting(containerEl)
        .setName("Daily Task File Name")
        .setDesc("Filename within the RAG folder used for daily tasks.")
        .addText(text =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.dailyTaskFileName)
            .setValue(this.plugin.settings.dailyTaskFileName)
            .onChange(async value => {
              this.plugin.settings.dailyTaskFileName = value.trim() || DEFAULT_SETTINGS.dailyTaskFileName;
              await this.plugin.saveSettings();
              this.plugin.updateDailyTaskFilePath?.();
              this.plugin.loadAndProcessInitialTasks?.();
            })
        );
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
        .onChange(async (value: TranslationProvider) => {
          this.plugin.settings.translationProvider = value;
          // Вмикаємо/вимикаємо загальний перемикач залежно від вибору
          this.plugin.settings.enableTranslation = value !== 'none';
          await this.plugin.saveSettings();
          this.display(); // Перемалювати налаштування, щоб показати/сховати залежні опції
        })
      );

    // --- Умовні налаштування для Google Translate ---
    if (this.plugin.settings.translationProvider === 'google') {
        new Setting(containerEl)
        .setName("Target Translation Language (Google)")
        .setDesc("Translate messages/input into this language using Google.")
        .addDropdown(dropdown => {
          for (const code in LANGUAGES) {
            dropdown.addOption(code, LANGUAGES[code]);
          }
          dropdown.setValue(this.plugin.settings.translationTargetLanguage).onChange(async value => {
            this.plugin.settings.translationTargetLanguage = value;
            await this.plugin.saveSettings();
          });
        });
      new Setting(containerEl)
        .setName("Google Cloud Translation API Key")
        .setDesc("Required for Google translation feature. Keep confidential.")
        .addText(text =>
          text
            .setPlaceholder("Enter API Key")
            .setValue(this.plugin.settings.googleTranslationApiKey)
            .onChange(async value => {
              this.plugin.settings.googleTranslationApiKey = value.trim();
              await this.plugin.saveSettings();
            })
        );
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
        let ollamaTranslationModelDropdown: DropdownComponent | null = null;
        const updateOllamaTranslationOptions = async (dropdown: DropdownComponent | null, button?: ExtraButtonComponent) => {
            if (!dropdown) return;
            const currentVal = this.plugin.settings.ollamaTranslationModel;
            dropdown.selectEl.innerHTML = ""; dropdown.addOption("", "Loading models..."); dropdown.setDisabled(true);
            button?.setDisabled(true).setIcon("loader");
            try {
                const models = await this.plugin.ollamaService.getModels();
                dropdown.selectEl.innerHTML = ""; dropdown.addOption("", "-- Select Ollama Translation Model --");
                if (models && models.length > 0) {
                    models.forEach(m => dropdown.addOption(m, m));
                    dropdown.setValue(models.includes(currentVal) ? currentVal : "");
                } else { dropdown.addOption("", "No models found"); dropdown.setValue(""); }
            } catch (error) { /* ... обробка помилки ... */
                 this.plugin.logger.error("Error fetching models for Ollama translation settings:", error);
                 dropdown.selectEl.innerHTML = ""; dropdown.addOption("", "Error loading models!"); dropdown.setValue("");
             } finally { dropdown.setDisabled(false); button?.setDisabled(false).setIcon("refresh-cw"); }
        };

         new Setting(containerEl)
            .setName("Ollama Translation Model")
            .setDesc("Ollama model to use for translation tasks.")
            .addDropdown(async dropdown => {
                ollamaTranslationModelDropdown = dropdown;
                dropdown.onChange(async value => {
                    this.plugin.settings.ollamaTranslationModel = value;
                    await this.plugin.saveSettings();
                });
                await updateOllamaTranslationOptions(dropdown); // Initial load
            })
            .addExtraButton(button => {
                button.setIcon("refresh-cw").setTooltip("Refresh model list")
                    .onClick(async () => { await updateOllamaTranslationOptions(ollamaTranslationModelDropdown, button); new Notice("Model list refreshed!"); });
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
              dropdown.setValue(this.plugin.settings.translationTargetLanguage).onChange(async value => {
                this.plugin.settings.translationTargetLanguage = value;
                await this.plugin.saveSettings();
              });
            });
            // TODO: Можливо, додати поле для "Source Language" для Ollama,
            // або реалізувати автодетектування (що складніше). Поки що припускаємо
                  // переклад з мови інтерфейсу або англійської.

    }}

    new Setting(containerEl)
      .setName("Google API Key (Speech-to-Text)")
      .setDesc("Required for voice input. Keep confidential.")
      .addText(text =>
        text
          .setPlaceholder("Enter API Key")
          .setValue(this.plugin.settings.googleApiKey)
          .onChange(async value => {
            this.plugin.settings.googleApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("Speech Recognition Language")
      .setDesc("Language for voice input (e.g., en-US, uk-UA).")
      .addDropdown(dropdown => {
        const speechLangs: Record<string, string> = {
          "uk-UA": "Ukrainian",
          "en-US": "English (US)" /* ... add more if needed ... */,
        };
        for (const code in speechLangs) {
          dropdown.addOption(code, speechLangs[code]);
        }
        dropdown.setValue(this.plugin.settings.speechLanguage).onChange(async value => {
          this.plugin.settings.speechLanguage = value;
          await this.plugin.saveSettings();
        });
      });
    

    // --- Секція: Logging ---
    this.createSectionHeader("Logging");
    const logLevelOptions: Record<string, string> = {};
    Object.keys(LogLevel).forEach(key => {
      if (isNaN(Number(key))) {
        logLevelOptions[key] = key;
      }
    });

    new Setting(containerEl)
      .setName("Console Log Level")
      .setDesc("Minimum level for developer console.")
      .addDropdown(dropdown =>
        dropdown
          .addOptions(logLevelOptions)
          .setValue(this.plugin.settings.consoleLogLevel || "INFO")
          .onChange(async (value: keyof typeof LogLevel) => {
            this.plugin.settings.consoleLogLevel = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable File Logging")
      .setDesc(`Log to ${this.plugin.logger.getLogFilePath()} (for debugging).`) // Використовуємо метод логера
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.fileLoggingEnabled).onChange(async value => {
          this.plugin.settings.fileLoggingEnabled = value;
          await this.plugin.saveSettings();
          this.display(); // Перемалювати, щоб показати/сховати налаштування файлу
        })
      );

    if (this.plugin.settings.fileLoggingEnabled) {
      new Setting(containerEl)
        .setName("File Log Level")
        .setDesc("Minimum level for log file.")
        .addDropdown(dropdown =>
          dropdown
            .addOptions(logLevelOptions)
            .setValue(this.plugin.settings.fileLogLevel || "WARN")
            .onChange(async (value: keyof typeof LogLevel) => {
              this.plugin.settings.fileLogLevel = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Log Caller Method Name")
        .setDesc("Include [MethodName] in logs. May slightly impact performance.")
        .addToggle(toggle =>
          toggle.setValue(this.plugin.settings.logCallerInfo).onChange(async value => {
            this.plugin.settings.logCallerInfo = value;
            await this.plugin.saveSettings();
          })
        );

      // Відображення шляху до файлу логів
      new Setting(containerEl)
        .setName("Log File Path")
        .setDesc("Current location of the log file.")
        .addText(text =>
          text
            // --- ВИПРАВЛЕННЯ: Використовуємо доданий метод ---
            .setValue(this.plugin.logger.getLogFilePath())
            // --- Кінець виправлення ---
            .setDisabled(true)
        );
    }
  }
}
