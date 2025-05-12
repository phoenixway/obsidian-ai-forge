// PromptService.ts
import { App, normalizePath, TFile, Notice, FrontMatterCache } from "obsidian";
import OllamaPlugin from "./main";
import { Message, MessageRole, OllamaGenerateResponse, RoleDefinition } from "./types";
import { ChatMetadata } from "./Chat";

export class PromptService {
  private plugin: OllamaPlugin;
  private app: App;
  private currentSystemPrompt: string | null = null;
  private currentRolePath: string | null = null;
  private roleCache: Record<string, RoleDefinition> = {};
  private modelDetailsCache: Record<string, any> = {};

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  private _countTokens(text: string): number {
    // ... (без змін) ...
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  clearRoleCache(): void {
    // ... (без змін) ...
    //
    this.roleCache = {};
    this.currentRolePath = null; // Скидаємо кешований шлях
    this.currentSystemPrompt = null;
  }

  clearModelDetailsCache(): void {
    // ... (без змін) ...

    this.modelDetailsCache = {};
  }

  async getRoleDefinition(rolePath: string | null | undefined): Promise<RoleDefinition | null> {
    // ... (без змін, ця логіка завантаження ролі не залежить від RAG) ...
    const normalizedPath = rolePath ? normalizePath(rolePath) : null;

    // Використовуємо кеш, якщо шлях не змінився
    if (normalizedPath === this.currentRolePath && normalizedPath && this.roleCache[normalizedPath]) {
      return this.roleCache[normalizedPath];
    }

    // Якщо шлях змінився або кешу немає - завантажуємо
    if (normalizedPath !== this.currentRolePath) {
      if (this.currentRolePath && this.roleCache[this.currentRolePath]) {
        delete this.roleCache[this.currentRolePath]; // Видаляємо старий кеш
      }
      this.currentRolePath = normalizedPath; // Оновлюємо поточний шлях
      this.currentSystemPrompt = null; // Скидаємо системний промпт
    }

    // Якщо шлях порожній або не треба слідувати ролі - повертаємо null
    if (!normalizedPath || !this.plugin.settings.followRole) {
      // Повертаємо об'єкт з null промптом, але зберігаємо інформацію про продуктивність, якщо вона є у фронтматері
      const definition: RoleDefinition = {
        systemPrompt: null,
        // Тут не можемо визначити isProductivityPersona без читання файлу,
        // але для випадку без ролі це не важливо. Якщо б логіка була іншою,
        // треба було б додати перевірку файлу тут.
        isProductivityPersona: false,
      };
      return definition; // Повертаємо об'єкт, а не просто null
    }

    // Перевіряємо кеш ще раз після оновлення this.currentRolePath
    if (this.roleCache[normalizedPath]) {
      this.currentSystemPrompt = this.roleCache[normalizedPath].systemPrompt;
      return this.roleCache[normalizedPath];
    }

    const file = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (file instanceof TFile) {
      try {
        const fileCache = this.app.metadataCache.getFileCache(file);
        const frontmatter = fileCache?.frontmatter;
        const content = await this.app.vault.cachedRead(file);
        const systemPromptBody = fileCache?.frontmatterPosition?.end
          ? content.substring(fileCache.frontmatterPosition.end.offset).trim()
          : content.trim();

        const isProductivity =
          frontmatter?.assistant_type?.toLowerCase() === "productivity" || frontmatter?.is_planner === true;

        const definition: RoleDefinition = {
          systemPrompt: systemPromptBody || null,
          isProductivityPersona: isProductivity,
        };

        this.roleCache[normalizedPath] = definition; // Кешуємо
        this.currentSystemPrompt = definition.systemPrompt;
        return definition;
      } catch (error) {
        new Notice(`Error loading role: ${file.basename}. Check console.`);
        this.currentSystemPrompt = null;
        // Повертаємо об'єкт помилки або null, залежно від бажаної обробки
        return { systemPrompt: null, isProductivityPersona: false };
      }
    } else {
      this.currentSystemPrompt = null;
      return { systemPrompt: null, isProductivityPersona: false };
    }
  }

  private async _isProductivityPersonaActive(rolePath: string | null | undefined): Promise<boolean> {
    // ... (без змін) ...
    if (!this.plugin.settings.enableProductivityFeatures) {
      return false;
    }
    const roleDefinition = await this.getRoleDefinition(rolePath);
    return roleDefinition?.isProductivityPersona ?? false;
  }

  // src/PromptService.ts

  // ... (інші імпорти та частини класу PromptService) ...

  /**
   * ОНОВЛЕНО: Повертає фінальний системний промпт для API, включаючи нові RAG інструкції
   * та дефолтний промпт для використання інструментів, якщо іншого немає.
   */
  async getSystemPromptForAPI(chatMetadata: ChatMetadata): Promise<string | null> {
    const settings = this.plugin.settings;

    const selectedRolePath =
      chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
        ? chatMetadata.selectedRolePath
        : settings.selectedRolePath;

    let roleDefinition: RoleDefinition | null = null;
    if (selectedRolePath && settings.followRole) {
      this.plugin.logger.debug(`[PromptService] Attempting to load role from: ${selectedRolePath}`);
      roleDefinition = await this.getRoleDefinition(selectedRolePath);
      if (roleDefinition?.systemPrompt) {
        this.plugin.logger.debug(`[PromptService] Role loaded. Prompt length: ${roleDefinition.systemPrompt.length}`);
      } else {
        this.plugin.logger.debug(`[PromptService] Role loaded but no system prompt found in role file, or role not followed.`);
      }
    } else {
      this.plugin.logger.debug(`[PromptService] No role selected or settings.followRole is false.`);
    }

    const roleSystemPrompt = roleDefinition?.systemPrompt || null;
    const isProductivityActive = roleDefinition?.isProductivityPersona ?? false;

    const ragInstructions = `
--- RAG Data Interpretation Rules ---
You will be provided context from the user's notes, potentially split into two sections:
1.  '### Personal Focus Context (User's Life State & Goals)':
    * This section contains HIGH-PRIORITY information reflecting the user's current situation, desired state, goals, priorities, and actions they believe they should take.
    * TREAT THIS SECTION AS THE PRIMARY SOURCE for understanding the user's core objectives and current life context.
    * Use this to align your suggestions, track progress on stated goals/priorities, and provide strategic guidance.
2.  '### General Context from User Notes':
    * This section contains potentially relevant background information from the user's general notes, identified based on semantic similarity to the current query.
    * Use this for supplementary details and broader context.

General Rules for BOTH Context Sections:
* Each context chunk originates from a specific file indicated in its header (e.g., "--- Chunk 1 from Personal Focus Note: My Goals.md ..."). You can refer to source files by name.
* Context from files/chunks marked with "[Type: Personal Log]" contains personal reflections, activities, or logs. Use this for analysis of personal state, mood, energy, and progress.
* Assume ANY bullet point item (lines starting with '-', '*', '+') OR any line containing one or more hash tags (#tag) represents a potential user goal, task, objective, idea, or key point. **Pay special attention to categorizing these:**
    * **Critical Goals/Tasks:** Identify these if the line contains tags like #critical, #critical🆘 or keywords like "критично", "critical", "терміново", "urgent". **Prioritize discussing these items, potential blockers, and progress.**
    * **Weekly Goals/Tasks:** Identify these if the line contains tags like #week, #weekly or keywords like "weekly", "тижнева", "тижневий". Consider their relevance for the current or upcoming week's planning.
    * Use the surrounding text and the source document name for context for all identified items.
* If the user asks about "available data", "all my notes", "summarize my RAG data", or similar general terms, base your answer on the ENTIRE provided context (both Personal Focus and General Context sections). Analyze themes across different chunks and documents.
--- End RAG Data Interpretation Rules ---
        `.trim();

    let systemPromptParts: string[] = [];

    // 1. Додаємо RAG інструкції
    if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) {
      this.plugin.logger.debug("[PromptService] RAG is enabled, adding RAG instructions.");
      systemPromptParts.push(ragInstructions);
    }

    // 2. Додаємо системний промпт ролі
    if (roleSystemPrompt) {
      this.plugin.logger.debug("[PromptService] Role system prompt exists, adding it.");
      systemPromptParts.push(roleSystemPrompt.trim());
    }

    // 3. Збираємо базовий системний промпт
    let combinedBasePrompt = systemPromptParts.join("\n\n").trim();

    // 4. Додаємо інструкції для інструментів, ЯКЩО enableToolUse увімкнено
    if (settings.enableToolUse && this.plugin.agentManager) {
      const agentTools = this.plugin.agentManager.getAllToolDefinitions();
      let toolUsageInstructions = "";

      if (agentTools.length > 0) {
        toolUsageInstructions = "\n\n--- Tool Usage Guidelines ---\n";
        toolUsageInstructions += "You have access to the following tools. ";
        // Важливо: ця інструкція для fallback-механізму (текстовий виклик)
        toolUsageInstructions += "If you decide to use a tool, you MUST respond ONLY with a single JSON object representing the tool call, enclosed in <tool_call></tool_call> XML-like tags. Do NOT add any other text, explanation, or markdown formatting before or after these tags.\n";
        toolUsageInstructions += "The JSON object must have a 'name' property with the tool's name and an 'arguments' property containing an object of parameters for that tool.\n";
        toolUsageInstructions += "Example of a tool call response:\n";
        toolUsageInstructions += "<tool_call>\n";
        toolUsageInstructions += "{\n";
        toolUsageInstructions += "  \"name\": \"example_tool_name\",\n";
        toolUsageInstructions += "  \"arguments\": {\n";
        toolUsageInstructions += "    \"parameter_1_name\": \"value_for_param1\",\n";
        toolUsageInstructions += "    \"parameter_2_name\": true\n";
        toolUsageInstructions += "  }\n";
        toolUsageInstructions += "}\n";
        toolUsageInstructions += "</tool_call>\n\n";
        toolUsageInstructions += "Available tools are:\n";
        agentTools.forEach(tool => {
          toolUsageInstructions += `\nTool Name: "${tool.name}"\n`;
          toolUsageInstructions += `  Description: ${tool.description}\n`;
          toolUsageInstructions += `  Parameters Schema (JSON Schema format):\n  ${JSON.stringify(tool.parameters, null, 2).replace(/\n/g, '\n  ')}\n`;
        });
        toolUsageInstructions += "--- End Tool Usage Guidelines ---";
      } else {
        toolUsageInstructions = "\n\n--- Tool Usage Guidelines ---\nNo tools are currently available.\n--- End Tool Usage Guidelines ---";
      }

      if (combinedBasePrompt.length === 0) {
        // Якщо не було RAG/Ролі, починаємо з дефолтного + інструменти
        combinedBasePrompt = "You are a helpful AI assistant." + toolUsageInstructions;
        this.plugin.logger.debug("[PromptService] No RAG/Role prompt, using default assistant prompt + tool instructions.");
      } else {
        // Додаємо інструкції до існуючого промпту
        combinedBasePrompt += toolUsageInstructions;
        this.plugin.logger.debug("[PromptService] Appended tool instructions to existing RAG/Role prompt.");
      }
    } else if (combinedBasePrompt.length === 0) {
        // Немає RAG/Ролі І інструменти вимкнені - можна повернути дуже простий дефолт або null
        // combinedBasePrompt = "You are a helpful assistant.";
        // this.plugin.logger.debug("[PromptService] No RAG/Role prompt and tools disabled. Using minimal/null system prompt.");
        // Повернення null тут призведе до system_prompt_length: 0, що ми намагалися виправити.
        // Якщо інструменти не використовуються, але потрібен системний промпт, можна встановити:
        // if (!combinedBasePrompt) combinedBasePrompt = "You are a helpful assistant.";
    }


    // 5. Динамічна дата/час
    if (isProductivityActive && combinedBasePrompt && settings.enableProductivityFeatures) {
      this.plugin.logger.debug("[PromptService] Productivity features active, injecting date/time.");
      const now = new Date();
      const formattedDate = now.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const formattedTime = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      combinedBasePrompt = combinedBasePrompt.replace(/\[Current Time\]/gi, formattedTime);
      combinedBasePrompt = combinedBasePrompt.replace(/\[Current Date\]/gi, formattedDate);
    }
    
    const finalTrimmedPrompt = combinedBasePrompt.trim();
    this.plugin.logger.debug(`[PromptService] Final system prompt length: ${finalTrimmedPrompt.length}. Content preview: "${finalTrimmedPrompt.substring(0,100)}..."`);
    
    return finalTrimmedPrompt.length > 0 ? finalTrimmedPrompt : null;
  }

