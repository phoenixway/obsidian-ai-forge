// src/PromptService.ts
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
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  clearRoleCache(): void {
    this.roleCache = {};
    this.currentRolePath = null;
    this.currentSystemPrompt = null;
  }

  clearModelDetailsCache(): void {
    this.modelDetailsCache = {};
  }

  async getRoleDefinition(rolePath: string | null | undefined): Promise<RoleDefinition | null> {
    const normalizedPath = rolePath ? normalizePath(rolePath) : null;

    if (normalizedPath === this.currentRolePath && normalizedPath && this.roleCache[normalizedPath]) {
      return this.roleCache[normalizedPath];
    }

    if (normalizedPath !== this.currentRolePath) {
      if (this.currentRolePath && this.roleCache[this.currentRolePath]) {
        // Не видаляємо з кешу, щоб уникнути повторного читання файлу, якщо роль знову стане активною
        // Якщо потрібно строго економити пам'ять, можна розкоментувати:
        // delete this.roleCache[this.currentRolePath];
      }
      this.currentRolePath = normalizedPath;
      this.currentSystemPrompt = null; // Скидаємо кешований системний промпт, бо роль змінилася
    }

    if (!normalizedPath || !this.plugin.settings.followRole) {
      const definition: RoleDefinition = {
        systemPrompt: null,
        isProductivityPersona: false,
        // Якщо додали нові поля, тут теж треба вказати їх значення за замовчуванням
        // ragInstructionOverride: null,
        // ragBehaviorMode: "base",
      };
      return definition;
    }

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
          // Тут можна буде зчитувати rag_instruction_override та rag_behavior_mode з frontmatter
        };

        this.roleCache[normalizedPath] = definition;
        this.currentSystemPrompt = definition.systemPrompt;
        return definition;
      } catch (error) {
        this.plugin.logger.error(`Error loading role: ${file.basename}. Check console.`, error);
        new Notice(`Error loading role: ${file.basename}. Check console.`);
        this.currentSystemPrompt = null;
        return { systemPrompt: null, isProductivityPersona: false };
      }
    } else {
      this.currentSystemPrompt = null;
      return { systemPrompt: null, isProductivityPersona: false };
    }
  }

  private async _isProductivityPersonaActive(rolePath: string | null | undefined): Promise<boolean> {
    if (!this.plugin.settings.enableProductivityFeatures) {
      return false;
    }
    const roleDefinition = await this.getRoleDefinition(rolePath);
    return roleDefinition?.isProductivityPersona ?? false;
  }

  async getSystemPromptForAPI(chatMetadata: ChatMetadata): Promise<string | null> {
    const settings = this.plugin.settings;

    const selectedRolePath =
      chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
        ? chatMetadata.selectedRolePath
        : settings.selectedRolePath;

    let roleDefinition: RoleDefinition | null = null;
    if (selectedRolePath && settings.followRole) {
      roleDefinition = await this.getRoleDefinition(selectedRolePath);
    }

    const roleSystemPrompt = roleDefinition?.systemPrompt || null;
    const isProductivityRoleActive = roleDefinition?.isProductivityPersona ?? false;

    // --- БАЗОВІ RAG ІНСТРУКЦІЇ ---
    const baseRagInstructions = `
--- RAG Data Interpretation Rules (Base) ---
You may be provided context from the user's notes. This context is split into chunks, each from a specific file.
*   '### Personal Focus Context (User's Life State & Goals)': This section contains information the user has marked as high-priority for understanding their current situation, desired state, and goals. Use this information to better understand the user's overall direction and motivations when answering questions or providing suggestions.
*   '### General Context from User Notes': This section contains general background information from user notes, semantically similar to the current query. Use this for supplementary details and broader context.
*   Your primary goal is to directly and accurately answer the user's current question based on the provided context.
*   After providing a direct answer, you may briefly (1-2 sentences) and if relevant, connect the information to the user's broader goals from the 'Personal Focus Context', but only if this adds clear value and doesn't overshadow the direct answer.
*   Pay attention to the source file mentioned in each chunk's header.
*   Context from files/chunks marked with "[Type: Personal Log]" contains personal reflections, activities, or logs. Use this for analysis of personal state, mood, energy, and progress, especially if the question relates to these aspects.
*   Bullet points (lines starting with '-', '*', '+') or lines with hash tags (#tag) can represent user goals, tasks, ideas, or key points.
*   If the user asks about "available data", "all my notes", "summarize my RAG data", or similar general terms, base your answer on the ENTIRE provided context. Analyze themes across different chunks and documents.
--- End RAG Data Interpretation Rules (Base) ---
    `.trim();

    // --- РОЗШИРЕНІ RAG ІНСТРУКЦІЇ (для продуктивності/цілей) ---
    const productivityRagInstructions = `
--- RAG Data Interpretation Rules (Productivity Focus Augmentation) ---
When 'Personal Focus Context' is provided and you are in a productivity-focused role:
*   TREAT THIS SECTION AS THE PRIMARY SOURCE for understanding the user's core objectives and current life context.
*   Actively use this context to help the user:
    *   Align your suggestions with their stated goals.
    *   Track progress on their priorities.
    *   Provide strategic guidance towards achieving their objectives.
    *   Identify potential blockers or areas needing attention related to these goals.
When analyzing any RAG context (Personal Focus or General) in a productivity-focused role:
*   **Critical Goals/Tasks:** (Identified by tags like #critical, #critical🆘 or keywords like "критично", "critical", "терміново", "urgent"). **Prioritize discussing these items, potential blockers, and progress.**
*   **Weekly Goals/Tasks:** (Identified by tags like #week, #weekly or keywords like "weekly", "тижнева", "тижневий"). Consider their relevance for current/upcoming week's planning.
--- End RAG Data Interpretation Rules (Productivity Focus Augmentation) ---
    `.trim();

    let systemPromptParts: string[] = [];

    if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) {
      systemPromptParts.push(baseRagInstructions); // Завжди додаємо базові
      if (isProductivityRoleActive && settings.enableProductivityFeatures) {
        systemPromptParts.push(productivityRagInstructions);
        this.plugin.logger.debug("[PromptService] Added PRODUCTIVITY RAG instructions.");
      } else {
        this.plugin.logger.debug("[PromptService] Added BASE RAG instructions only.");
      }
    }

    if (roleSystemPrompt) {
      // TODO: Тут в майбутньому можна додати логіку, якщо сама роль
      // через frontmatter (наприклад, rag_instruction_override або rag_behavior_mode)
      // захоче повністю замінити або модифікувати RAG інструкції.
      // Наприклад, якщо `roleDefinition.ragInstructionOverride` існує, використати його замість
      // `baseRagInstructions` та `productivityRagInstructions`.
      // Або якщо `roleDefinition.ragBehaviorMode === 'custom'` і є `roleDefinition.customRagPrompt`.
      // Поки що, просто додаємо системний промпт ролі як є.
      systemPromptParts.push(roleSystemPrompt.trim());
    }

    let combinedBasePrompt = systemPromptParts.join("\n\n").trim();

    if (settings.enableToolUse && this.plugin.agentManager) {
      const agentTools = this.plugin.agentManager.getAllToolDefinitions();
      let toolUsageInstructions = "";

      if (agentTools.length > 0) {
        toolUsageInstructions = "\n\n--- Tool Usage Guidelines ---\n";
        toolUsageInstructions += "You have access to the following tools. ";
        toolUsageInstructions += "To use a tool, you MUST respond ONLY with a single JSON object representing the tool call, enclosed in <tool_call></tool_call> XML-like tags. Do NOT add any other text, explanation, or markdown formatting before or after these tags.\n";
        toolUsageInstructions += "The JSON object must have a 'name' property with the tool's name and an 'arguments' property containing an object of parameters for that tool.\n";
        toolUsageInstructions += "Example of a tool call response:\n";
        toolUsageInstructions += "<tool_call>\n";
        toolUsageInstructions += "{\n";
        toolUsageInstructions += '  "name": "example_tool_name",\n';
        toolUsageInstructions += '  "arguments": {\n';
        toolUsageInstructions += '    "parameter_1_name": "value_for_param1",\n';
        toolUsageInstructions += '    "parameter_2_name": true\n';
        toolUsageInstructions += "  }\n";
        toolUsageInstructions += "}\n";
        toolUsageInstructions += "</tool_call>\n\n";
        
        toolUsageInstructions += "After you make a tool call, the system will execute the tool and provide you with the result in a message with role 'tool'. This result will be clearly marked. For example:\n";
        toolUsageInstructions += "<message role=\"tool\" tool_call_id=\"[some_id]\" name=\"[tool_name]\">\n";
        toolUsageInstructions += "[TOOL_RESULT]\n";
        toolUsageInstructions += "[The actual result from the tool will be here]\n";
        toolUsageInstructions += "[/TOOL_RESULT]\n";
        toolUsageInstructions += "</message>\n";
        toolUsageInstructions += "If there was an error during tool execution or argument parsing, the result will be marked like this:\n";
        toolUsageInstructions += "<message role=\"tool\" tool_call_id=\"[some_id]\" name=\"[tool_name]\">\n";
        toolUsageInstructions += "[TOOL_ERROR]\n";
        toolUsageInstructions += "[Details of the error will be here]\n";
        toolUsageInstructions += "[/TOOL_ERROR]\n";
        toolUsageInstructions += "</message>\n";
        toolUsageInstructions += "You MUST analyze the content within [TOOL_RESULT]...[/TOOL_RESULT] (or [TOOL_ERROR]...[/TOOL_ERROR]) and use it to formulate your response to the user. Do not re-call the same tool with the exact same arguments if you have already received a result for it, unless the result was an error and you are correcting the arguments. If the tool result provides the necessary information, generate a final answer for the user. If you need more information or need to process the data further, you may call another tool or the same tool with different arguments.\n\n";
        
        toolUsageInstructions += "Available tools are:\n";
        agentTools.forEach(tool => {
          toolUsageInstructions += `\nTool Name: "${tool.name}"\n`;
          toolUsageInstructions += `  Description: ${tool.description}\n`;
          toolUsageInstructions += `  Parameters Schema (JSON Schema format):\n  ${JSON.stringify(
            tool.parameters,
            null,
            2
          ).replace(/\n/g, "\n  ")}\n`;
        });
        toolUsageInstructions += "--- End Tool Usage Guidelines ---";
      } else {
        toolUsageInstructions =
          "\n\n--- Tool Usage Guidelines ---\nNo tools are currently available.\n--- End Tool Usage Guidelines ---";
      }

      if (combinedBasePrompt.length === 0 && toolUsageInstructions.length > 0) { // Додаємо дефолтний, тільки якщо є інструкції для інструментів
        combinedBasePrompt = "You are a helpful AI assistant." + toolUsageInstructions;
      } else if (toolUsageInstructions.length > 0) {
        combinedBasePrompt += toolUsageInstructions;
      }
    } else if (combinedBasePrompt.length === 0) {
      // Fallback if no role, no RAG, and no tools enabled
      // combinedBasePrompt = "You are a helpful AI assistant."; // Можна залишити порожнім, якщо не хочемо дефолтного
    }

    if (isProductivityRoleActive && combinedBasePrompt && settings.enableProductivityFeatures) {
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
    return finalTrimmedPrompt.length > 0 ? finalTrimmedPrompt : null;
  }

    async preparePromptBody(history: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
    const settings = this.plugin.settings;
    const selectedRolePath =
      chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
        ? chatMetadata.selectedRolePath
        : settings.selectedRolePath;
    
    const isProductivityActiveForHistory = await this._isProductivityPersonaActive(selectedRolePath);

    let taskContext = "";
    // ... (логіка taskContext залишається) ...
    if (isProductivityActiveForHistory && settings.enableProductivityFeatures && this.plugin.chatManager) {
      await this.plugin.checkAndProcessTaskUpdate?.(); 
      const taskState = this.plugin.chatManager.getCurrentTaskState();

      if (taskState && taskState.hasContent) {
        taskContext = "\n--- Today's Tasks Context ---\n";
        taskContext += `Urgent: ${taskState.urgent.join(", ") || "None"}\n`;
        taskContext += `Other: ${taskState.regular.join(", ") || "None"}\n`;
        taskContext += "--- End Tasks Context ---";
      }
    }


    // --- NEW: Формування контексту з прикріплених документів ОСТАННЬОГО повідомлення користувача ---
    let attachedDocumentsContext = "";
    const lastUserMessageWithAttachments = history.findLast(
      m => m.role === "user" && m.attachedDocuments && m.attachedDocuments.length > 0
    );

    if (lastUserMessageWithAttachments && lastUserMessageWithAttachments.attachedDocuments) {
      attachedDocumentsContext += "\n\n--- User Provided Documents Context ---\n";
      for (const doc of lastUserMessageWithAttachments.attachedDocuments) {
        attachedDocumentsContext += `Document: ${doc.name} (Type: ${doc.type}, Size: ${(doc.size / 1024).toFixed(1)} KB)\n`;
        if (doc.content && (doc.previewType === 'text' || doc.previewType === 'markdown')) {
          // Обмежимо довжину вмісту, що передається в промпт
          const maxContentLengthForLlm = settings.maxDocumentContentLengthForLlm || 4000; // Наприклад, 4000 символів
          let contentForLlm = doc.content;
          if (doc.content.length > maxContentLengthForLlm) {
            contentForLlm = doc.content.substring(0, maxContentLengthForLlm) + "\n... (document content truncated for LLM prompt) ...";
          }
          const langHint = doc.type.split('.').pop() || 'text'; // Використовуємо розширення як підказку мови для Markdown блоку
          attachedDocumentsContext += `\n\`\`\`${langHint}\n${contentForLlm}\n\`\`\`\n\n`;
        } else if (doc.previewType === 'generic_file') {
          attachedDocumentsContext += "(Content of this file type is not directly included in the prompt. You can ask the user for details if needed.)\n\n";
        }
      }
      attachedDocumentsContext += "--- End User Provided Documents Context ---\n";
    }
    // --- END NEW ---


    const approxTaskTokens = this._countTokens(taskContext);
    const approxDocsTokens = this._countTokens(attachedDocumentsContext); // <--- Враховуємо токени документів
    const maxRagTokens = settings.ragEnabled ? ((settings.ragTopK * settings.ragChunkSize) / 4) * 1.8 : 0; 
    const maxHistoryTokens = settings.contextWindow - approxTaskTokens - approxDocsTokens - maxRagTokens - (settings.systemPromptBaseTokenBuffer || 250);


    let processedHistoryString = "";
    // Передаємо історію БЕЗ останнього повідомлення користувача, якщо воно містило документи,
    // оскільки ми вже сформували context_for_llm_from_attachments з нього.
    // Або передаємо всю історію, і _buildSimpleContext/_buildAdvancedContext оброблять message.content як є.
    // Наразі, історія передається як є, а message.content містить лише текст користувача + посилання.
    if (isProductivityActiveForHistory && settings.useAdvancedContextStrategy) {
      processedHistoryString = await this._buildAdvancedContext(history, chatMetadata, maxHistoryTokens);
    } else {
      processedHistoryString = this._buildSimpleContext(history, maxHistoryTokens);
    }

    let ragContext = "";
    // ... (логіка RAG залишається) ...
    if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) {
      const lastUserMessage = history.findLast(m => m.role === "user");
      // Для RAG використовуємо оригінальний текст користувача з `lastUserMessage.content`,
      // а не `finalUserInputText` з `sendMessage`, бо `finalUserInputText` міг бути змінений.
      if (lastUserMessage?.content) { 
        ragContext = await this.plugin.ragService.prepareContext(lastUserMessage.content);
      }
    }


    let finalPromptBodyParts: string[] = [];
    // Порядок: RAG, потім Задачі, потім Історія, потім Вкладені Документи (з останнього повідомлення).
    // Або: RAG, Задачі, Вкладені Документи, Історія.
    // Я б розмістив вкладені документи БЛИЖЧЕ до останнього запиту користувача, тобто ПІСЛЯ історії.
    if (ragContext) {
      finalPromptBodyParts.push(ragContext);
    }
    if (taskContext) {
      finalPromptBodyParts.push(taskContext);
    }
    if (processedHistoryString) {
      finalPromptBodyParts.push(`### Conversation History:\n${processedHistoryString}`);
    }
    // ДОДАЄМО КОНТЕКСТ ДОКУМЕНТІВ В КІНЦІ, ПЕРЕД ОСТАННІМ ЗАПИТОМ КОРИСТУВАЧА (який вже є в `processedHistoryString`)
    // АБО, якщо ми хочемо, щоб він був "над" останнім запитом, то перед ним.
    // Оскільки `processedHistoryString` вже містить останній запит користувача,
    // `attachedDocumentsContext` (який стосується цього останнього запиту) має йти ПЕРЕД ним або бути частиною його.
    // Краще, якщо `_buildSimpleContext` та `_buildAdvancedContext` самі оброблятимуть `message.attachedDocuments`
    // для останнього повідомлення користувача. Але для швидкого рішення, додамо його тут окремо.
    // Поточна логіка `_buildSimpleContext` і `_buildAdvancedContext` НЕ обробляє `message.attachedDocuments`.
    // Тому, `attachedDocumentsContext` потрібно додати.
    // Якщо `processedHistoryString` вже містить останнє повідомлення користувача, то `attachedDocumentsContext`
    // має бути частиною цього останнього повідомлення або йти відразу після нього, як додатковий контекст до цього запиту.

    // Переглянутий порядок: RAG, Задачі, Історія (включаючи останній запит користувача), Документи (що стосуються останнього запиту)
    if (attachedDocumentsContext) {
      finalPromptBodyParts.push(attachedDocumentsContext);
    }


    const finalPromptBody = finalPromptBodyParts.join("\n\n").trim();

    if (!finalPromptBody && !(lastUserMessageWithAttachments && lastUserMessageWithAttachments.images && lastUserMessageWithAttachments.images.length > 0)) {
        this.plugin.logger.debug("[PromptService] preparePromptBody resulted in an empty body and no images.");
        return null;
    }
    
    // this.plugin.logger.debug(`[PromptService] Final prompt body for LLM prepared (first 500 chars):\n${finalPromptBody.substring(0, 500)}...`);
    return finalPromptBody;
  }

  private _buildSimpleContext(history: Message[], maxTokens: number): string {
    let context = "";
    let currentTokens = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const message = history[i];

      if (message.role === "system" || message.role === "error") continue;

      let formattedMessage = "";
      if (message.role === "user") {
        formattedMessage = `User: ${message.content.trim()}`;
      } else if (message.role === "assistant") {
        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCallsString = JSON.stringify(message.tool_calls);
            let contentPart = "";
            if (message.content && message.content.trim() !== "") {
                 contentPart = `${message.content.trim()}\n`;
            }
            formattedMessage = `Assistant: ${contentPart}<tool_calls>\n${toolCallsString}\n</tool_calls>`;
        } else {
            formattedMessage = `Assistant: ${message.content.trim()}`;
        }
      } else if (message.role === "tool") {
        formattedMessage = `<message role="tool" tool_call_id="${message.tool_call_id}" name="${message.name}">\n${message.content.trim()}\n</message>`;
      }
      
      const messageTokens = this._countTokens(formattedMessage) + 5; 
      if (currentTokens + messageTokens <= maxTokens) {
        context = formattedMessage + "\n\n" + context;
        currentTokens += messageTokens;
      } else {
        this.plugin.logger.debug(`[PromptService] Max tokens for simple history reached. Added ${currentTokens} tokens. Stopped before message ${i}.`);
        break;
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

    const keepN = Math.max(0, settings.keepLastNMessagesBeforeSummary || 3);
    const actualKeepN = Math.min(history.length, keepN);
    
    // Важливо: messagesToKeep мають бути останніми N повідомленнями
    const messagesToKeep = history.slice(-actualKeepN); 
    // messagesToProcess - це все, що було ДО цих останніх N
    const messagesToProcess = history.slice(0, history.length - actualKeepN);


    if (messagesToProcess.length > 0) {
      let olderContextTokens = 0;
      let olderContextContent = "";

      if (settings.enableSummarization) {
        const summary = await this._summarizeMessages(messagesToProcess, chatMetadata);
        if (summary) {
          olderContextContent = `[Summary of earlier conversation]:\n${summary}`;
          olderContextTokens = this._countTokens(olderContextContent) + 10;
        }
      }

      if (!olderContextContent) { // Якщо сумаризація вимкнена або не дала результату
        let includedOlderCount = 0;
        let tempOlderContent = "";
        for (let i = messagesToProcess.length - 1; i >= 0; i--) {
          const message = messagesToProcess[i];
          if (message.role === "system" || message.role === "error") continue;
          
          let formattedMessage = "";
          if (message.role === "user") {
              formattedMessage = `User: ${message.content.trim()}`;
          } else if (message.role === "assistant") {
              if (message.tool_calls && message.tool_calls.length > 0) {
                  const toolCallsString = JSON.stringify(message.tool_calls);
                  let contentPart = message.content && message.content.trim() !== "" ? `${message.content.trim()}\n` : "";
                  formattedMessage = `Assistant: ${contentPart}<tool_calls>\n${toolCallsString}\n</tool_calls>`;
              } else {
                  formattedMessage = `Assistant: ${message.content.trim()}`;
              }
          } else if (message.role === "tool") {
              formattedMessage = `<message role="tool" tool_call_id="${message.tool_call_id}" name="${message.name}">\n${message.content.trim()}\n</message>`;
          }

          const messageTokens = this._countTokens(formattedMessage) + 5;

          // Перевіряємо, чи вміщається цей "старий" шматок разом з тим, що вже є, 
          // і залишаємо місце для messagesToKeep
          if (currentTokens + olderContextTokens + messageTokens <= maxTokens) {
            tempOlderContent = formattedMessage + "\n\n" + tempOlderContent;
            olderContextTokens += messageTokens;
            includedOlderCount++;
          } else {
            this.plugin.logger.debug(`[PromptService] Max tokens for older part of advanced history reached. Added ${olderContextTokens} tokens from ${includedOlderCount} older messages. Stopped before message ${i} of older part.`);
            break;
          }
        }
        if (includedOlderCount > 0) {
          olderContextContent = `[Start of older messages directly included]:\n${tempOlderContent.trim()}\n[End of older messages]`;
          // olderContextTokens вже розраховані, але якщо додали обгортку, можемо додати ще кілька токенів
          olderContextTokens += this._countTokens(olderContextContent) - this._countTokens(tempOlderContent.trim()); 
        }
      }

      if (olderContextContent) { // Додаємо, тільки якщо вміст є
        // Перевіряємо знову, чи вміщається ВЕСЬ olderContextContent
        if (currentTokens + olderContextTokens <= maxTokens) {
            processedParts.push(olderContextContent);
            currentTokens += olderContextTokens;
        } else {
            this.plugin.logger.warn(`[PromptService] Summarized/older context too large (${olderContextTokens} tokens) to fit with remaining ${maxTokens - currentTokens} tokens. Skipping older context.`);
        }
      }
    }

    // Тепер додаємо останні N повідомлень (messagesToKeep)
    let keptMessagesString = "";
    let keptMessagesTokens = 0;
    for (let i = messagesToKeep.length - 1; i >= 0; i--) { // Ітеруємо з кінця messagesToKeep, щоб зібрати в правильному порядку
        const message = messagesToKeep[i];
        if (message.role === "system" || message.role === "error") continue;
        
        let formattedMessage = "";
        if (message.role === "user") {
            formattedMessage = `User: ${message.content.trim()}`;
        } else if (message.role === "assistant") {
            if (message.tool_calls && message.tool_calls.length > 0) {
                const toolCallsString = JSON.stringify(message.tool_calls);
                let contentPart = message.content && message.content.trim() !== "" ? `${message.content.trim()}\n` : "";
                formattedMessage = `Assistant: ${contentPart}<tool_calls>\n${toolCallsString}\n</tool_calls>`;
            } else {
                formattedMessage = `Assistant: ${message.content.trim()}`;
            }
        } else if (message.role === "tool") {
            formattedMessage = `<message role="tool" tool_call_id="${message.tool_call_id}" name="${message.name}">\n${message.content.trim()}\n</message>`;
        }

        const messageTokens = this._countTokens(formattedMessage) + 5;

        if (currentTokens + keptMessagesTokens + messageTokens <= maxTokens) { // Перевіряємо проти ЗАЛИШКОВИХ токенів
            keptMessagesString = formattedMessage + "\n\n" + keptMessagesString; // Збираємо з початку
            keptMessagesTokens += messageTokens;
        } else {
            this.plugin.logger.debug(`[PromptService] Max tokens for kept part of advanced history reached. Added ${keptMessagesTokens} tokens from kept messages. Stopped before message ${i} of kept part.`);
            break;
        }
    }


    if (keptMessagesString) {
      processedParts.push(keptMessagesString.trim());
      currentTokens += keptMessagesTokens; // Оновлюємо загальну кількість токенів
    }
    
    this.plugin.logger.debug(`[PromptService] Advanced context built with ${currentTokens} tokens. Max allowed: ${maxTokens}`);
    return processedParts.join("\n\n").trim();
  }

  private async _summarizeMessages(messagesToSummarize: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
    if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) {
      return null;
    }
    
    const textToSummarize = messagesToSummarize
      .filter(m => m.role === "user" || m.role === "assistant" || m.role === "tool")
      .map(m => {
        if (m.role === "user") {
            return `User: ${m.content.trim()}`;
        } else if (m.role === "assistant") {
            if (m.tool_calls && m.tool_calls.length > 0) {
                const toolCallsString = JSON.stringify(m.tool_calls);
                let contentPart = m.content && m.content.trim() !== "" ? `${m.content.trim()}\n` : "";
                return `Assistant: ${contentPart}<tool_calls>\n${toolCallsString}\n</tool_calls>`;
            }
            return `Assistant: ${m.content.trim()}`;
        } else if (m.role === "tool") {
            return `<message role="tool" tool_call_id="${m.tool_call_id}" name="${m.name}">\n${m.content.trim()}\n</message>`;
        }
        return ""; 
      })
      .filter(Boolean)
      .join("\n");

    if (!textToSummarize.trim()) {
      this.plugin.logger.debug("[PromptService] Nothing to summarize after formatting messages.");
      return null;
    }

    const summarizationPromptTemplate =
      this.plugin.settings.summarizationPrompt ||
      "Summarize the following conversation concisely, preserving key information and tool usage context:\n\n{text_to_summarize}";
    const summarizationFullPrompt = summarizationPromptTemplate.replace("{text_to_summarize}", textToSummarize);

    const summarizationModelName =
      this.plugin.settings.summarizationModelName || chatMetadata.modelName || this.plugin.settings.modelName;
    
    // Для сумаризації використовуємо окреме, менше вікно, щоб не перевищити ліміти моделі для сумаризації
    const summarizationContextWindow = Math.min(this.plugin.settings.summarizationContextWindow || 2048, 4096);


    const requestBody = {
      model: summarizationModelName,
      prompt: summarizationFullPrompt,
      stream: false,
      temperature: 0.3, // Нижча температура для більш фактичної сумаризації
      options: { num_ctx: summarizationContextWindow },
      system: // Більш конкретний системний промпт для сумаризатора
        "You are an AI assistant that specializes in creating concise and accurate summaries of conversation excerpts. Focus on key decisions, questions, outcomes of tool usage, and important facts. Preserve the chronological order of events if possible. Be brief and to the point.",
    };

    try {
      if (!this.plugin.ollamaService) {
        this.plugin.logger.error("[PromptService] OllamaService not available for summarization.");
        return null;
      }
      const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);
      if (responseData && typeof responseData.response === "string") {
        this.plugin.logger.debug(`[PromptService] Summarization successful. Summary length: ${responseData.response.trim().length}`);
        return responseData.response.trim();
      }
      this.plugin.logger.warn("[PromptService] Summarization did not return a valid response.", responseData);
      return null;
    } catch (error) {
      this.plugin.logger.error("[PromptService] Error during summarization:", error);
      return null;
    }
  }
}