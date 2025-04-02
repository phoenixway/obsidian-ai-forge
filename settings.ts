import {
  App,
  PluginSettingTab,
  Setting,
  DropdownComponent,
  Notice,
  TextComponent,
  ButtonComponent
} from "obsidian";
import OllamaPlugin from "./main";

// Нові типи для налаштувань аватарів
export type AvatarType = 'initials' | 'icon';

export interface OllamaPluginSettings {
  modelName: string;
  ollamaServerUrl: string;
  logFileSizeLimit: number; // Size in KB
  saveMessageHistory: boolean;
  ragEnabled: boolean;
  ragFolderPath: string;
  contextWindowSize: number; // Кількість документів RAG
  googleApiKey: string; // API key for Google Speech-to-Text
  speechLanguage: string; // Language code for speech recognition
  maxRecordingTime: number; // Maximum recording time in seconds
  silenceDetection: boolean; // Enable silence detection
  followRole: boolean;
  useDefaultRoleDefinition: boolean; // Whether to use default role file
  customRoleFilePath: string; // Path to custom role definition file
  systemPromptInterval: number;
  temperature: number;
  contextWindow: number; // Розмір контекстного вікна моделі (токени)

  // --- Нові налаштування UI/UX ---
  userAvatarType: AvatarType;
  userAvatarContent: string; // Ініціали або назва іконки Obsidian
  aiAvatarType: AvatarType;
  aiAvatarContent: string; // Ініціали або назва іконки Obsidian
  maxMessageHeight: number; // Макс. висота повідомлення перед згортанням (px), 0 = вимкнено

  // --- Нове налаштування ---
  useAdvancedContextStrategy: boolean; // Перемикач для нової стратегії
}

export const DEFAULT_SETTINGS: OllamaPluginSettings = {
  modelName: "mistral",
  ollamaServerUrl: "http://localhost:11434",
  logFileSizeLimit: 1024,
  saveMessageHistory: true,
  ragEnabled: false,
  ragFolderPath: "data",
  contextWindowSize: 5, // RAG docs
  googleApiKey: "",
  speechLanguage: "uk-UA", // Мова за замовчуванням - українська
  maxRecordingTime: 15,
  silenceDetection: true,
  followRole: true,
  useDefaultRoleDefinition: true,
  customRoleFilePath: "",
  systemPromptInterval: 0,
  temperature: 0.1,
  contextWindow: 8192, // Model context window
  userAvatarType: 'initials',
  userAvatarContent: 'U',
  aiAvatarType: 'icon',
  aiAvatarContent: 'bot', // Іконка Obsidian
  maxMessageHeight: 300, // Згортати повідомлення довші за 300px
  // --- Нове значення ---
  useAdvancedContextStrategy: false, // За замовчуванням вимкнено
};

export class OllamaSettingTab extends PluginSettingTab {
  plugin: OllamaPlugin;