  // ... (решта вашого класу PromptService) ...

  /**
   * Готує ТІЛО основного промпту (без системного), включаючи історію, контекст завдань та RAG.
   * Використовує оновлений `prepareContext` з `RagService`.
   */
  async preparePromptBody(history: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
    // ... (Логіка отримання isProductivityActive та обробки taskContext без змін) ...

    const settings = this.plugin.settings;
    const selectedRolePath =
      chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
        ? chatMetadata.selectedRolePath
        : settings.selectedRolePath;
    const isProductivityActive = await this._isProductivityPersonaActive(selectedRolePath);

    // --- Контекст завдань ---
    let taskContext = "";
    if (isProductivityActive && settings.enableProductivityFeatures && this.plugin.chatManager) {
      // Отримуємо стан завдань
      await this.plugin.checkAndProcessTaskUpdate?.();
      const taskState = this.plugin.chatManager.getCurrentTaskState();

      if (taskState && taskState.hasContent) {
        taskContext = "\n--- Today's Tasks Context ---\n";
        taskContext += `Urgent: ${taskState.urgent.join(", ") || "None"}\n`;
        taskContext += `Other: ${taskState.regular.join(", ") || "None"}\n`;
        taskContext += "--- End Tasks Context ---";
        this.plugin.logger.debug(
          `[PromptService] Injecting task context (Urgent: ${taskState.urgent.length}, Regular: ${taskState.regular.length})`
        );
      } else {
      }
    }

    // --- Розрахунок токенів та історії (без змін) ---
    const approxTaskTokens = this._countTokens(taskContext);
    // Запас для RAG може потребувати коригування, якщо контекст став значно довшим
    const maxRagTokens = settings.ragEnabled ? ((settings.ragTopK * settings.ragChunkSize) / 4) * 1.8 : 0; // Збільшив запас
    const maxHistoryTokens = settings.contextWindow - approxTaskTokens - maxRagTokens - 250; // Збільшив резерв

    let processedHistoryString = "";
    if (isProductivityActive && settings.useAdvancedContextStrategy) {
      processedHistoryString = await this._buildAdvancedContext(history, chatMetadata, maxHistoryTokens);
    } else {
      processedHistoryString = this._buildSimpleContext(history, maxHistoryTokens);
    }

    // --- RAG Контекст (використовує оновлений prepareContext) ---
    let ragContext = "";
    if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) {
      const lastUserMessage = history.findLast(m => m.role === "user");
      if (lastUserMessage?.content) {
        // prepareContext тепер повертає рядок з розділеними секціями
        ragContext = await this.plugin.ragService.prepareContext(lastUserMessage.content);
        if (!ragContext) {
        } else {
        }
      } else {
      }
    } else {
    }

