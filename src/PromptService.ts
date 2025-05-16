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
        delete this.roleCache[this.currentRolePath];
      }
      this.currentRolePath = normalizedPath;
      this.currentSystemPrompt = null;
    }

    if (!normalizedPath || !this.plugin.settings.followRole) {
      const definition: RoleDefinition = {
        systemPrompt: null,
        isProductivityPersona: false,
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
        };

        this.roleCache[normalizedPath] = definition;
        this.currentSystemPrompt = definition.systemPrompt;
        return definition;
      } catch (error) {
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
* Context from files/chunks marked with "[Type: Personal Log]" contains personal reflections, activities, or logs. Use this for analysis of life situation of user, personal activities, achievements, progress, state, mood, energy.
* Assume ANY bullet point item (lines starting with '-', '*', '+') OR any line containing one or more hash tags (#tag) represents a potential user goal, task, objective, idea, or key point. **Pay special attention to categorizing these:**
    * **Critical Goals/Tasks:** Identify these if the line contains tags like #critical, #critical🆘 or keywords like "критично", "critical", "терміново", "urgent". **Prioritize discussing these items, potential blockers, and progress.**
    * **Weekly Goals/Tasks:** Identify these if the line contains tags like #week, #weekly or keywords like "weekly", "тижнева", "тижневий". Consider their relevance for the current or upcoming week's planning.
    * Use the surrounding text and the source document name for context for all identified items.
* If the user asks about "available data", "all my notes", "summarize my RAG data", or similar general terms, base your answer on the ENTIRE provided context (both Personal Focus and General Context sections). Analyze themes across different chunks and documents.
--- End RAG Data Interpretation Rules ---
        `.trim();

    let systemPromptParts: string[] = [];

    if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) {
      systemPromptParts.push(ragInstructions);
    }

    if (roleSystemPrompt) {
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

      if (combinedBasePrompt.length === 0) {
        combinedBasePrompt = "You are a helpful AI assistant." + toolUsageInstructions;
      } else {
        combinedBasePrompt += toolUsageInstructions;
      }
    } else if (combinedBasePrompt.length === 0) {
      // Fallback if no role, no RAG, and no tools enabled
      // combinedBasePrompt = "You are a helpful AI assistant."; // Можна залишити порожнім, якщо не хочемо дефолтного
    }

    if (isProductivityActive && combinedBasePrompt && settings.enableProductivityFeatures) {
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
    const isProductivityActive = await this._isProductivityPersonaActive(selectedRolePath);

    let taskContext = "";
    if (isProductivityActive && settings.enableProductivityFeatures && this.plugin.chatManager) {
      await this.plugin.checkAndProcessTaskUpdate?.();
      const taskState = this.plugin.chatManager.getCurrentTaskState();

      if (taskState && taskState.hasContent) {
        taskContext = "\n--- Today's Tasks Context ---\n";
        taskContext += `Urgent: ${taskState.urgent.join(", ") || "None"}\n`;
        taskContext += `Other: ${taskState.regular.join(", ") || "None"}\n`;
        taskContext += "--- End Tasks Context ---";
      }
    }

    const approxTaskTokens = this._countTokens(taskContext);
    const maxRagTokens = settings.ragEnabled ? ((settings.ragTopK * settings.ragChunkSize) / 4) * 1.8 : 0; 
    const maxHistoryTokens = settings.contextWindow - approxTaskTokens - maxRagTokens - 250;

    let processedHistoryString = "";
    if (isProductivityActive && settings.useAdvancedContextStrategy) {
      processedHistoryString = await this._buildAdvancedContext(history, chatMetadata, maxHistoryTokens);
    } else {
      processedHistoryString = this._buildSimpleContext(history, maxHistoryTokens);
    }

    let ragContext = "";
    if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) {
      const lastUserMessage = history.findLast(m => m.role === "user");
      if (lastUserMessage?.content) {
        ragContext = await this.plugin.ragService.prepareContext(lastUserMessage.content);
      }
    }

    let finalPromptBodyParts: string[] = [];
    if (ragContext) {
      finalPromptBodyParts.push(ragContext);
    }
    if (taskContext) {
      finalPromptBodyParts.push(taskContext);
    }
    if (processedHistoryString) {
      // Тепер історія вже містить відформатовані повідомлення з role: "tool" (з маркерами)
      finalPromptBodyParts.push(`### Conversation History:\n${processedHistoryString}`);
    }

    const finalPromptBody = finalPromptBodyParts.join("\n\n").trim();

    if (!finalPromptBody) {
      return null;
    }

    return finalPromptBody;
  }

  // _buildSimpleContext та _buildAdvancedContext тепер мають отримувати повідомлення
  // з role: "tool", які вже відформатовані з маркерами [TOOL_RESULT] або [TOOL_ERROR]
  // з методу OllamaView._executeAndRenderToolCycle
  private _buildSimpleContext(history: Message[], maxTokens: number): string {
    let context = "";
    let currentTokens = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const message = history[i];

      if (message.role === "system" || message.role === "error") continue; // error тут - це помилка рендерингу, а не TOOL_ERROR

      let formattedMessage = "";
      if (message.role === "user") {
        formattedMessage = `User: ${message.content.trim()}`;
      } else if (message.role === "assistant") {
        // Якщо це повідомлення асистента з tool_calls, воно має бути відформатоване для LLM
        // Відповідно до документації Ollama для tool use
        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCallsString = JSON.stringify(message.tool_calls); // Або інший формат, який очікує модель
            formattedMessage = `Assistant:\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
            if (message.content && message.content.trim() !== "") {
                 // Додаємо текстовий контент, якщо він є разом з tool_calls
                 formattedMessage = `Assistant: ${message.content.trim()}\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
            }
        } else {
            formattedMessage = `Assistant: ${message.content.trim()}`;
        }
      } else if (message.role === "tool") {
        // Повідомлення 'tool' вже має містити маркери [TOOL_RESULT] або [TOOL_ERROR]
        // у своєму message.content, додані в OllamaView
        formattedMessage = `<message role="tool" tool_call_id="${message.tool_call_id}" name="${message.name}">\n${message.content.trim()}\n</message>`;
      }
      
      const messageTokens = this._countTokens(formattedMessage) + 5; // +5 для приблизних токенів на роль/нову лінію
      if (currentTokens + messageTokens <= maxTokens) {
        context = formattedMessage + "\n\n" + context;
        currentTokens += messageTokens;
      } else {
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
    const messagesToKeep = history.slice(-actualKeepN);
    const messagesToProcess = history.slice(0, -actualKeepN);

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

      if (!olderContextContent) {
        let includedOlderCount = 0;
        // Використовуємо ту ж логіку форматування, що й у _buildSimpleContext
        for (let i = messagesToProcess.length - 1; i >= 0; i--) {
          const message = messagesToProcess[i];
          if (message.role === "system" || message.role === "error") continue;
          
          let formattedMessage = "";
          // ... (така ж логіка форматування user/assistant/tool, як у _buildSimpleContext) ...
            if (message.role === "user") {
                formattedMessage = `User: ${message.content.trim()}`;
            } else if (message.role === "assistant") {
                if (message.tool_calls && message.tool_calls.length > 0) {
                    const toolCallsString = JSON.stringify(message.tool_calls);
                    formattedMessage = `Assistant:\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                    if (message.content && message.content.trim() !== "") {
                        formattedMessage = `Assistant: ${message.content.trim()}\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                    }
                } else {
                    formattedMessage = `Assistant: ${message.content.trim()}`;
                }
            } else if (message.role === "tool") {
                formattedMessage = `<message role="tool" tool_call_id="${message.tool_call_id}" name="${message.name}">\n${message.content.trim()}\n</message>`;
            }

          const messageTokens = this._countTokens(formattedMessage) + 5;

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
          olderContextTokens += 10; 
        }
      }

      if (olderContextContent && currentTokens + olderContextTokens <= maxTokens) {
        processedParts.push(olderContextContent);
        currentTokens += olderContextTokens;
      }
    }

    let keptMessagesString = "";
    let keptMessagesTokens = 0;
    // Використовуємо ту ж логіку форматування, що й у _buildSimpleContext
    for (let i = messagesToKeep.length - 1; i >= 0; i--) {
        const message = messagesToKeep[i];
        if (message.role === "system" || message.role === "error") continue;
        
        let formattedMessage = "";
        // ... (така ж логіка форматування user/assistant/tool, як у _buildSimpleContext) ...
        if (message.role === "user") {
            formattedMessage = `User: ${message.content.trim()}`;
        } else if (message.role === "assistant") {
            if (message.tool_calls && message.tool_calls.length > 0) {
                const toolCallsString = JSON.stringify(message.tool_calls);
                formattedMessage = `Assistant:\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                if (message.content && message.content.trim() !== "") {
                    formattedMessage = `Assistant: ${message.content.trim()}\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                }
            } else {
                formattedMessage = `Assistant: ${message.content.trim()}`;
            }
        } else if (message.role === "tool") {
            formattedMessage = `<message role="tool" tool_call_id="${message.tool_call_id}" name="${message.name}">\n${message.content.trim()}\n</message>`;
        }

        const messageTokens = this._countTokens(formattedMessage) + 5;

        if (currentTokens + keptMessagesTokens + messageTokens <= maxTokens) {
            keptMessagesString = formattedMessage + "\n\n" + keptMessagesString;
            keptMessagesTokens += messageTokens;
        } else {
            break;
        }
    }


    if (keptMessagesString) {
      processedParts.push(keptMessagesString.trim());
      currentTokens += keptMessagesTokens;
    }

    return processedParts.join("\n\n").trim();
  }

  private async _summarizeMessages(messagesToSummarize: Message[], chatMetadata: ChatMetadata): Promise<string | null> {
    if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) {
      return null;
    }

    // Форматуємо історію для сумаризації так само, як для основного контексту
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
            // Повідомлення 'tool' вже мають маркери
            return `<message role="tool" tool_call_id="${m.tool_call_id}" name="${m.name}">\n${m.content.trim()}\n</message>`;
        }
        return ""; // На випадок непередбачених ролей
      })
      .filter(Boolean)
      .join("\n");

    if (!textToSummarize.trim()) {
      return null;
    }

    const summarizationPromptTemplate =
      this.plugin.settings.summarizationPrompt ||
      "Summarize the following conversation concisely, preserving key information and tool usage context:\n\n{text_to_summarize}";
    const summarizationFullPrompt = summarizationPromptTemplate.replace("{text_to_summarize}", textToSummarize);

    const summarizationModelName =
      this.plugin.settings.summarizationModelName || chatMetadata.modelName || this.plugin.settings.modelName;
    const summarizationContextWindow = Math.min(this.plugin.settings.contextWindow || 4096, 4096);

    const requestBody = {
      model: summarizationModelName,
      prompt: summarizationFullPrompt,
      stream: false,
      temperature: 0.3,
      options: { num_ctx: summarizationContextWindow, },
      system:
        "You are a helpful assistant specializing in concisely summarizing conversation history. Focus on extracting key points, decisions, unresolved questions, and the context of any tool calls and their results.",
    };

    try {
      if (!this.plugin.ollamaService) return null;
      const responseData: OllamaGenerateResponse = await this.plugin.ollamaService.generateRaw(requestBody);
      if (responseData && typeof responseData.response === "string") {
        return responseData.response.trim();
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}