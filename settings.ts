import {
  App,
  PluginSettingTab,
  Setting,
  DropdownComponent,
  Notice,
  TextComponent, // Додано для пошуку іконок
  ButtonComponent // Додано для кнопки пошуку
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
  contextWindow: number; // Розмір контекстного вікна моделі (токени/слова)

  // --- Нові налаштування UI/UX ---
  userAvatarType: AvatarType;
  userAvatarContent: string; // Ініціали або назва іконки Obsidian
  aiAvatarType: AvatarType;
  aiAvatarContent: string; // Ініціали або назва іконки Obsidian
  maxMessageHeight: number; // Макс. висота повідомлення перед згортанням (px), 0 = вимкнено
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
  speechLanguage: "uk-UA",
  maxRecordingTime: 15,
  silenceDetection: true,
  followRole: true,
  useDefaultRoleDefinition: true,
  customRoleFilePath: "",
  systemPromptInterval: 0,
  temperature: 0.1,
  contextWindow: 8192, // Model context window
  // --- Нові значення за замовчуванням ---
  userAvatarType: 'initials',
  userAvatarContent: 'U',
  aiAvatarType: 'icon',
  aiAvatarContent: 'bot', // Іконка Obsidian
  maxMessageHeight: 300, // Згортати повідомлення довші за 300px
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
        resultsEl.setText('No icons found.');
      }
    };

    searchInput = new TextComponent(searchContainer)
      .setPlaceholder('Search Obsidian icons...')
      .onChange(performSearch);

    resultsEl = searchContainer.createDiv({ cls: 'ollama-icon-search-results' });
  }


  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ollama-settings'); // Додаємо клас для стилізації

    // --- Basic Configuration ---
    containerEl.createEl("h2", { text: "Основні Налаштування" });

    // ... (Ollama Server URL, Reconnect Button - залишаються без змін) ...
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
              // Ви можете також викликати emit тут, якщо потрібно
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

    // ... (Інші базові налаштування: Temperature, Context Window - залишаються без змін) ...
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

    new Setting(containerEl)
      .setName("Контекстне вікно моделі")
      .setDesc("Розмір контекстного вікна моделі (рекомендовано > 8192). Впливає на обсяг історії та RAG, який можна передати.")
      .addText((text) => // Змінено на Text для гнучкості
        text
          .setPlaceholder("8192")
          .setValue(String(this.plugin.settings.contextWindow))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.contextWindow = num;
              await this.plugin.saveSettings();
            } else {
              new Notice("Будь ласка, введіть позитивне числове значення.");
              // Можна відновити попереднє значення або залишити як є
              text.setValue(String(this.plugin.settings.contextWindow));
            }
          })
      );


    // --- Chat History & Persistence ---
    containerEl.createEl("h2", { text: "Історія Чату" });

    // ... (Save History Toggle, Log File Size Limit, Clear History Button - залишаються без змін) ...
    new Setting(containerEl)
      .setName("Зберігати історію повідомлень")
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
      .setName("Ліміт розміру файлу історії")
      .setDesc(
        "Максимальний розмір файлу історії повідомлень в KB (1024 KB = 1 MB)"
      )
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
      .setName("Макс. висота повідомлення перед згортанням")
      .setDesc("Введіть висоту в пікселях. Довші повідомлення матимуть кнопку 'Показати більше'. Введіть 0, щоб вимкнути згортання.")
      .addText(text => text
        .setPlaceholder("300")
        .setValue(String(this.plugin.settings.maxMessageHeight))
        .onChange(async (value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num >= 0) {
            this.plugin.settings.maxMessageHeight = num;
            await this.plugin.saveSettings();
          } else {
            new Notice("Будь ласка, введіть невід'ємне числове значення.");
            text.setValue(String(this.plugin.settings.maxMessageHeight));
          }
        })
      );


    // --- Role Configuration ---
    containerEl.createEl("h2", { text: "Конфігурація Ролі AI" });

    // ... (Follow Role, Use Default, Custom Path, System Prompt Interval - залишаються без змін) ...
    new Setting(containerEl)
      .setName("Ввімкнути визначення ролі")
      .setDesc("Змусити Ollama слідувати визначеній ролі з файлу")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.followRole)
          .onChange(async (value) => {
            this.plugin.settings.followRole = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Використовувати стандартне визначення ролі")
      .setDesc("Використовувати файл default-role.md з папки плагіна")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useDefaultRoleDefinition)
          .onChange(async (value) => {
            this.plugin.settings.useDefaultRoleDefinition = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Шлях до власного визначення ролі")
      .setDesc(
        "Шлях до файлу з власним визначенням ролі (відносно кореня сховища)"
      )
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
      .setDesc("Кількість пар повідомлень між повторними надсиланнями системного промпту. 0 - з кожним запитом, від'ємне - ніколи")
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

    // ... (Enable RAG, RAG Folder Path, Context Window Size (RAG docs) - залишаються без змін) ...
    new Setting(containerEl)
      .setName("Ввімкнути RAG")
      .setDesc("Використовувати Retrieval Augmented Generation з вашими нотатками")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ragEnabled)
          .onChange(async (value) => {
            this.plugin.settings.ragEnabled = value;
            await this.plugin.saveSettings();
            // Опційно: Запустити індексацію при ввімкненні RAG
            if (value && this.plugin.ragService) {
              new Notice("RAG увімкнено. Запускається індексація документів...");
              this.plugin.ragService.indexDocuments();
            }
          })
      );

    new Setting(containerEl)
      .setName("Шлях до папки RAG")
      .setDesc(
        "Шлях до папки, що містить документи для RAG (відносно кореня сховища)"
      )
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

    // ... (Google API Key, Language, Max Recording Time, Silence Detection - залишаються без змін) ...
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
      .setDesc(
        "Код мови для Google Speech-to-Text (напр., uk-UA, en-US, pl-PL)"
      )
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
      .setName("Максимальний час запису")
      .setDesc(
        "Максимальний час (в секундах) для запису перед автоматичною зупинкою"
      )
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

  }
}