    // --- Формування фінального тіла промпту (без змін) ---
    let finalPromptBodyParts: string[] = [];
    if (ragContext) {
      finalPromptBodyParts.push(ragContext);
    } // Додаємо новий формат RAG
    if (taskContext) {
      finalPromptBodyParts.push(taskContext);
    }
    if (processedHistoryString) {
      finalPromptBodyParts.push(`### Conversation History:\n${processedHistoryString}`);
    }

    const finalPromptBody = finalPromptBodyParts.join("\n\n").trim();

    if (!finalPromptBody) {
      return null;
    }

    return finalPromptBody;
  }

  // Методи _buildSimpleContext, _buildAdvancedContext, _summarizeMessages
  // залишаються без структурних змін (тільки логування)
  private _buildSimpleContext(history: Message[], maxTokens: number): string {
    // ... (без змін, окрім логування) ...
    let context = "";
    let currentTokens = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const message = history[i];
      // Пропускаємо системні/помилкові повідомлення з простої історії
      if (message.role === "system" || message.role === "error") continue;

      const formattedMessage = `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`;
      const messageTokens = this._countTokens(formattedMessage) + 5; // +5 за форматування/роздільники
      if (currentTokens + messageTokens <= maxTokens) {
        context = formattedMessage + "\n\n" + context; // Додаємо на початок
        currentTokens += messageTokens;
      } else {
        break; // Досягли ліміту
      }
    }
    return context.trim();
  }

  private async _buildAdvancedContext(
    history: Message[],
    chatMetadata: ChatMetadata,
    maxTokens: number
  ): Promise<string> {
    const settings = this.plugin.settings;
    const processedParts: string[] = [];
    let currentTokens = 0;

    // Визначаємо, скільки останніх повідомлень залишити без змін
    const keepN = Math.max(0, settings.keepLastNMessagesBeforeSummary || 3); // Гарантуємо невід'ємне значення
    const actualKeepN = Math.min(history.length, keepN); // Не можемо залишити більше, ніж є
    const messagesToKeep = history.slice(-actualKeepN);
    const messagesToProcess = history.slice(0, -actualKeepN);

    // 1. Обробка старих повідомлень (сумаризація або пряме включення)
    if (messagesToProcess.length > 0) {
      let olderContextTokens = 0;
      let olderContextContent = "";

      if (settings.enableSummarization) {
        const summary = await this._summarizeMessages(messagesToProcess, chatMetadata);
        if (summary) {
          olderContextContent = `[Summary of earlier conversation]:\n${summary}`;
          olderContextTokens = this._countTokens(olderContextContent) + 10; // +10 за заголовок
        } else {
          // Якщо сумаризація не вдалася, спробуємо включити їх напряму (див. else блок)
        }
      }

      // Якщо сумаризація вимкнена АБО не вдалася
      if (!olderContextContent) {
        let includedOlderCount = 0;
        for (let i = messagesToProcess.length - 1; i >= 0; i--) {
          const message = messagesToProcess[i];
          if (message.role === "system" || message.role === "error") continue;
          const formattedMessage = `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`;
          const messageTokens = this._countTokens(formattedMessage) + 5;
          // Перевіряємо загальний ліміт maxTokens
          if (currentTokens + olderContextTokens + messageTokens <= maxTokens) {
            olderContextContent = formattedMessage + "\n\n" + olderContextContent;
            olderContextTokens += messageTokens;
            includedOlderCount++;
          } else {
            break;
          }
        }
        if (includedOlderCount > 0) {
          olderContextContent = `[Start of older messages directly included]:\n${olderContextContent.trim()}\n[End of older messages]`;
          olderContextTokens += 10; // Додаємо за маркери
        }
      }

      // Додаємо оброблену стару частину, якщо вона є і вміщається
      if (olderContextContent && currentTokens + olderContextTokens <= maxTokens) {
        processedParts.push(olderContextContent);
        currentTokens += olderContextTokens;
      } else if (olderContextContent) {
      }
    }

    // 2. Обробка останніх N повідомлень
    let keptMessagesString = "";
    let keptMessagesTokens = 0;
    let includedKeptCount = 0;
    for (let i = messagesToKeep.length - 1; i >= 0; i--) {
      const message = messagesToKeep[i];
      if (message.role === "system" || message.role === "error") continue;
      const formattedMessage = `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`;
      const messageTokens = this._countTokens(formattedMessage) + 5;
      // Перевіряємо ліміт з урахуванням вже доданих частин
      if (currentTokens + keptMessagesTokens + messageTokens <= maxTokens) {
        keptMessagesString = formattedMessage + "\n\n" + keptMessagesString;
        keptMessagesTokens += messageTokens;
        includedKeptCount++;
      } else {
        break; // Досягли ліміту
      }
    }

    // Додаємо останні повідомлення, якщо вони є
    if (keptMessagesString) {
      processedParts.push(keptMessagesString.trim());
      currentTokens += keptMessagesTokens;
    } else {
    }

    return processedParts.join("\n\n").trim(); // Об'єднуємо частини (сумарі/старі + нові)
  }

  private async _summarizeMessages(messagesToSummarize: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
    // ... (без змін, окрім логування) ...
    if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) {
      return null;
    }
    // Використовуємо логер
    const textToSummarize = messagesToSummarize
      .filter(m => m.role === "user" || m.role === "assistant") // Беремо тільки user/assistant
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`)
      .join("\n");

    if (!textToSummarize.trim()) {
      // Використовуємо логер
      return null;
    }

    const summarizationPromptTemplate =
      this.plugin.settings.summarizationPrompt ||
      "Summarize the following conversation concisely:\n\n{text_to_summarize}";
    const summarizationFullPrompt = summarizationPromptTemplate.replace("{text_to_summarize}", textToSummarize);

    // Використовуємо модель з налаштувань сумаризації, ЯКЩО вона вказана, інакше - модель чату
    const summarizationModelName =
      this.plugin.settings.summarizationModelName || chatMetadata.modelName || this.plugin.settings.modelName;

    const summarizationContextWindow = Math.min(this.plugin.settings.contextWindow || 4096, 4096); // Можливо, варто мати окреме налаштування?

    const requestBody = {
      model: summarizationModelName, // Використовуємо визначену модель
      prompt: summarizationFullPrompt,
      stream: false,
      temperature: 0.3, // Низька температура для консистентної сумаризації
      options: {
        num_ctx: summarizationContextWindow,
        // Можна додати stop token, якщо потрібно, наприклад ["User:", "Assistant:"]
      },
      // Системний промпт для сумаризатора
      system:
        "You are a helpful assistant specializing in concisely summarizing conversation history. Focus on extracting key points, decisions, and unresolved questions.",
    };

    try {
      if (!this.plugin.ollamaService) {
        return null;
      }

      const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);

      if (responseData && typeof responseData.response === "string") {
        const summary = responseData.response.trim();
        return summary;
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  }
} // End of PromptService class