  constructor(app: App, plugin: OllamaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getDisplayText(): string {
    return "Ollama";
  }

  getId(): string {
    // Повертає унікальний ID для вкладки налаштувань
    return "ollama-plugin";
  }

  // Допоміжна функція для пошуку іконок
  private createIconSearch(containerEl: HTMLElement, settingType: 'user' | 'ai') {
    const searchContainer = containerEl.createDiv({ cls: 'ollama-icon-search-container' });
    let searchInput: TextComponent;
    let resultsEl: HTMLElement;

    const performSearch = () => {
      const query = searchInput.getValue().toLowerCase().trim();
      resultsEl.empty();
      if (!query) return;

      // @ts-ignore - Доступ до всіх іконок Obsidian (неофіційний API)
      const allIcons = window.require('obsidian')?.getIconIds?.() || [];
      const filteredIcons = allIcons.filter((icon: string) => icon.includes(query)).slice(0, 50); // Обмеження результатів

      if (filteredIcons.length > 0) {
        filteredIcons.forEach((icon: string) => {
          const iconEl = resultsEl.createEl('button', { cls: 'ollama-icon-search-result' });
          // @ts-ignore
          window.require('obsidian').setIcon(iconEl, icon);
          iconEl.setAttribute('aria-label', icon);
          iconEl.onClickEvent(() => {
            if (settingType === 'user') {
              this.plugin.settings.userAvatarContent = icon;
            } else {
              this.plugin.settings.aiAvatarContent = icon;
            }
            this.plugin.saveSettings();
            this.display(); // Оновити UI налаштувань
          });
        });
      } else {
        resultsEl.setText('Іконок не знайдено.');
      }
    };

    searchInput = new TextComponent(searchContainer)
      .setPlaceholder('Пошук іконок Obsidian...')
      .onChange(performSearch);

    resultsEl = searchContainer.createDiv({ cls: 'ollama-icon-search-results' });
  }


  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ollama-settings'); // Додаємо клас для стилізації

    // --- Basic Configuration ---
    containerEl.createEl("h2", { text: "Основні Налаштування" });

    new Setting(containerEl)
      .setName("Ollama Server URL")
      .setDesc(
        "IP адреса та порт, де запущено Ollama (напр. http://192.168.1.10:11434)"
      )
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:11434")
          .setValue(this.plugin.settings.ollamaServerUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaServerUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("З'єднання з сервером")
      .setDesc("Перепідключитися до сервера локальної моделі та оновити список доступних моделей")
      .addButton((button) =>
        button
          .setButtonText("Перепідключитись")
          .setIcon("refresh-cw")
          .onClick(async () => {
            try {
              new Notice("Підключення до сервера Ollama...");
              await this.plugin.apiService.getModels(); // Просто перевіряємо з'єднання
              new Notice("Успішно підключено до сервера Ollama!");
              this.display(); // Перемалювати налаштування для оновлення списку моделей
            } catch (error: any) {
              new Notice(`Помилка підключення: ${error.message}. Перевірте URL та стан сервера.`);
              if (this.plugin.view) {
                this.plugin.view.internalAddMessage(
                  "error",
                  `Помилка підключення до Ollama: ${error.message}. Перевірте налаштування.`
                );
              }
            }
          })
      );

    // Fetch available models
    let availableModels: string[] = [];
    try {
      availableModels = await this.plugin.apiService.getModels();
    } catch (error: any) {
      console.error("Помилка отримання моделей:", error);
      if (this.plugin.view) {
        this.plugin.view.internalAddMessage(
          "error",
          `Не вдалося отримати список моделей: ${error.message}.`
        );
      }
    }

    const modelSetting = new Setting(containerEl)
      .setName("Назва Моделі")
      .setDesc("Оберіть мовну модель для використання");

    modelSetting.addDropdown((dropdown) => {
      const selectEl = dropdown.selectEl;
      selectEl.empty(); // Очищуємо перед додаванням

      if (availableModels.length > 0) {
        availableModels.forEach((model) => {
          dropdown.addOption(model, model);
        });
        // Встановлюємо значення тільки якщо є моделі
        const currentModel = this.plugin.settings.modelName;
        if (availableModels.includes(currentModel)) {
          dropdown.setValue(currentModel);
        } else if (availableModels.length > 0) {
          // Якщо поточна модель не знайдена, оберіть першу доступну
          dropdown.setValue(availableModels[0]);
          this.plugin.settings.modelName = availableModels[0];
          this.plugin.saveSettings(); // Зберегти автоматично обрану модель
        }
      } else {
        dropdown.addOption("", "Моделі не знайдено");
        dropdown.setDisabled(true);
      }


      dropdown.onChange(async (value) => {
        this.plugin.settings.modelName = value;
        this.plugin.emit('model-changed', value);
        await this.plugin.saveSettings();
      });
    });

    new Setting(containerEl)
      .setName("Температура")
      .setDesc("Контролює випадковість відповідей моделі (0.0 - 1.0)")
      .addSlider((slider) =>
        slider
          .setLimits(0, 1, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          })
      );

    // --- Контекстне вікно ТА НОВА СТРАТЕГІЯ ---
    containerEl.createEl("h2", { text: "Керування Контекстом" });

    new Setting(containerEl)
      .setName("Контекстне вікно моделі (токени)")
      .setDesc("Макс. кількість токенів, яку модель може обробити (з документації моделі).")
      .addText((text) =>
        text
          .setPlaceholder("8192")
          .setValue(String(this.plugin.settings.contextWindow))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.contextWindow = num;
              await this.plugin.saveSettings();
            } else {
              new Notice("Введіть позитивне число.");
              text.setValue(String(this.plugin.settings.contextWindow));
            }
          })
      );

    new Setting(containerEl)
      .setName("Експериментально: Просунуте керування контекстом")
      .setDesc("Використовувати токенізатор для точного підрахунку та обрізання контексту. Якщо вимкнено, використовується менш точний підрахунок за словами.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useAdvancedContextStrategy)
        .onChange(async value => {
          this.plugin.settings.useAdvancedContextStrategy = value;
          await this.plugin.saveSettings();
          if (value) {
            new Notice("Просунуте керування контекстом увімкнено (використовує токенізатор).");
          } else {
            new Notice("Просунуте керування контекстом вимкнено (використовує підрахунок слів).");
          }
        })
      );
    // Пояснення щодо сумаризації (поки не реалізовано)
    const noteEl = containerEl.createEl('p', { text: 'Примітка: Автоматична сумаризація історії для дуже довгих розмов наразі не реалізована в просунутому режимі.', cls: 'setting-item-description ollama-subtle-notice' });


    // --- Chat History & Persistence ---
    containerEl.createEl("h2", { text: "Історія Чату" });

    new Setting(containerEl)
      .setName("Зберігати історію")
      .setDesc("Зберігати історію чату між сесіями")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.saveMessageHistory)
          .onChange(async (value) => {
            this.plugin.settings.saveMessageHistory = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ліміт розміру файлу історії (KB)")
      .setDesc("Максимальний розмір файлу історії (1024 KB = 1 MB)")
      .addSlider((slider) =>
        slider
          .setLimits(256, 10240, 256) // 256KB to 10MB
          .setValue(this.plugin.settings.logFileSizeLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.logFileSizeLimit = value;
            await this.plugin.saveSettings();
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("reset")
          .setTooltip("Скинути до стандартного (1024 KB)")
          .onClick(async () => {
            this.plugin.settings.logFileSizeLimit =
              DEFAULT_SETTINGS.logFileSizeLimit;
            await this.plugin.saveSettings();
            this.display(); // Перемалювати для оновлення слайдера
          })
      );

    new Setting(containerEl)
      .setName("Очистити Історію")
      .setDesc("Видалити всю історію чату")
      .addButton((button) =>
        button.setButtonText("Очистити").onClick(async () => {
          // Додаємо підтвердження
          if (confirm("Ви впевнені, що хочете видалити всю історію чату? Цю дію неможливо скасувати.")) {
            await this.plugin.clearMessageHistory();
            new Notice("Історію чату очищено.");
          }
        })
      );


    // --- UI/UX Settings ---
    containerEl.createEl("h2", { text: "Зовнішній Вигляд" });

    // User Avatar Settings
    containerEl.createEl("h4", { text: "Аватар Користувача" });
    new Setting(containerEl)
      .setName("Тип аватара користувача")
      .addDropdown(dd => dd
        .addOption('initials', 'Ініціали')
        .addOption('icon', 'Іконка Obsidian')
        .setValue(this.plugin.settings.userAvatarType)
        .onChange(async (value: AvatarType) => {
          this.plugin.settings.userAvatarType = value;
          await this.plugin.saveSettings();
          this.display(); // Перемалювати, щоб показати/сховати поле вмісту
        })
      );

    if (this.plugin.settings.userAvatarType === 'initials') {
      new Setting(containerEl)
        .setName("Ініціали користувача")
        .setDesc("Введіть 1-2 літери")
        .addText(text => text
          .setValue(this.plugin.settings.userAvatarContent)
          .onChange(async (value) => {
            this.plugin.settings.userAvatarContent = value.substring(0, 2).toUpperCase(); // Обмеження до 2 літер
            await this.plugin.saveSettings();
            // Не потрібно перемальовувати тут
          })
        );
    } else { // type === 'icon'
      new Setting(containerEl)
        .setName("Іконка користувача")
        .setDesc("Введіть назву іконки Obsidian")
        .addText(text => text
          .setValue(this.plugin.settings.userAvatarContent)
          .setPlaceholder('Напр. user, smile, etc.')
          .onChange(async (value) => {
            this.plugin.settings.userAvatarContent = value.trim();
            await this.plugin.saveSettings();
          })
        );
      this.createIconSearch(containerEl, 'user'); // Додаємо пошук іконок
    }

    // AI Avatar Settings
    containerEl.createEl("h4", { text: "Аватар AI" });
    new Setting(containerEl)
      .setName("Тип аватара AI")
      .addDropdown(dd => dd
        .addOption('initials', 'Ініціали')
        .addOption('icon', 'Іконка Obsidian')
        .setValue(this.plugin.settings.aiAvatarType)
        .onChange(async (value: AvatarType) => {
          this.plugin.settings.aiAvatarType = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.aiAvatarType === 'initials') {
      new Setting(containerEl)
        .setName("Ініціали AI")
        .setDesc("Введіть 1-2 літери")
        .addText(text => text
          .setValue(this.plugin.settings.aiAvatarContent)
          .onChange(async (value) => {
            this.plugin.settings.aiAvatarContent = value.substring(0, 2).toUpperCase();
            await this.plugin.saveSettings();
          })
        );
    } else { // type === 'icon'
      new Setting(containerEl)
        .setName("Іконка AI")
        .setDesc("Введіть назву іконки Obsidian")
        .addText(text => text
          .setValue(this.plugin.settings.aiAvatarContent)
          .setPlaceholder('Напр. bot, cpu, brain, etc.')
          .onChange(async (value) => {
            this.plugin.settings.aiAvatarContent = value.trim();
            await this.plugin.saveSettings();
          })
        );
      this.createIconSearch(containerEl, 'ai'); // Додаємо пошук іконок
    }

    // Max Message Height Setting
    new Setting(containerEl)
      .setName("Макс. висота повідомлення (px)")
      .setDesc("Довші повідомлення будуть згортатись. 0 - вимкнути.")
      .addText(text => text
        .setPlaceholder("300")
        .setValue(String(this.plugin.settings.maxMessageHeight))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 0) {
            this.plugin.settings.maxMessageHeight = num;
            await this.plugin.saveSettings();
          } else {
            new Notice("Введіть невід'ємне число.");
            text.setValue(String(this.plugin.settings.maxMessageHeight));
          }
        })
      );


    // --- Role Configuration ---
    containerEl.createEl("h2", { text: "Конфігурація Ролі AI" });

    new Setting(containerEl)
      .setName("Ввімкнути роль")
      .setDesc("Змусити Ollama слідувати ролі з файлу")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.followRole)
          .onChange(async (value) => {
            this.plugin.settings.followRole = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Використ. стандартну роль")
      .setDesc("Використовувати default-role.md з папки плагіна")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useDefaultRoleDefinition)
          .onChange(async (value) => {
            this.plugin.settings.useDefaultRoleDefinition = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Шлях до власної ролі")
      .setDesc("Шлях до файлу ролі (відносно кореня сховища)")
      .addText((text) =>
        text
          .setPlaceholder("шлях/до/файлу_ролі.md")
          .setValue(this.plugin.settings.customRoleFilePath)
          .onChange(async (value) => {
            this.plugin.settings.customRoleFilePath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Інтервал системного промпту")
      .setDesc("К-ть пар повідомлень між надсиланнями сист. промпту (0=завжди, <0=ніколи)")
      .addText((text) => // Використовуємо Text для введення чисел
        text
          .setValue(String(this.plugin.settings.systemPromptInterval))
          .onChange(async (value) => {
            // Дозволяємо від'ємні значення
            this.plugin.settings.systemPromptInterval = parseInt(value) || 0;
            await this.plugin.saveSettings();
          })
      );


    // --- RAG Configuration ---
    containerEl.createEl("h2", { text: "Конфігурація RAG" });

    new Setting(containerEl)
      .setName("Ввімкнути RAG")
      .setDesc("Використовувати Retrieval Augmented Generation з вашими нотатками")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ragEnabled)
          .onChange(async (value) => {
            this.plugin.settings.ragEnabled = value;
            await this.plugin.saveSettings();
            if (value && this.plugin.ragService) {
              new Notice("RAG увімкнено. Індексація документів...");
              // Потенційно запускаємо індексацію асинхронно, щоб не блокувати UI
              setTimeout(() => this.plugin.ragService?.indexDocuments(), 100);
            }
          })
      );

    new Setting(containerEl)
      .setName("Шлях до папки RAG")
      .setDesc("Папка з документами для RAG (відносно кореня сховища)")
      .addText((text) =>
        text
          .setPlaceholder("data/rag_docs") // Приклад
          .setValue(this.plugin.settings.ragFolderPath)
          .onChange(async (value) => {
            this.plugin.settings.ragFolderPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Кількість документів RAG у контексті")
      .setDesc("Скільки найбільш релевантних фрагментів документів додавати до контексту")
      .addSlider((slider) =>
        slider
          .setLimits(1, 10, 1)
          .setValue(this.plugin.settings.contextWindowSize) // Використовуємо contextWindowSize
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.contextWindowSize = value; // Зберігаємо в contextWindowSize
            await this.plugin.saveSettings();
          })
      );


    // --- Speech Recognition ---
    containerEl.createEl("h2", { text: "Розпізнавання Мовлення" });

    new Setting(containerEl)
      .setName("Google API Key")
      .setDesc("API ключ для сервісу Google Speech-to-Text")
      .addText((text) =>
        text
          .setPlaceholder("Введіть ваш Google API ключ")
          .setValue(this.plugin.settings.googleApiKey)
          .onChange(async (value) => {
            this.plugin.settings.googleApiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Мова розпізнавання")
      .setDesc("Код мови для Google Speech-to-Text (напр., uk-UA, en-US, pl-PL)")
      .addText((text) =>
        text
          .setPlaceholder("uk-UA")
          .setValue(this.plugin.settings.speechLanguage)
          .onChange(async (value) => {
            this.plugin.settings.speechLanguage = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Максимальний час запису (сек)")
      .setDesc("Максимальний час запису голосу перед автоматичною зупинкою")
      .addSlider((slider) =>
        slider
          .setLimits(5, 60, 5)
          .setValue(this.plugin.settings.maxRecordingTime)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxRecordingTime = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Виявлення тиші")
      .setDesc("Автоматично зупиняти запис після періоду тиші (якщо підтримується)")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.silenceDetection)
        .onChange(async value => {
          this.plugin.settings.silenceDetection = value;
          await this.plugin.saveSettings();
        })
      );

    // Додаємо стилі для пошуку іконок при відображенні
    this.addIconSearchStyles();
  }

  // Додаємо стилі CSS для пошуку іконок динамічно
  private addIconSearchStyles() {
    const styleId = 'ollama-icon-search-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .ollama-settings .setting-item-control .ollama-icon-search-container { margin-top: 8px; border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 8px; background-color: var(--background-secondary); }
        .ollama-settings .setting-item-control .ollama-icon-search-container input[type="text"] { width: 100%; margin-bottom: 8px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results { display: flex; flex-wrap: wrap; gap: 4px; max-height: 150px; overflow-y: auto; background-color: var(--background-primary); border-radius: 4px; padding: 4px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar { width: 6px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-track { background: var(--background-secondary); border-radius: 3px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb { background-color: var(--background-modifier-border); border-radius: 3px; }
        .ollama-settings .setting-item-control .ollama-icon-search-results::-webkit-scrollbar-thumb:hover { background-color: var(--interactive-accent-translucent); }
        .ollama-settings .setting-item-control .ollama-icon-search-result { background-color: var(--background-modifier-hover); border: 1px solid transparent; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.1s ease-out; color: var(--text-muted); display: flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; }
        .ollama-settings .setting-item-control .ollama-icon-search-result:hover { background-color: var(--background-modifier-border); border-color: var(--interactive-accent-translucent); color: var(--text-normal); }
        .ollama-settings .setting-item-control .ollama-icon-search-result .svg-icon { width: 16px; height: 16px; }
        .ollama-subtle-notice { opacity: 0.7; font-size: var(--font-ui-smaller); margin-top: 5px; margin-bottom: 10px; padding-left: 10px; border-left: 2px solid var(--background-modifier-border); }
        `;
    document.head.appendChild(style);
  }
}