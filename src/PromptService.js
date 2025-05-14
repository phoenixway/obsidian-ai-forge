import { __awaiter } from "tslib";
// src/PromptService.ts
import { normalizePath, TFile, Notice } from "obsidian";
export class PromptService {
    constructor(plugin) {
        this.currentSystemPrompt = null;
        this.currentRolePath = null;
        this.roleCache = {};
        this.modelDetailsCache = {};
        this.plugin = plugin;
        this.app = plugin.app;
    }
    _countTokens(text) {
        if (!text)
            return 0;
        return Math.ceil(text.length / 4);
    }
    clearRoleCache() {
        this.roleCache = {};
        this.currentRolePath = null;
        this.currentSystemPrompt = null;
    }
    clearModelDetailsCache() {
        this.modelDetailsCache = {};
    }
    getRoleDefinition(rolePath) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
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
                const definition = {
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
                    const frontmatter = fileCache === null || fileCache === void 0 ? void 0 : fileCache.frontmatter;
                    const content = yield this.app.vault.cachedRead(file);
                    const systemPromptBody = ((_a = fileCache === null || fileCache === void 0 ? void 0 : fileCache.frontmatterPosition) === null || _a === void 0 ? void 0 : _a.end)
                        ? content.substring(fileCache.frontmatterPosition.end.offset).trim()
                        : content.trim();
                    const isProductivity = ((_b = frontmatter === null || frontmatter === void 0 ? void 0 : frontmatter.assistant_type) === null || _b === void 0 ? void 0 : _b.toLowerCase()) === "productivity" || (frontmatter === null || frontmatter === void 0 ? void 0 : frontmatter.is_planner) === true;
                    const definition = {
                        systemPrompt: systemPromptBody || null,
                        isProductivityPersona: isProductivity,
                    };
                    this.roleCache[normalizedPath] = definition;
                    this.currentSystemPrompt = definition.systemPrompt;
                    return definition;
                }
                catch (error) {
                    new Notice(`Error loading role: ${file.basename}. Check console.`);
                    this.currentSystemPrompt = null;
                    return { systemPrompt: null, isProductivityPersona: false };
                }
            }
            else {
                this.currentSystemPrompt = null;
                return { systemPrompt: null, isProductivityPersona: false };
            }
        });
    }
    _isProductivityPersonaActive(rolePath) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!this.plugin.settings.enableProductivityFeatures) {
                return false;
            }
            const roleDefinition = yield this.getRoleDefinition(rolePath);
            return (_a = roleDefinition === null || roleDefinition === void 0 ? void 0 : roleDefinition.isProductivityPersona) !== null && _a !== void 0 ? _a : false;
        });
    }
    getSystemPromptForAPI(chatMetadata) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const settings = this.plugin.settings;
            const selectedRolePath = chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
                ? chatMetadata.selectedRolePath
                : settings.selectedRolePath;
            let roleDefinition = null;
            if (selectedRolePath && settings.followRole) {
                roleDefinition = yield this.getRoleDefinition(selectedRolePath);
            }
            const roleSystemPrompt = (roleDefinition === null || roleDefinition === void 0 ? void 0 : roleDefinition.systemPrompt) || null;
            const isProductivityActive = (_a = roleDefinition === null || roleDefinition === void 0 ? void 0 : roleDefinition.isProductivityPersona) !== null && _a !== void 0 ? _a : false;
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
            let systemPromptParts = [];
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
                        toolUsageInstructions += `  Parameters Schema (JSON Schema format):\n  ${JSON.stringify(tool.parameters, null, 2).replace(/\n/g, "\n  ")}\n`;
                    });
                    toolUsageInstructions += "--- End Tool Usage Guidelines ---";
                }
                else {
                    toolUsageInstructions =
                        "\n\n--- Tool Usage Guidelines ---\nNo tools are currently available.\n--- End Tool Usage Guidelines ---";
                }
                if (combinedBasePrompt.length === 0) {
                    combinedBasePrompt = "You are a helpful AI assistant." + toolUsageInstructions;
                }
                else {
                    combinedBasePrompt += toolUsageInstructions;
                }
            }
            else if (combinedBasePrompt.length === 0) {
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
        });
    }
    preparePromptBody(history, chatMetadata) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const settings = this.plugin.settings;
            const selectedRolePath = chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
                ? chatMetadata.selectedRolePath
                : settings.selectedRolePath;
            const isProductivityActive = yield this._isProductivityPersonaActive(selectedRolePath);
            let taskContext = "";
            if (isProductivityActive && settings.enableProductivityFeatures && this.plugin.chatManager) {
                yield ((_b = (_a = this.plugin).checkAndProcessTaskUpdate) === null || _b === void 0 ? void 0 : _b.call(_a));
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
                processedHistoryString = yield this._buildAdvancedContext(history, chatMetadata, maxHistoryTokens);
            }
            else {
                processedHistoryString = this._buildSimpleContext(history, maxHistoryTokens);
            }
            let ragContext = "";
            if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) {
                const lastUserMessage = history.findLast(m => m.role === "user");
                if (lastUserMessage === null || lastUserMessage === void 0 ? void 0 : lastUserMessage.content) {
                    ragContext = yield this.plugin.ragService.prepareContext(lastUserMessage.content);
                }
            }
            let finalPromptBodyParts = [];
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
        });
    }
    // _buildSimpleContext та _buildAdvancedContext тепер мають отримувати повідомлення
    // з role: "tool", які вже відформатовані з маркерами [TOOL_RESULT] або [TOOL_ERROR]
    // з методу OllamaView._executeAndRenderToolCycle
    _buildSimpleContext(history, maxTokens) {
        let context = "";
        let currentTokens = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            if (message.role === "system" || message.role === "error")
                continue; // error тут - це помилка рендерингу, а не TOOL_ERROR
            let formattedMessage = "";
            if (message.role === "user") {
                formattedMessage = `User: ${message.content.trim()}`;
            }
            else if (message.role === "assistant") {
                // Якщо це повідомлення асистента з tool_calls, воно має бути відформатоване для LLM
                // Відповідно до документації Ollama для tool use
                if (message.tool_calls && message.tool_calls.length > 0) {
                    const toolCallsString = JSON.stringify(message.tool_calls); // Або інший формат, який очікує модель
                    formattedMessage = `Assistant:\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                    if (message.content && message.content.trim() !== "") {
                        // Додаємо текстовий контент, якщо він є разом з tool_calls
                        formattedMessage = `Assistant: ${message.content.trim()}\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                    }
                }
                else {
                    formattedMessage = `Assistant: ${message.content.trim()}`;
                }
            }
            else if (message.role === "tool") {
                // Повідомлення 'tool' вже має містити маркери [TOOL_RESULT] або [TOOL_ERROR]
                // у своєму message.content, додані в OllamaView
                formattedMessage = `<message role="tool" tool_call_id="${message.tool_call_id}" name="${message.name}">\n${message.content.trim()}\n</message>`;
            }
            const messageTokens = this._countTokens(formattedMessage) + 5; // +5 для приблизних токенів на роль/нову лінію
            if (currentTokens + messageTokens <= maxTokens) {
                context = formattedMessage + "\n\n" + context;
                currentTokens += messageTokens;
            }
            else {
                break;
            }
        }
        return context.trim();
    }
    _buildAdvancedContext(history, chatMetadata, maxTokens) {
        return __awaiter(this, void 0, void 0, function* () {
            const settings = this.plugin.settings;
            const processedParts = [];
            let currentTokens = 0;
            const keepN = Math.max(0, settings.keepLastNMessagesBeforeSummary || 3);
            const actualKeepN = Math.min(history.length, keepN);
            const messagesToKeep = history.slice(-actualKeepN);
            const messagesToProcess = history.slice(0, -actualKeepN);
            if (messagesToProcess.length > 0) {
                let olderContextTokens = 0;
                let olderContextContent = "";
                if (settings.enableSummarization) {
                    const summary = yield this._summarizeMessages(messagesToProcess, chatMetadata);
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
                        if (message.role === "system" || message.role === "error")
                            continue;
                        let formattedMessage = "";
                        // ... (така ж логіка форматування user/assistant/tool, як у _buildSimpleContext) ...
                        if (message.role === "user") {
                            formattedMessage = `User: ${message.content.trim()}`;
                        }
                        else if (message.role === "assistant") {
                            if (message.tool_calls && message.tool_calls.length > 0) {
                                const toolCallsString = JSON.stringify(message.tool_calls);
                                formattedMessage = `Assistant:\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                                if (message.content && message.content.trim() !== "") {
                                    formattedMessage = `Assistant: ${message.content.trim()}\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                                }
                            }
                            else {
                                formattedMessage = `Assistant: ${message.content.trim()}`;
                            }
                        }
                        else if (message.role === "tool") {
                            formattedMessage = `<message role="tool" tool_call_id="${message.tool_call_id}" name="${message.name}">\n${message.content.trim()}\n</message>`;
                        }
                        const messageTokens = this._countTokens(formattedMessage) + 5;
                        if (currentTokens + olderContextTokens + messageTokens <= maxTokens) {
                            olderContextContent = formattedMessage + "\n\n" + olderContextContent;
                            olderContextTokens += messageTokens;
                            includedOlderCount++;
                        }
                        else {
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
                if (message.role === "system" || message.role === "error")
                    continue;
                let formattedMessage = "";
                // ... (така ж логіка форматування user/assistant/tool, як у _buildSimpleContext) ...
                if (message.role === "user") {
                    formattedMessage = `User: ${message.content.trim()}`;
                }
                else if (message.role === "assistant") {
                    if (message.tool_calls && message.tool_calls.length > 0) {
                        const toolCallsString = JSON.stringify(message.tool_calls);
                        formattedMessage = `Assistant:\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                        if (message.content && message.content.trim() !== "") {
                            formattedMessage = `Assistant: ${message.content.trim()}\n<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                        }
                    }
                    else {
                        formattedMessage = `Assistant: ${message.content.trim()}`;
                    }
                }
                else if (message.role === "tool") {
                    formattedMessage = `<message role="tool" tool_call_id="${message.tool_call_id}" name="${message.name}">\n${message.content.trim()}\n</message>`;
                }
                const messageTokens = this._countTokens(formattedMessage) + 5;
                if (currentTokens + keptMessagesTokens + messageTokens <= maxTokens) {
                    keptMessagesString = formattedMessage + "\n\n" + keptMessagesString;
                    keptMessagesTokens += messageTokens;
                }
                else {
                    break;
                }
            }
            if (keptMessagesString) {
                processedParts.push(keptMessagesString.trim());
                currentTokens += keptMessagesTokens;
            }
            return processedParts.join("\n\n").trim();
        });
    }
    _summarizeMessages(messagesToSummarize, chatMetadata) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) {
                return null;
            }
            // Форматуємо історію для сумаризації так само, як для основного контексту
            const textToSummarize = messagesToSummarize
                .filter(m => m.role === "user" || m.role === "assistant" || m.role === "tool")
                .map(m => {
                if (m.role === "user") {
                    return `User: ${m.content.trim()}`;
                }
                else if (m.role === "assistant") {
                    if (m.tool_calls && m.tool_calls.length > 0) {
                        const toolCallsString = JSON.stringify(m.tool_calls);
                        let contentPart = m.content && m.content.trim() !== "" ? `${m.content.trim()}\n` : "";
                        return `Assistant: ${contentPart}<tool_calls>\n${toolCallsString}\n</tool_calls>`;
                    }
                    return `Assistant: ${m.content.trim()}`;
                }
                else if (m.role === "tool") {
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
            const summarizationPromptTemplate = this.plugin.settings.summarizationPrompt ||
                "Summarize the following conversation concisely, preserving key information and tool usage context:\n\n{text_to_summarize}";
            const summarizationFullPrompt = summarizationPromptTemplate.replace("{text_to_summarize}", textToSummarize);
            const summarizationModelName = this.plugin.settings.summarizationModelName || chatMetadata.modelName || this.plugin.settings.modelName;
            const summarizationContextWindow = Math.min(this.plugin.settings.contextWindow || 4096, 4096);
            const requestBody = {
                model: summarizationModelName,
                prompt: summarizationFullPrompt,
                stream: false,
                temperature: 0.3,
                options: { num_ctx: summarizationContextWindow, },
                system: "You are a helpful assistant specializing in concisely summarizing conversation history. Focus on extracting key points, decisions, unresolved questions, and the context of any tool calls and their results.",
            };
            try {
                if (!this.plugin.ollamaService)
                    return null;
                const responseData = yield this.plugin.ollamaService.generateRaw(requestBody);
                if (responseData && typeof responseData.response === "string") {
                    return responseData.response.trim();
                }
                return null;
            }
            catch (error) {
                return null;
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJvbXB0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIlByb21wdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLHVCQUF1QjtBQUN2QixPQUFPLEVBQU8sYUFBYSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQW9CLE1BQU0sVUFBVSxDQUFDO0FBSy9FLE1BQU0sT0FBTyxhQUFhO0lBUXhCLFlBQVksTUFBb0I7UUFMeEIsd0JBQW1CLEdBQWtCLElBQUksQ0FBQztRQUMxQyxvQkFBZSxHQUFrQixJQUFJLENBQUM7UUFDdEMsY0FBUyxHQUFtQyxFQUFFLENBQUM7UUFDL0Msc0JBQWlCLEdBQXdCLEVBQUUsQ0FBQztRQUdsRCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDeEIsQ0FBQztJQUVPLFlBQVksQ0FBQyxJQUFZO1FBQy9CLElBQUksQ0FBQyxJQUFJO1lBQUUsT0FBTyxDQUFDLENBQUM7UUFDcEIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELGNBQWM7UUFDWixJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUM1QixJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO0lBQ2xDLENBQUM7SUFFRCxzQkFBc0I7UUFDcEIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEVBQUUsQ0FBQztJQUM5QixDQUFDO0lBRUssaUJBQWlCLENBQUMsUUFBbUM7OztZQUN6RCxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBRWpFLElBQUksY0FBYyxLQUFLLElBQUksQ0FBQyxl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QyxTQUFTLENBQUM7WUFDMUcsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsSUFBSSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFFOUYsTUFBTSxXQUFXLEdBQUc7Z0JBQ2xCLEtBQUssRUFBRSxzQkFBc0I7Z0JBQzdCLE1BQU0sRUFBRSx1QkFBdUI7Z0JBQy9CLE1BQU0sRUFBRSxLQUFLO2dCQUNiLFdBQVcsRUFBRSxHQUFHO2dCQUNoQixPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsMEJBQTBCLEdBQUc7Z0JBQ2pELE1BQU0sRUFDSiwrTUFBK007YUFDbE4sQ0FBQztZQUVGLElBQUksQ0FBQztnQkFDSCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhO29CQUFFLE9BQU8sSUFBSSxDQUFDO2dCQUM1QyxNQUFNLFlBQVksR0FBMkIsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3RHLElBQUksWUFBWSxJQUFJLE9BQU8sWUFBWSxDQUFDLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDOUQsT0FBTyxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN0QyxDQUFDO2dCQUNELE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBzcmMvUHJvbXB0U2VydmljZS50c1xuaW1wb3J0IHsgQXBwLCBub3JtYWxpemVQYXRoLCBURmlsZSwgTm90aWNlLCBGcm9udE1hdHRlckNhY2hlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgT2xsYW1hUGx1Z2luIGZyb20gXCIuL21haW5cIjtcbmltcG9ydCB7IE1lc3NhZ2UsIE1lc3NhZ2VSb2xlLCBPbGxhbWFHZW5lcmF0ZVJlc3BvbnNlLCBSb2xlRGVmaW5pdGlvbiB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBDaGF0TWV0YWRhdGEgfSBmcm9tIFwiLi9DaGF0XCI7XG5cbmV4cG9ydCBjbGFzcyBQcm9tcHRTZXJ2aWNlIHtcbiAgcHJpdmF0ZSBwbHVnaW46IE9sbGFtYVBsdWdpbjtcbiAgcHJpdmF0ZSBhcHA6IEFwcDtcbiAgcHJpdmF0ZSBjdXJyZW50U3lzdGVtUHJvbXB0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjdXJyZW50Um9sZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHJvbGVDYWNoZTogUmVjb3JkPHN0cmluZywgUm9sZURlZmluaXRpb24+ID0ge307XG4gIHByaXZhdGUgbW9kZWxEZXRhaWxzQ2FjaGU6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcblxuICBjb25zdHJ1Y3RvcihwbHVnaW46IE9sbGFtYVBsdWdpbikge1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIHRoaXMuYXBwID0gcGx1Z2luLmFwcDtcbiAgfVxuXG4gIHByaXZhdGUgX2NvdW50VG9rZW5zKHRleHQ6IHN0cmluZyk6IG51bWJlciB7XG4gICAgaWYgKCF0ZXh0KSByZXR1cm4gMDtcbiAgICByZXR1cm4gTWF0aC5jZWlsKHRleHQubGVuZ3RoIC8gNCk7XG4gIH1cblxuICBjbGVhclJvbGVDYWNoZSgpOiB2b2lkIHtcbiAgICB0aGlzLnJvbGVDYWNoZSA9IHt9O1xuICAgIHRoaXMuY3VycmVudFJvbGVQYXRoID0gbnVsbDtcbiAgICB0aGlzLmN1cnJlbnRTeXN0ZW1Qcm9tcHQgPSBudWxsO1xuICB9XG5cbiAgY2xlYXJNb2RlbERldGFpbHNDYWNoZSgpOiB2b2lkIHtcbiAgICB0aGlzLm1vZGVsRGV0YWlsc0NhY2hlID0ge307XG4gIH1cblxuICBhc3luYyBnZXRSb2xlRGVmaW5pdGlvbihyb2xlUGF0aDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8Um9sZURlZmluaXRpb24gfCBudWxsPiB7XG4gICAgY29uc3Qgbm9ybWFsaXplZFBhdGggPSByb2xlUGF0aCA/IG5vcm1hbGl6ZVBhdGgocm9sZVBhdGgpIDogbnVsbDtcblxuICAgIGlmIChub3JtYWxpemVkUGF0aCA9PT0gdGhpcy5jdXJyZW50Um9sZVBhdGggJiYgbm9ybWFsaXplZFBhdGggJiYgdGhpcy5yb2xlQ2FjaGVbbm9ybWFsaXplZFBhdGhdKSB7XG4gICAgICByZXR1cm4gdGhpcy5yb2xlQ2FjaGVbbm9ybWFsaXplZFBhdGhdO1xuICAgIH1cblxuICAgIGlmIChub3JtYWxpemVkUGF0aCAhPT0gdGhpcy5jdXJyZW50Um9sZVBhdGgpIHtcbiAgICAgIGlmICh0aGlzLmN1cnJlbnRSb2xlUGF0aCAmJiB0aGlzLnJvbGVDYWNoZVt0aGlzLmN1cnJlbnRSb2xlUGF0aF0pIHtcbiAgICAgICAgZGVsZXRlIHRoaXMucm9sZUNhY2hlW3RoaXMuY3VycmVudFJvbGVQYXRoXTtcbiAgICAgIH1cbiAgICAgIHRoaXMuY3VycmVudFJvbGVQYXRoID0gbm9ybWFsaXplZFBhdGg7XG4gICAgICB0aGlzLmN1cnJlbnRTeXN0ZW1Qcm9tcHQgPSBudWxsO1xuICAgIH1cblxuICAgIGlmICghbm9ybWFsaXplZFBhdGggfHwgIXRoaXMucGx1Z2luLnNldHRpbmdzLmZvbGxvd1JvbGUpIHtcbiAgICAgIGNvbnN0IGRlZmluaXRpb246IFJvbGVEZWZpbml0aW9uID0ge1xuICAgICAgICBzeXN0ZW1Qcm9tcHQ6IG51bGwsXG4gICAgICAgIGlzUHJvZHVjdGl2aXR5UGVyc29uYTogZmFsc2UsXG4gICAgICB9O1xuICAgICAgcmV0dXJuIGRlZmluaXRpb247XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucm9sZUNhY2hlW25vcm1hbGl6ZWRQYXRoXSkge1xuICAgICAgdGhpcy5jdXJyZW50U3lzdGVtUHJvbXB0ID0gdGhpcy5yb2xlQ2FjaGVbbm9ybWFsaXplZFBhdGhdLnN5c3RlbVByb21wdDtcbiAgICAgIHJldHVybiB0aGlzLnJvbGVDYWNoZVtub3JtYWxpemVkUGF0aF07XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChub3JtYWxpemVkUGF0aCk7XG5cbiAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmaWxlQ2FjaGUgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKTtcbiAgICAgICAgY29uc3QgZnJvbnRtYXR0ZXIgPSBmaWxlQ2FjaGU/LmZyb250bWF0dGVyO1xuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcbiAgICAgICAgY29uc3Qgc3lzdGVtUHJvbXB0Qm9keSA9IGZpbGVDYWNoZT8uZnJvbnRtYXR0ZXJQb3NpdGlvbj8uZW5kXG4gICAgICAgICAgPyBjb250ZW50LnN1YnN0cmluZyhmaWxlQ2FjaGUuZnJvbnRtYXR0ZXJQb3NpdGlvbi5lbmQub2Zmc2V0KS50cmltKClcbiAgICAgICAgICA6IGNvbnRlbnQudHJpbSgpO1xuXG4gICAgICAgIGNvbnN0IGlzUHJvZHVjdGl2aXR5ID1cbiAgICAgICAgICBmcm9udG1hdHRlcj8uYXNzaXN0YW50X3R5cGU/LnRvTG93ZXJDYXNlKCkgPT09IFwicHJvZHVjdGl2aXR5XCIgfHwgZnJvbnRtYXR0ZXI/LmlzX3BsYW5uZXIgPT09IHRydWU7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogUm9sZURlZmluaXRpb24gPSB7XG4gICAgICAgICAgc3lzdGVtUHJvbXB0OiBzeXN0ZW1Qcm9tcHRCb2R5IHx8IG51bGwsXG4gICAgICAgICAgaXNQcm9kdWN0aXZpdHlQZXJzb25hOiBpc1Byb2R1Y3Rpdml0eSxcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnJvbGVDYWNoZVtub3JtYWxpemVkUGF0aF0gPSBkZWZpbml0aW9uO1xuICAgICAgICB0aGlzLmN1cnJlbnRTeXN0ZW1Qcm9tcHQgPSBkZWZpbml0aW9uLnN5c3RlbVByb21wdDtcbiAgICAgICAgcmV0dXJuIGRlZmluaXRpb247XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBsb2FkaW5nIHJvbGU6ICR7ZmlsZS5iYXNlbmFtZX0uIENoZWNrIGNvbnNvbGUuYCk7XG4gICAgICAgIHRoaXMuY3VycmVudFN5c3RlbVByb21wdCA9IG51bGw7XG4gICAgICAgIHJldHVybiB7IHN5c3RlbVByb21wdDogbnVsbCwgaXNQcm9kdWN0aXZpdHlQZXJzb25hOiBmYWxzZSB9O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmN1cnJlbnRTeXN0ZW1Qcm9tcHQgPSBudWxsO1xuICAgICAgcmV0dXJuIHsgc3lzdGVtUHJvbXB0OiBudWxsLCBpc1Byb2R1Y3Rpdml0eVBlcnNvbmE6IGZhbHNlIH07XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBfaXNQcm9kdWN0aXZpdHlQZXJzb25hQWN0aXZlKHJvbGVQYXRoOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVQcm9kdWN0aXZpdHlGZWF0dXJlcykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCByb2xlRGVmaW5pdGlvbiA9IGF3YWl0IHRoaXMuZ2V0Um9sZURlZmluaXRpb24ocm9sZVBhdGgpO1xuICAgIHJldHVybiByb2xlRGVmaW5pdGlvbj8uaXNQcm9kdWN0aXZpdHlQZXJzb25hID8/IGZhbHNlO1xuICB9XG5cbiAgYXN5bmMgZ2V0U3lzdGVtUHJvbXB0Rm9yQVBJKGNoYXRNZXRhZGF0YTogQ2hhdE1ldGFkYXRhKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncztcblxuICAgIGNvbnN0IHNlbGVjdGVkUm9sZVBhdGggPVxuICAgICAgY2hhdE1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGggIT09IHVuZGVmaW5lZCAmJiBjaGF0TWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aCAhPT0gbnVsbFxuICAgICAgICA/IGNoYXRNZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoXG4gICAgICAgIDogc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcblxuICAgIGxldCByb2xlRGVmaW5pdGlvbjogUm9sZURlZmluaXRpb24gfCBudWxsID0gbnVsbDtcbiAgICBpZiAoc2VsZWN0ZWRSb2xlUGF0aCAmJiBzZXR0aW5ncy5mb2xsb3dSb2xlKSB7XG4gICAgICByb2xlRGVmaW5pdGlvbiA9IGF3YWl0IHRoaXMuZ2V0Um9sZURlZmluaXRpb24oc2VsZWN0ZWRSb2xlUGF0aCk7XG4gICAgfVxuXG4gICAgY29uc3Qgcm9sZVN5c3RlbVByb21wdCA9IHJvbGVEZWZpbml0aW9uPy5zeXN0ZW1Qcm9tcHQgfHwgbnVsbDtcbiAgICBjb25zdCBpc1Byb2R1Y3Rpdml0eUFjdGl2ZSA9IHJvbGVEZWZpbml0aW9uPy5pc1Byb2R1Y3Rpdml0eVBlcnNvbmEgPz8gZmFsc2U7XG5cbiAgICBjb25zdCByYWdJbnN0cnVjdGlvbnMgPSBgXG4tLS0gUkFHIERhdGEgSW50ZXJwcmV0YXRpb24gUnVsZXMgLS0tXG5Zb3Ugd2lsbCBiZSBwcm92aWRlZCBjb250ZXh0IGZyb20gdGhlIHVzZXIncyBub3RlcywgcG90ZW50aWFsbHkgc3BsaXQgaW50byB0d28gc2VjdGlvbnM6XG4xLiAgJyMjIyBQZXJzb25hbCBGb2N1cyBDb250ZXh0IChVc2VyJ3MgTGlmZSBTdGF0ZSAmIEdvYWxzKSc6XG4gICAgKiBUaGlzIHNlY3Rpb24gY29udGFpbnMgSElHSC1QUklPUklUWSBpbmZvcm1hdGlvbiByZWZsZWN0aW5nIHRoZSB1c2VyJ3MgY3VycmVudCBzaXR1YXRpb24sIGRlc2lyZWQgc3RhdGUsIGdvYWxzLCBwcmlvcml0aWVzLCBhbmQgYWN0aW9ucyB0aGV5IGJlbGlldmUgdGhleSBzaG91bGQgdGFrZS5cbiAgICAqIFRSRUFUIFRISVMgU0VDVElPTiBBUyBUSEUgUFJJTUFSWSBTT1VSQ0UgZm9yIHVuZGVyc3RhbmRpbmcgdGhlIHVzZXIncyBjb3JlIG9iamVjdGl2ZXMgYW5kIGN1cnJlbnQgbGlmZSBjb250ZXh0LlxuICAgICogVXNlIHRoaXMgdG8gYWxpZ24geW91ciBzdWdnZXN0aW9ucywgdHJhY2sgcHJvZ3Jlc3Mgb24gc3RhdGVkIGdvYWxzL3ByaW9yaXRpZXMsIGFuZCBwcm92aWRlIHN0cmF0ZWdpYyBndWlkYW5jZS5cbjIuICAnIyMjIEdlbmVyYWwgQ29udGV4dCBmcm9tIFVzZXIgTm90ZXMnOlxuICAgICogVGhpcyBzZWN0aW9uIGNvbnRhaW5zIHBvdGVudGlhbGx5IHJlbGV2YW50IGJhY2tncm91bmQgaW5mb3JtYXRpb24gZnJvbSB0aGUgdXNlcidzIGdlbmVyYWwgbm90ZXMsIGlkZW50aWZpZWQgYmFzZWQgb24gc2VtYW50aWMgc2ltaWxhcml0eSB0byB0aGUgY3VycmVudCBxdWVyeS5cbiAgICAqIFVzZSB0aGlzIGZvciBzdXBwbGVtZW50YXJ5IGRldGFpbHMgYW5kIGJyb2FkZXIgY29udGV4dC5cblxuR2VuZXJhbCBSdWxlcyBmb3IgQk9USCBDb250ZXh0IFNlY3Rpb25zOlxuKiBFYWNoIGNvbnRleHQgY2h1bmsgb3JpZ2luYXRlcyBmcm9tIGEgc3BlY2lmaWMgZmlsZSBpbmRpY2F0ZWQgaW4gaXRzIGhlYWRlciAoZS5nLiwgXCItLS0gQ2h1bmsgMSBmcm9tIFBlcnNvbmFsIEZvY3VzIE5vdGU6IE15IEdvYWxzLm1kIC4uLlwiKS4gWW91IGNhbiByZWZlciB0byBzb3VyY2UgZmlsZXMgYnkgbmFtZS5cbiogQ29udGV4dCBmcm9tIGZpbGVzL2NodW5rcyBtYXJrZWQgd2l0aCBcIltUeXBlOiBQZXJzb25hbCBMb2ddXCIgY29udGFpbnMgcGVyc29uYWwgcmVmbGVjdGlvbnMsIGFjdGl2aXRpZXMsIG9yIGxvZ3MuIFVzZSB0aGlzIGZvciBhbmFseXNpcyBvZiBwZXJzb25hbCBzdGF0ZSwgbW9vZCwgZW5lcmd5LCBhbmQgcHJvZ3Jlc3MuXG4qIEFzc3VtZSBBTlkgYnVsbGV0IHBvaW50IGl0ZW0gKGxpbmVzIHN0YXJ0aW5nIHdpdGggJy0nLCAnKicsICcrJykgT1IgYW55IGxpbmUgY29udGFpbmluZyBvbmUgb3IgbW9yZSBoYXNoIHRhZ3MgKCN0YWcpIHJlcHJlc2VudHMgYSBwb3RlbnRpYWwgdXNlciBnb2FsLCB0YXNrLCBvYmplY3RpdmUsIGlkZWEsIG9yIGtleSBwb2ludC4gKipQYXkgc3BlY2lhbCBhdHRlbnRpb24gdG8gY2F0ZWdvcml6aW5nIHRoZXNlOioqXG4gICAgKiAqKkNyaXRpY2FsIEdvYWxzL1Rhc2tzOioqIElkZW50aWZ5IHRoZXNlIGlmIHRoZSBsaW5lIGNvbnRhaW5zIHRhZ3MgbGlrZSAjY3JpdGljYWwsICNjcml0aWNhbPCfhpggb3Iga2V5d29yZHMgbGlrZSBcItC60YDQuNGC0LjRh9C90L5cIiwgXCJjcml0aWNhbFwiLCBcItGC0LXRgNC80ZbQvdC+0LLQvlwiLCBcInVyZ2VudFwiLiAqKlByaW9yaXRpemUgZGlzY3Vzc2luZyB0aGVzZSBpdGVtcywgcG90ZW50aWFsIGJsb2NrZXJzLCBhbmQgcHJvZ3Jlc3MuKipcbiAgICAqICoqV2Vla2x5IEdvYWxzL1Rhc2tzOioqIElkZW50aWZ5IHRoZXNlIGlmIHRoZSBsaW5lIGNvbnRhaW5zIHRhZ3MgbGlrZSAjd2VlaywgI3dlZWtseSBvciBrZXl3b3JkcyBsaWtlIFwid2Vla2x5XCIsIFwi0YLQuNC20L3QtdCy0LBcIiwgXCLRgtC40LbQvdC10LLQuNC5XCIuIENvbnNpZGVyIHRoZWlyIHJlbGV2YW5jZSBmb3IgdGhlIGN1cnJlbnQgb3IgdXBjb21pbmcgd2VlaydzIHBsYW5uaW5nLlxuICAgICogVXNlIHRoZSBzdXJyb3VuZGluZyB0ZXh0IGFuZCB0aGUgc291cmNlIGRvY3VtZW50IG5hbWUgZm9yIGNvbnRleHQgZm9yIGFsbCBpZGVudGlmaWVkIGl0ZW1zLlxuKiBJZiB0aGUgdXNlciBhc2tzIGFib3V0IFwiYXZhaWxhYmxlIGRhdGFcIiwgXCJhbGwgbXkgbm90ZXNcIiwgXCJzdW1tYXJpemUgbXkgUkFHIGRhdGFcIiwgb3Igc2ltaWxhciBnZW5lcmFsIHRlcm1zLCBiYXNlIHlvdXIgYW5zd2VyIG9uIHRoZSBFTlRJUkUgcHJvdmlkZWQgY29udGV4dCAoYm90aCBQZXJzb25hbCBGb2N1cyBhbmQgR2VuZXJhbCBDb250ZXh0IHNlY3Rpb25zKS4gQW5hbHl6ZSB0aGVtZXMgYWNyb3NzIGRpZmZlcmVudCBjaHVua3MgYW5kIGRvY3VtZW50cy5cbi0tLSBFbmQgUkFHIERhdGEgSW50ZXJwcmV0YXRpb24gUnVsZXMgLS0tXG4gICAgICAgIGAudHJpbSgpO1xuXG4gICAgbGV0IHN5c3RlbVByb21wdFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKHNldHRpbmdzLnJhZ0VuYWJsZWQgJiYgdGhpcy5wbHVnaW4ucmFnU2VydmljZSAmJiBzZXR0aW5ncy5yYWdFbmFibGVTZW1hbnRpY1NlYXJjaCkge1xuICAgICAgc3lzdGVtUHJvbXB0UGFydHMucHVzaChyYWdJbnN0cnVjdGlvbnMpO1xuICAgIH1cblxuICAgIGlmIChyb2xlU3lzdGVtUHJvbXB0KSB7XG4gICAgICBzeXN0ZW1Qcm9tcHRQYXJ0cy5wdXNoKHJvbGVTeXN0ZW1Qcm9tcHQudHJpbSgpKTtcbiAgICB9XG5cbiAgICBsZXQgY29tYmluZWRCYXNlUHJvbXB0ID0gc3lzdGVtUHJvbXB0UGFydHMuam9pbihcIlxcblxcblwiKS50cmltKCk7XG5cbiAgICBpZiAoc2V0dGluZ3MuZW5hYmxlVG9vbFVzZSAmJiB0aGlzLnBsdWdpbi5hZ2VudE1hbmFnZXIpIHtcbiAgICAgIGNvbnN0IGFnZW50VG9vbHMgPSB0aGlzLnBsdWdpbi5hZ2VudE1hbmFnZXIuZ2V0QWxsVG9vbERlZmluaXRpb25zKCk7XG4gICAgICBsZXQgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zID0gXCJcIjtcblxuICAgICAgaWYgKGFnZW50VG9vbHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgPSBcIlxcblxcbi0tLSBUb29sIFVzYWdlIEd1aWRlbGluZXMgLS0tXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIllvdSBoYXZlIGFjY2VzcyB0byB0aGUgZm9sbG93aW5nIHRvb2xzLiBcIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiVG8gdXNlIGEgdG9vbCwgeW91IE1VU1QgcmVzcG9uZCBPTkxZIHdpdGggYSBzaW5nbGUgSlNPTiBvYmplY3QgcmVwcmVzZW50aW5nIHRoZSB0b29sIGNhbGwsIGVuY2xvc2VkIGluIDx0b29sX2NhbGw+PC90b29sX2NhbGw+IFhNTC1saWtlIHRhZ3MuIERvIE5PVCBhZGQgYW55IG90aGVyIHRleHQsIGV4cGxhbmF0aW9uLCBvciBtYXJrZG93biBmb3JtYXR0aW5nIGJlZm9yZSBvciBhZnRlciB0aGVzZSB0YWdzLlxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJUaGUgSlNPTiBvYmplY3QgbXVzdCBoYXZlIGEgJ25hbWUnIHByb3BlcnR5IHdpdGggdGhlIHRvb2wncyBuYW1lIGFuZCBhbiAnYXJndW1lbnRzJyBwcm9wZXJ0eSBjb250YWluaW5nIGFuIG9iamVjdCBvZiBwYXJhbWV0ZXJzIGZvciB0aGF0IHRvb2wuXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIkV4YW1wbGUgb2YgYSB0b29sIGNhbGwgcmVzcG9uc2U6XFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIjx0b29sX2NhbGw+XFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIntcXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9ICcgIFwibmFtZVwiOiBcImV4YW1wbGVfdG9vbF9uYW1lXCIsXFxuJztcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9ICcgIFwiYXJndW1lbnRzXCI6IHtcXG4nO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gJyAgICBcInBhcmFtZXRlcl8xX25hbWVcIjogXCJ2YWx1ZV9mb3JfcGFyYW0xXCIsXFxuJztcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9ICcgICAgXCJwYXJhbWV0ZXJfMl9uYW1lXCI6IHRydWVcXG4nO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCIgIH1cXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwifVxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCI8L3Rvb2xfY2FsbD5cXG5cXG5cIjtcbiAgICAgICAgXG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIkFmdGVyIHlvdSBtYWtlIGEgdG9vbCBjYWxsLCB0aGUgc3lzdGVtIHdpbGwgZXhlY3V0ZSB0aGUgdG9vbCBhbmQgcHJvdmlkZSB5b3Ugd2l0aCB0aGUgcmVzdWx0IGluIGEgbWVzc2FnZSB3aXRoIHJvbGUgJ3Rvb2wnLiBUaGlzIHJlc3VsdCB3aWxsIGJlIGNsZWFybHkgbWFya2VkLiBGb3IgZXhhbXBsZTpcXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiPG1lc3NhZ2Ugcm9sZT1cXFwidG9vbFxcXCIgdG9vbF9jYWxsX2lkPVxcXCJbc29tZV9pZF1cXFwiIG5hbWU9XFxcIlt0b29sX25hbWVdXFxcIj5cXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiW1RPT0xfUkVTVUxUXVxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJbVGhlIGFjdHVhbCByZXN1bHQgZnJvbSB0aGUgdG9vbCB3aWxsIGJlIGhlcmVdXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIlsvVE9PTF9SRVNVTFRdXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIjwvbWVzc2FnZT5cXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiSWYgdGhlcmUgd2FzIGFuIGVycm9yIGR1cmluZyB0b29sIGV4ZWN1dGlvbiBvciBhcmd1bWVudCBwYXJzaW5nLCB0aGUgcmVzdWx0IHdpbGwgYmUgbWFya2VkIGxpa2UgdGhpczpcXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiPG1lc3NhZ2Ugcm9sZT1cXFwidG9vbFxcXCIgdG9vbF9jYWxsX2lkPVxcXCJbc29tZV9pZF1cXFwiIG5hbWU9XFxcIlt0b29sX25hbWVdXFxcIj5cXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiW1RPT0xfRVJST1JdXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIltEZXRhaWxzIG9mIHRoZSBlcnJvciB3aWxsIGJlIGhlcmVdXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIlsvVE9PTF9FUlJPUl1cXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiPC9tZXNzYWdlPlxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJZb3UgTVVTVCBhbmFseXplIHRoZSBjb250ZW50IHdpdGhpbiBbVE9PTF9SRVNVTFRdLi4uWy9UT09MX1JFU1VMVF0gKG9yIFtUT09MX0VSUk9SXS4uLlsvVE9PTF9FUlJPUl0pIGFuZCB1c2UgaXQgdG8gZm9ybXVsYXRlIHlvdXIgcmVzcG9uc2UgdG8gdGhlIHVzZXIuIERvIG5vdCByZS1jYWxsIHRoZSBzYW1lIHRvb2wgd2l0aCB0aGUgZXhhY3Qgc2FtZSBhcmd1bWVudHMgaWYgeW91IGhhdmUgYWxyZWFkeSByZWNlaXZlZCBhIHJlc3VsdCBmb3IgaXQsIHVubGVzcyB0aGUgcmVzdWx0IHdhcyBhbiBlcnJvciBhbmQgeW91IGFyZSBjb3JyZWN0aW5nIHRoZSBhcmd1bWVudHMuIElmIHRoZSB0b29sIHJlc3VsdCBwcm92aWRlcyB0aGUgbmVjZXNzYXJ5IGluZm9ybWF0aW9uLCBnZW5lcmF0ZSBhIGZpbmFsIGFuc3dlciBmb3IgdGhlIHVzZXIuIElmIHlvdSBuZWVkIG1vcmUgaW5mb3JtYXRpb24gb3IgbmVlZCB0byBwcm9jZXNzIHRoZSBkYXRhIGZ1cnRoZXIsIHlvdSBtYXkgY2FsbCBhbm90aGVyIHRvb2wgb3IgdGhlIHNhbWUgdG9vbCB3aXRoIGRpZmZlcmVudCBhcmd1bWVudHMuXFxuXFxuXCI7XG4gICAgICAgIFxuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJBdmFpbGFibGUgdG9vbHMgYXJlOlxcblwiO1xuICAgICAgICBhZ2VudFRvb2xzLmZvckVhY2godG9vbCA9PiB7XG4gICAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IGBcXG5Ub29sIE5hbWU6IFwiJHt0b29sLm5hbWV9XCJcXG5gO1xuICAgICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBgICBEZXNjcmlwdGlvbjogJHt0b29sLmRlc2NyaXB0aW9ufVxcbmA7XG4gICAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IGAgIFBhcmFtZXRlcnMgU2NoZW1hIChKU09OIFNjaGVtYSBmb3JtYXQpOlxcbiAgJHtKU09OLnN0cmluZ2lmeShcbiAgICAgICAgICAgIHRvb2wucGFyYW1ldGVycyxcbiAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAyXG4gICAgICAgICAgKS5yZXBsYWNlKC9cXG4vZywgXCJcXG4gIFwiKX1cXG5gO1xuICAgICAgICB9KTtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiLS0tIEVuZCBUb29sIFVzYWdlIEd1aWRlbGluZXMgLS0tXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgPVxuICAgICAgICAgIFwiXFxuXFxuLS0tIFRvb2wgVXNhZ2UgR3VpZGVsaW5lcyAtLS1cXG5ObyB0b29scyBhcmUgY3VycmVudGx5IGF2YWlsYWJsZS5cXG4tLS0gRW5kIFRvb2wgVXNhZ2UgR3VpZGVsaW5lcyAtLS1cIjtcbiAgICAgIH1cblxuICAgICAgaWYgKGNvbWJpbmVkQmFzZVByb21wdC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgY29tYmluZWRCYXNlUHJvbXB0ID0gXCJZb3UgYXJlIGEgaGVscGZ1bCBBSSBhc3Npc3RhbnQuXCIgKyB0b29sVXNhZ2VJbnN0cnVjdGlvbnM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb21iaW5lZEJhc2VQcm9tcHQgKz0gdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoY29tYmluZWRCYXNlUHJvbXB0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgLy8gRmFsbGJhY2sgaWYgbm8gcm9sZSwgbm8gUkFHLCBhbmQgbm8gdG9vbHMgZW5hYmxlZFxuICAgICAgLy8gY29tYmluZWRCYXNlUHJvbXB0ID0gXCJZb3UgYXJlIGEgaGVscGZ1bCBBSSBhc3Npc3RhbnQuXCI7IC8vINCc0L7QttC90LAg0LfQsNC70LjRiNC40YLQuCDQv9C+0YDQvtC20L3RltC8LCDRj9C60YnQviDQvdC1INGF0L7Rh9C10LzQviDQtNC10YTQvtC70YLQvdC+0LPQvlxuICAgIH1cblxuICAgIGlmIChpc1Byb2R1Y3Rpdml0eUFjdGl2ZSAmJiBjb21iaW5lZEJhc2VQcm9tcHQgJiYgc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMpIHtcbiAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICBjb25zdCBmb3JtYXR0ZWREYXRlID0gbm93LnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHtcbiAgICAgICAgd2Vla2RheTogXCJsb25nXCIsXG4gICAgICAgIHllYXI6IFwibnVtZXJpY1wiLFxuICAgICAgICBtb250aDogXCJsb25nXCIsXG4gICAgICAgIGRheTogXCJudW1lcmljXCIsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZFRpbWUgPSBub3cudG9Mb2NhbGVUaW1lU3RyaW5nKHVuZGVmaW5lZCwgeyBob3VyOiBcIm51bWVyaWNcIiwgbWludXRlOiBcIjItZGlnaXRcIiB9KTtcbiAgICAgIGNvbWJpbmVkQmFzZVByb21wdCA9IGNvbWJpbmVkQmFzZVByb21wdC5yZXBsYWNlKC9cXFtDdXJyZW50IFRpbWVcXF0vZ2ksIGZvcm1hdHRlZFRpbWUpO1xuICAgICAgY29tYmluZWRCYXNlUHJvbXB0ID0gY29tYmluZWRCYXNlUHJvbXB0LnJlcGxhY2UoL1xcW0N1cnJlbnQgRGF0ZVxcXS9naSwgZm9ybWF0dGVkRGF0ZSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmluYWxUcmltbWVkUHJvbXB0ID0gY29tYmluZWRCYXNlUHJvbXB0LnRyaW0oKTtcbiAgICByZXR1cm4gZmluYWxUcmltbWVkUHJvbXB0Lmxlbmd0aCA+IDAgPyBmaW5hbFRyaW1tZWRQcm9tcHQgOiBudWxsO1xuICB9XG5cbiAgYXN5bmMgcHJlcGFyZVByb21wdEJvZHkoaGlzdG9yeTogTWVzc2FnZVtdLCBjaGF0TWV0YWRhdGE6IENoYXRNZXRhZGF0YSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIGNvbnN0IHNldHRpbmdzID0gdGhpcy5wbHVnaW4uc2V0dGluZ3M7XG4gICAgY29uc3Qgc2VsZWN0ZWRSb2xlUGF0aCA9XG4gICAgICBjaGF0TWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aCAhPT0gdW5kZWZpbmVkICYmIGNoYXRNZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoICE9PSBudWxsXG4gICAgICAgID8gY2hhdE1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGhcbiAgICAgICAgOiBzZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoO1xuICAgIGNvbnN0IGlzUHJvZHVjdGl2aXR5QWN0aXZlID0gYXdhaXQgdGhpcy5faXNQcm9kdWN0aXZpdHlQZXJzb25hQWN0aXZlKHNlbGVjdGVkUm9sZVBhdGgpO1xuXG4gICAgbGV0IHRhc2tDb250ZXh0ID0gXCJcIjtcbiAgICBpZiAoaXNQcm9kdWN0aXZpdHlBY3RpdmUgJiYgc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMgJiYgdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIpIHtcbiAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoZWNrQW5kUHJvY2Vzc1Rhc2tVcGRhdGU/LigpO1xuICAgICAgY29uc3QgdGFza1N0YXRlID0gdGhpcy5wbHVnaW4uY2hhdE1hbmFnZXIuZ2V0Q3VycmVudFRhc2tTdGF0ZSgpO1xuXG4gICAgICBpZiAodGFza1N0YXRlICYmIHRhc2tTdGF0ZS5oYXNDb250ZW50KSB7XG4gICAgICAgIHRhc2tDb250ZXh0ID0gXCJcXG4tLS0gVG9kYXkncyBUYXNrcyBDb250ZXh0IC0tLVxcblwiO1xuICAgICAgICB0YXNrQ29udGV4dCArPSBgVXJnZW50OiAke3Rhc2tTdGF0ZS51cmdlbnQuam9pbihcIiwgXCIpIHx8IFwiTm9uZVwifVxcbmA7XG4gICAgICAgIHRhc2tDb250ZXh0ICs9IGBPdGhlcjogJHt0YXNrU3RhdGUucmVndWxhci5qb2luKFwiLCBcIikgfHwgXCJOb25lXCJ9XFxuYDtcbiAgICAgICAgdGFza0NvbnRleHQgKz0gXCItLS0gRW5kIFRhc2tzIENvbnRleHQgLS0tXCI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYXBwcm94VGFza1Rva2VucyA9IHRoaXMuX2NvdW50VG9rZW5zKHRhc2tDb250ZXh0KTtcbiAgICBjb25zdCBtYXhSYWdUb2tlbnMgPSBzZXR0aW5ncy5yYWdFbmFibGVkID8gKChzZXR0aW5ncy5yYWdUb3BLICogc2V0dGluZ3MucmFnQ2h1bmtTaXplKSAvIDQpICogMS44IDogMDsgXG4gICAgY29uc3QgbWF4SGlzdG9yeVRva2VucyA9IHNldHRpbmdzLmNvbnRleHRXaW5kb3cgLSBhcHByb3hUYXNrVG9rZW5zIC0gbWF4UmFnVG9rZW5zIC0gMjUwO1xuXG4gICAgbGV0IHByb2Nlc3NlZEhpc3RvcnlTdHJpbmcgPSBcIlwiO1xuICAgIGlmIChpc1Byb2R1Y3Rpdml0eUFjdGl2ZSAmJiBzZXR0aW5ncy51c2VBZHZhbmNlZENvbnRleHRTdHJhdGVneSkge1xuICAgICAgcHJvY2Vzc2VkSGlzdG9yeVN0cmluZyA9IGF3YWl0IHRoaXMuX2J1aWxkQWR2YW5jZWRDb250ZXh0KGhpc3RvcnksIGNoYXRNZXRhZGF0YSwgbWF4SGlzdG9yeVRva2Vucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2Nlc3NlZEhpc3RvcnlTdHJpbmcgPSB0aGlzLl9idWlsZFNpbXBsZUNvbnRleHQoaGlzdG9yeSwgbWF4SGlzdG9yeVRva2Vucyk7XG4gICAgfVxuXG4gICAgbGV0IHJhZ0NvbnRleHQgPSBcIlwiO1xuICAgIGlmIChzZXR0aW5ncy5yYWdFbmFibGVkICYmIHRoaXMucGx1Z2luLnJhZ1NlcnZpY2UgJiYgc2V0dGluZ3MucmFnRW5hYmxlU2VtYW50aWNTZWFyY2gpIHtcbiAgICAgIGNvbnN0IGxhc3RVc2VyTWVzc2FnZSA9IGhpc3RvcnkuZmluZExhc3QobSA9PiBtLnJvbGUgPT09IFwidXNlclwiKTtcbiAgICAgIGlmIChsYXN0VXNlck1lc3NhZ2U/LmNvbnRlbnQpIHtcbiAgICAgICAgcmFnQ29udGV4dCA9IGF3YWl0IHRoaXMucGx1Z2luLnJhZ1NlcnZpY2UucHJlcGFyZUNvbnRleHQobGFzdFVzZXJNZXNzYWdlLmNvbnRlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBmaW5hbFByb21wdEJvZHlQYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAocmFnQ29udGV4dCkge1xuICAgICAgZmluYWxQcm9tcHRCb2R5UGFydHMucHVzaChyYWdDb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKHRhc2tDb250ZXh0KSB7XG4gICAgICBmaW5hbFByb21wdEJvZHlQYXJ0cy5wdXNoKHRhc2tDb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKHByb2Nlc3NlZEhpc3RvcnlTdHJpbmcpIHtcbiAgICAgIC8vINCi0LXQv9C10YAg0ZbRgdGC0L7RgNGW0Y8g0LLQttC1INC80ZbRgdGC0LjRgtGMINCy0ZbQtNGE0L7RgNC80LDRgtC+0LLQsNC90ZYg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPINC3IHJvbGU6IFwidG9vbFwiICjQtyDQvNCw0YDQutC10YDQsNC80LgpXG4gICAgICBmaW5hbFByb21wdEJvZHlQYXJ0cy5wdXNoKGAjIyMgQ29udmVyc2F0aW9uIEhpc3Rvcnk6XFxuJHtwcm9jZXNzZWRIaXN0b3J5U3RyaW5nfWApO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbmFsUHJvbXB0Qm9keSA9IGZpbmFsUHJvbXB0Qm9keVBhcnRzLmpvaW4oXCJcXG5cXG5cIikudHJpbSgpO1xuXG4gICAgaWYgKCFmaW5hbFByb21wdEJvZHkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBmaW5hbFByb21wdEJvZHk7XG4gIH1cblxuICAvLyBfYnVpbGRTaW1wbGVDb250ZXh0INGC0LAgX2J1aWxkQWR2YW5jZWRDb250ZXh0INGC0LXQv9C10YAg0LzQsNGO0YLRjCDQvtGC0YDQuNC80YPQstCw0YLQuCDQv9C+0LLRltC00L7QvNC70LXQvdC90Y9cbiAgLy8g0Lcgcm9sZTogXCJ0b29sXCIsINGP0LrRliDQstC20LUg0LLRltC00YTQvtGA0LzQsNGC0L7QstCw0L3RliDQtyDQvNCw0YDQutC10YDQsNC80LggW1RPT0xfUkVTVUxUXSDQsNCx0L4gW1RPT0xfRVJST1JdXG4gIC8vINC3INC80LXRgtC+0LTRgyBPbGxhbWFWaWV3Ll9leGVjdXRlQW5kUmVuZGVyVG9vbEN5Y2xlXG4gIHByaXZhdGUgX2J1aWxkU2ltcGxlQ29udGV4dChoaXN0b3J5OiBNZXNzYWdlW10sIG1heFRva2VuczogbnVtYmVyKTogc3RyaW5nIHtcbiAgICBsZXQgY29udGV4dCA9IFwiXCI7XG4gICAgbGV0IGN1cnJlbnRUb2tlbnMgPSAwO1xuICAgIGZvciAobGV0IGkgPSBoaXN0b3J5Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gaGlzdG9yeVtpXTtcblxuICAgICAgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJzeXN0ZW1cIiB8fCBtZXNzYWdlLnJvbGUgPT09IFwiZXJyb3JcIikgY29udGludWU7IC8vIGVycm9yINGC0YPRgiAtINGG0LUg0L/QvtC80LjQu9C60LAg0YDQtdC90LTQtdGA0LjQvdCz0YMsINCwINC90LUgVE9PTF9FUlJPUlxuXG4gICAgICBsZXQgZm9ybWF0dGVkTWVzc2FnZSA9IFwiXCI7XG4gICAgICBpZiAobWVzc2FnZS5yb2xlID09PSBcInVzZXJcIikge1xuICAgICAgICBmb3JtYXR0ZWRNZXNzYWdlID0gYFVzZXI6ICR7bWVzc2FnZS5jb250ZW50LnRyaW0oKX1gO1xuICAgICAgfSBlbHNlIGlmIChtZXNzYWdlLnJvbGUgPT09IFwiYXNzaXN0YW50XCIpIHtcbiAgICAgICAgLy8g0K/QutGJ0L4g0YbQtSDQv9C+0LLRltC00L7QvNC70LXQvdC90Y8g0LDRgdC40YHRgtC10L3RgtCwINC3IHRvb2xfY2FsbHMsINCy0L7QvdC+INC80LDRlCDQsdGD0YLQuCDQstGW0LTRhNC+0YDQvNCw0YLQvtCy0LDQvdC1INC00LvRjyBMTE1cbiAgICAgICAgLy8g0JLRltC00L/QvtCy0ZbQtNC90L4g0LTQviDQtNC+0LrRg9C80LXQvdGC0LDRhtGW0ZcgT2xsYW1hINC00LvRjyB0b29sIHVzZVxuICAgICAgICBpZiAobWVzc2FnZS50b29sX2NhbGxzICYmIG1lc3NhZ2UudG9vbF9jYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCB0b29sQ2FsbHNTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShtZXNzYWdlLnRvb2xfY2FsbHMpOyAvLyDQkNCx0L4g0ZbQvdGI0LjQuSDRhNC+0YDQvNCw0YIsINGP0LrQuNC5INC+0YfRltC60YPRlCDQvNC+0LTQtdC70YxcbiAgICAgICAgICAgIGZvcm1hdHRlZE1lc3NhZ2UgPSBgQXNzaXN0YW50Olxcbjx0b29sX2NhbGxzPlxcbiR7dG9vbENhbGxzU3RyaW5nfVxcbjwvdG9vbF9jYWxscz5gO1xuICAgICAgICAgICAgaWYgKG1lc3NhZ2UuY29udGVudCAmJiBtZXNzYWdlLmNvbnRlbnQudHJpbSgpICE9PSBcIlwiKSB7XG4gICAgICAgICAgICAgICAgIC8vINCU0L7QtNCw0ZTQvNC+INGC0LXQutGB0YLQvtCy0LjQuSDQutC+0L3RgtC10L3Rgiwg0Y/QutGJ0L4g0LLRltC9INGUINGA0LDQt9C+0Lwg0LcgdG9vbF9jYWxsc1xuICAgICAgICAgICAgICAgICBmb3JtYXR0ZWRNZXNzYWdlID0gYEFzc2lzdGFudDogJHttZXNzYWdlLmNvbnRlbnQudHJpbSgpfVxcbjx0b29sX2NhbGxzPlxcbiR7dG9vbENhbGxzU3RyaW5nfVxcbjwvdG9vbF9jYWxscz5gO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9ybWF0dGVkTWVzc2FnZSA9IGBBc3Npc3RhbnQ6ICR7bWVzc2FnZS5jb250ZW50LnRyaW0oKX1gO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJ0b29sXCIpIHtcbiAgICAgICAgLy8g0J/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPICd0b29sJyDQstC20LUg0LzQsNGUINC80ZbRgdGC0LjRgtC4INC80LDRgNC60LXRgNC4IFtUT09MX1JFU1VMVF0g0LDQsdC+IFtUT09MX0VSUk9SXVxuICAgICAgICAvLyDRgyDRgdCy0L7RlNC80YMgbWVzc2FnZS5jb250ZW50LCDQtNC+0LTQsNC90ZYg0LIgT2xsYW1hVmlld1xuICAgICAgICBmb3JtYXR0ZWRNZXNzYWdlID0gYDxtZXNzYWdlIHJvbGU9XCJ0b29sXCIgdG9vbF9jYWxsX2lkPVwiJHttZXNzYWdlLnRvb2xfY2FsbF9pZH1cIiBuYW1lPVwiJHttZXNzYWdlLm5hbWV9XCI+XFxuJHttZXNzYWdlLmNvbnRlbnQudHJpbSgpfVxcbjwvbWVzc2FnZT5gO1xuICAgICAgfVxuICAgICAgXG4gICAgICBjb25zdCBtZXNzYWdlVG9rZW5zID0gdGhpcy5fY291bnRUb2tlbnMoZm9ybWF0dGVkTWVzc2FnZSkgKyA1OyAvLyArNSDQtNC70Y8g0L/RgNC40LHQu9C40LfQvdC40YUg0YLQvtC60LXQvdGW0LIg0L3QsCDRgNC+0LvRjC/QvdC+0LLRgyDQu9GW0L3RltGOXG4gICAgICBpZiAoY3VycmVudFRva2VucyArIG1lc3NhZ2VUb2tlbnMgPD0gbWF4VG9rZW5zKSB7XG4gICAgICAgIGNvbnRleHQgPSBmb3JtYXR0ZWRNZXNzYWdlICsgXCJcXG5cXG5cIiArIGNvbnRleHQ7XG4gICAgICAgIGN1cnJlbnRUb2tlbnMgKz0gbWVzc2FnZVRva2VucztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29udGV4dC50cmltKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIF9idWlsZEFkdmFuY2VkQ29udGV4dChcbiAgICBoaXN0b3J5OiBNZXNzYWdlW10sXG4gICAgY2hhdE1ldGFkYXRhOiBDaGF0TWV0YWRhdGEsXG4gICAgbWF4VG9rZW5zOiBudW1iZXJcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMucGx1Z2luLnNldHRpbmdzO1xuICAgIGNvbnN0IHByb2Nlc3NlZFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjdXJyZW50VG9rZW5zID0gMDtcblxuICAgIGNvbnN0IGtlZXBOID0gTWF0aC5tYXgoMCwgc2V0dGluZ3Mua2VlcExhc3ROTWVzc2FnZXNCZWZvcmVTdW1tYXJ5IHx8IDMpO1xuICAgIGNvbnN0IGFjdHVhbEtlZXBOID0gTWF0aC5taW4oaGlzdG9yeS5sZW5ndGgsIGtlZXBOKTtcbiAgICBjb25zdCBtZXNzYWdlc1RvS2VlcCA9IGhpc3Rvcnkuc2xpY2UoLWFjdHVhbEtlZXBOKTtcbiAgICBjb25zdCBtZXNzYWdlc1RvUHJvY2VzcyA9IGhpc3Rvcnkuc2xpY2UoMCwgLWFjdHVhbEtlZXBOKTtcblxuICAgIGlmIChtZXNzYWdlc1RvUHJvY2Vzcy5sZW5ndGggPiAwKSB7XG4gICAgICBsZXQgb2xkZXJDb250ZXh0VG9rZW5zID0gMDtcbiAgICAgIGxldCBvbGRlckNvbnRleHRDb250ZW50ID0gXCJcIjtcblxuICAgICAgaWYgKHNldHRpbmdzLmVuYWJsZVN1bW1hcml6YXRpb24pIHtcbiAgICAgICAgY29uc3Qgc3VtbWFyeSA9IGF3YWl0IHRoaXMuX3N1bW1hcml6ZU1lc3NhZ2VzKG1lc3NhZ2VzVG9Qcm9jZXNzLCBjaGF0TWV0YWRhdGEpO1xuICAgICAgICBpZiAoc3VtbWFyeSkge1xuICAgICAgICAgIG9sZGVyQ29udGV4dENvbnRlbnQgPSBgW1N1bW1hcnkgb2YgZWFybGllciBjb252ZXJzYXRpb25dOlxcbiR7c3VtbWFyeX1gO1xuICAgICAgICAgIG9sZGVyQ29udGV4dFRva2VucyA9IHRoaXMuX2NvdW50VG9rZW5zKG9sZGVyQ29udGV4dENvbnRlbnQpICsgMTA7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCFvbGRlckNvbnRleHRDb250ZW50KSB7XG4gICAgICAgIGxldCBpbmNsdWRlZE9sZGVyQ291bnQgPSAwO1xuICAgICAgICAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INGC0YMg0LYg0LvQvtCz0ZbQutGDINGE0L7RgNC80LDRgtGD0LLQsNC90L3Rjywg0YnQviDQuSDRgyBfYnVpbGRTaW1wbGVDb250ZXh0XG4gICAgICAgIGZvciAobGV0IGkgPSBtZXNzYWdlc1RvUHJvY2Vzcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBtZXNzYWdlc1RvUHJvY2Vzc1tpXTtcbiAgICAgICAgICBpZiAobWVzc2FnZS5yb2xlID09PSBcInN5c3RlbVwiIHx8IG1lc3NhZ2Uucm9sZSA9PT0gXCJlcnJvclwiKSBjb250aW51ZTtcbiAgICAgICAgICBcbiAgICAgICAgICBsZXQgZm9ybWF0dGVkTWVzc2FnZSA9IFwiXCI7XG4gICAgICAgICAgLy8gLi4uICjRgtCw0LrQsCDQtiDQu9C+0LPRltC60LAg0YTQvtGA0LzQsNGC0YPQstCw0L3QvdGPIHVzZXIvYXNzaXN0YW50L3Rvb2wsINGP0Log0YMgX2J1aWxkU2ltcGxlQ29udGV4dCkgLi4uXG4gICAgICAgICAgICBpZiAobWVzc2FnZS5yb2xlID09PSBcInVzZXJcIikge1xuICAgICAgICAgICAgICAgIGZvcm1hdHRlZE1lc3NhZ2UgPSBgVXNlcjogJHttZXNzYWdlLmNvbnRlbnQudHJpbSgpfWA7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJhc3Npc3RhbnRcIikge1xuICAgICAgICAgICAgICAgIGlmIChtZXNzYWdlLnRvb2xfY2FsbHMgJiYgbWVzc2FnZS50b29sX2NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG9vbENhbGxzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkobWVzc2FnZS50b29sX2NhbGxzKTtcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGVkTWVzc2FnZSA9IGBBc3Npc3RhbnQ6XFxuPHRvb2xfY2FsbHM+XFxuJHt0b29sQ2FsbHNTdHJpbmd9XFxuPC90b29sX2NhbGxzPmA7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtZXNzYWdlLmNvbnRlbnQgJiYgbWVzc2FnZS5jb250ZW50LnRyaW0oKSAhPT0gXCJcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGVkTWVzc2FnZSA9IGBBc3Npc3RhbnQ6ICR7bWVzc2FnZS5jb250ZW50LnRyaW0oKX1cXG48dG9vbF9jYWxscz5cXG4ke3Rvb2xDYWxsc1N0cmluZ31cXG48L3Rvb2xfY2FsbHM+YDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRlZE1lc3NhZ2UgPSBgQXNzaXN0YW50OiAke21lc3NhZ2UuY29udGVudC50cmltKCl9YDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJ0b29sXCIpIHtcbiAgICAgICAgICAgICAgICBmb3JtYXR0ZWRNZXNzYWdlID0gYDxtZXNzYWdlIHJvbGU9XCJ0b29sXCIgdG9vbF9jYWxsX2lkPVwiJHttZXNzYWdlLnRvb2xfY2FsbF9pZH1cIiBuYW1lPVwiJHttZXNzYWdlLm5hbWV9XCI+XFxuJHttZXNzYWdlLmNvbnRlbnQudHJpbSgpfVxcbjwvbWVzc2FnZT5gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgbWVzc2FnZVRva2VucyA9IHRoaXMuX2NvdW50VG9rZW5zKGZvcm1hdHRlZE1lc3NhZ2UpICsgNTtcblxuICAgICAgICAgIGlmIChjdXJyZW50VG9rZW5zICsgb2xkZXJDb250ZXh0VG9rZW5zICsgbWVzc2FnZVRva2VucyA8PSBtYXhUb2tlbnMpIHtcbiAgICAgICAgICAgIG9sZGVyQ29udGV4dENvbnRlbnQgPSBmb3JtYXR0ZWRNZXNzYWdlICsgXCJcXG5cXG5cIiArIG9sZGVyQ29udGV4dENvbnRlbnQ7XG4gICAgICAgICAgICBvbGRlckNvbnRleHRUb2tlbnMgKz0gbWVzc2FnZVRva2VucztcbiAgICAgICAgICAgIGluY2x1ZGVkT2xkZXJDb3VudCsrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGluY2x1ZGVkT2xkZXJDb3VudCA+IDApIHtcbiAgICAgICAgICBvbGRlckNvbnRleHRDb250ZW50ID0gYFtTdGFydCBvZiBvbGRlciBtZXNzYWdlcyBkaXJlY3RseSBpbmNsdWRlZF06XFxuJHtvbGRlckNvbnRleHRDb250ZW50LnRyaW0oKX1cXG5bRW5kIG9mIG9sZGVyIG1lc3NhZ2VzXWA7XG4gICAgICAgICAgb2xkZXJDb250ZXh0VG9rZW5zICs9IDEwOyBcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAob2xkZXJDb250ZXh0Q29udGVudCAmJiBjdXJyZW50VG9rZW5zICsgb2xkZXJDb250ZXh0VG9rZW5zIDw9IG1heFRva2Vucykge1xuICAgICAgICBwcm9jZXNzZWRQYXJ0cy5wdXNoKG9sZGVyQ29udGV4dENvbnRlbnQpO1xuICAgICAgICBjdXJyZW50VG9rZW5zICs9IG9sZGVyQ29udGV4dFRva2VucztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQga2VwdE1lc3NhZ2VzU3RyaW5nID0gXCJcIjtcbiAgICBsZXQga2VwdE1lc3NhZ2VzVG9rZW5zID0gMDtcbiAgICAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INGC0YMg0LYg0LvQvtCz0ZbQutGDINGE0L7RgNC80LDRgtGD0LLQsNC90L3Rjywg0YnQviDQuSDRgyBfYnVpbGRTaW1wbGVDb250ZXh0XG4gICAgZm9yIChsZXQgaSA9IG1lc3NhZ2VzVG9LZWVwLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBtZXNzYWdlc1RvS2VlcFtpXTtcbiAgICAgICAgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJzeXN0ZW1cIiB8fCBtZXNzYWdlLnJvbGUgPT09IFwiZXJyb3JcIikgY29udGludWU7XG4gICAgICAgIFxuICAgICAgICBsZXQgZm9ybWF0dGVkTWVzc2FnZSA9IFwiXCI7XG4gICAgICAgIC8vIC4uLiAo0YLQsNC60LAg0LYg0LvQvtCz0ZbQutCwINGE0L7RgNC80LDRgtGD0LLQsNC90L3RjyB1c2VyL2Fzc2lzdGFudC90b29sLCDRj9C6INGDIF9idWlsZFNpbXBsZUNvbnRleHQpIC4uLlxuICAgICAgICBpZiAobWVzc2FnZS5yb2xlID09PSBcInVzZXJcIikge1xuICAgICAgICAgICAgZm9ybWF0dGVkTWVzc2FnZSA9IGBVc2VyOiAke21lc3NhZ2UuY29udGVudC50cmltKCl9YDtcbiAgICAgICAgfSBlbHNlIGlmIChtZXNzYWdlLnJvbGUgPT09IFwiYXNzaXN0YW50XCIpIHtcbiAgICAgICAgICAgIGlmIChtZXNzYWdlLnRvb2xfY2FsbHMgJiYgbWVzc2FnZS50b29sX2NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0b29sQ2FsbHNTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShtZXNzYWdlLnRvb2xfY2FsbHMpO1xuICAgICAgICAgICAgICAgIGZvcm1hdHRlZE1lc3NhZ2UgPSBgQXNzaXN0YW50Olxcbjx0b29sX2NhbGxzPlxcbiR7dG9vbENhbGxzU3RyaW5nfVxcbjwvdG9vbF9jYWxscz5gO1xuICAgICAgICAgICAgICAgIGlmIChtZXNzYWdlLmNvbnRlbnQgJiYgbWVzc2FnZS5jb250ZW50LnRyaW0oKSAhPT0gXCJcIikge1xuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0ZWRNZXNzYWdlID0gYEFzc2lzdGFudDogJHttZXNzYWdlLmNvbnRlbnQudHJpbSgpfVxcbjx0b29sX2NhbGxzPlxcbiR7dG9vbENhbGxzU3RyaW5nfVxcbjwvdG9vbF9jYWxscz5gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZm9ybWF0dGVkTWVzc2FnZSA9IGBBc3Npc3RhbnQ6ICR7bWVzc2FnZS5jb250ZW50LnRyaW0oKX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJ0b29sXCIpIHtcbiAgICAgICAgICAgIGZvcm1hdHRlZE1lc3NhZ2UgPSBgPG1lc3NhZ2Ugcm9sZT1cInRvb2xcIiB0b29sX2NhbGxfaWQ9XCIke21lc3NhZ2UudG9vbF9jYWxsX2lkfVwiIG5hbWU9XCIke21lc3NhZ2UubmFtZX1cIj5cXG4ke21lc3NhZ2UuY29udGVudC50cmltKCl9XFxuPC9tZXNzYWdlPmA7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBtZXNzYWdlVG9rZW5zID0gdGhpcy5fY291bnRUb2tlbnMoZm9ybWF0dGVkTWVzc2FnZSkgKyA1O1xuXG4gICAgICAgIGlmIChjdXJyZW50VG9rZW5zICsga2VwdE1lc3NhZ2VzVG9rZW5zICsgbWVzc2FnZVRva2VucyA8PSBtYXhUb2tlbnMpIHtcbiAgICAgICAgICAgIGtlcHRNZXNzYWdlc1N0cmluZyA9IGZvcm1hdHRlZE1lc3NhZ2UgKyBcIlxcblxcblwiICsga2VwdE1lc3NhZ2VzU3RyaW5nO1xuICAgICAgICAgICAga2VwdE1lc3NhZ2VzVG9rZW5zICs9IG1lc3NhZ2VUb2tlbnM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgaWYgKGtlcHRNZXNzYWdlc1N0cmluZykge1xuICAgICAgcHJvY2Vzc2VkUGFydHMucHVzaChrZXB0TWVzc2FnZXNTdHJpbmcudHJpbSgpKTtcbiAgICAgIGN1cnJlbnRUb2tlbnMgKz0ga2VwdE1lc3NhZ2VzVG9rZW5zO1xuICAgIH1cblxuICAgIHJldHVybiBwcm9jZXNzZWRQYXJ0cy5qb2luKFwiXFxuXFxuXCIpLnRyaW0oKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgX3N1bW1hcml6ZU1lc3NhZ2VzKG1lc3NhZ2VzVG9TdW1tYXJpemU6IE1lc3NhZ2VbXSwgY2hhdE1ldGFkYXRhOiBDaGF0TWV0YWRhdGEpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICBpZiAoIXRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVN1bW1hcml6YXRpb24gfHwgbWVzc2FnZXNUb1N1bW1hcml6ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vINCk0L7RgNC80LDRgtGD0ZTQvNC+INGW0YHRgtC+0YDRltGOINC00LvRjyDRgdGD0LzQsNGA0LjQt9Cw0YbRltGXINGC0LDQuiDRgdCw0LzQviwg0Y/QuiDQtNC70Y8g0L7RgdC90L7QstC90L7Qs9C+INC60L7QvdGC0LXQutGB0YLRg1xuICAgIGNvbnN0IHRleHRUb1N1bW1hcml6ZSA9IG1lc3NhZ2VzVG9TdW1tYXJpemVcbiAgICAgIC5maWx0ZXIobSA9PiBtLnJvbGUgPT09IFwidXNlclwiIHx8IG0ucm9sZSA9PT0gXCJhc3Npc3RhbnRcIiB8fCBtLnJvbGUgPT09IFwidG9vbFwiKVxuICAgICAgLm1hcChtID0+IHtcbiAgICAgICAgaWYgKG0ucm9sZSA9PT0gXCJ1c2VyXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBgVXNlcjogJHttLmNvbnRlbnQudHJpbSgpfWA7XG4gICAgICAgIH0gZWxzZSBpZiAobS5yb2xlID09PSBcImFzc2lzdGFudFwiKSB7XG4gICAgICAgICAgICBpZiAobS50b29sX2NhbGxzICYmIG0udG9vbF9jYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9vbENhbGxzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkobS50b29sX2NhbGxzKTtcbiAgICAgICAgICAgICAgICBsZXQgY29udGVudFBhcnQgPSBtLmNvbnRlbnQgJiYgbS5jb250ZW50LnRyaW0oKSAhPT0gXCJcIiA/IGAke20uY29udGVudC50cmltKCl9XFxuYCA6IFwiXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBBc3Npc3RhbnQ6ICR7Y29udGVudFBhcnR9PHRvb2xfY2FsbHM+XFxuJHt0b29sQ2FsbHNTdHJpbmd9XFxuPC90b29sX2NhbGxzPmA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gYEFzc2lzdGFudDogJHttLmNvbnRlbnQudHJpbSgpfWA7XG4gICAgICAgIH0gZWxzZSBpZiAobS5yb2xlID09PSBcInRvb2xcIikge1xuICAgICAgICAgICAgLy8g0J/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPICd0b29sJyDQstC20LUg0LzQsNGO0YLRjCDQvNCw0YDQutC10YDQuFxuICAgICAgICAgICAgcmV0dXJuIGA8bWVzc2FnZSByb2xlPVwidG9vbFwiIHRvb2xfY2FsbF9pZD1cIiR7bS50b29sX2NhbGxfaWR9XCIgbmFtZT1cIiR7bS5uYW1lfVwiPlxcbiR7bS5jb250ZW50LnRyaW0oKX1cXG48L21lc3NhZ2U+YDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gXCJcIjsgLy8g0J3QsCDQstC40L/QsNC00L7QuiDQvdC10L/QtdGA0LXQtNCx0LDRh9C10L3QuNGFINGA0L7Qu9C10LlcbiAgICAgIH0pXG4gICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAuam9pbihcIlxcblwiKTtcblxuICAgIGlmICghdGV4dFRvU3VtbWFyaXplLnRyaW0oKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgc3VtbWFyaXphdGlvblByb21wdFRlbXBsYXRlID1cbiAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN1bW1hcml6YXRpb25Qcm9tcHQgfHxcbiAgICAgIFwiU3VtbWFyaXplIHRoZSBmb2xsb3dpbmcgY29udmVyc2F0aW9uIGNvbmNpc2VseSwgcHJlc2VydmluZyBrZXkgaW5mb3JtYXRpb24gYW5kIHRvb2wgdXNhZ2UgY29udGV4dDpcXG5cXG57dGV4dF90b19zdW1tYXJpemV9XCI7XG4gICAgY29uc3Qgc3VtbWFyaXphdGlvbkZ1bGxQcm9tcHQgPSBzdW1tYXJpemF0aW9uUHJvbXB0VGVtcGxhdGUucmVwbGFjZShcInt0ZXh0X3RvX3N1bW1hcml6ZX1cIiwgdGV4dFRvU3VtbWFyaXplKTtcblxuICAgIGNvbnN0IHN1bW1hcml6YXRpb25Nb2RlbE5hbWUgPVxuICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvbk1vZGVsTmFtZSB8fCBjaGF0TWV0YWRhdGEubW9kZWxOYW1lIHx8IHRoaXMucGx1Z2luLnNldHRpbmdzLm1vZGVsTmFtZTtcbiAgICBjb25zdCBzdW1tYXJpemF0aW9uQ29udGV4dFdpbmRvdyA9IE1hdGgubWluKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3cgfHwgNDA5NiwgNDA5Nik7XG5cbiAgICBjb25zdCByZXF1ZXN0Qm9keSA9IHtcbiAgICAgIG1vZGVsOiBzdW1tYXJpemF0aW9uTW9kZWxOYW1lLFxuICAgICAgcHJvbXB0OiBzdW1tYXJpemF0aW9uRnVsbFByb21wdCxcbiAgICAgIHN0cmVhbTogZmFsc2UsXG4gICAgICB0ZW1wZXJhdHVyZTogMC4zLFxuICAgICAgb3B0aW9uczogeyBudW1fY3R4OiBzdW1tYXJpemF0aW9uQ29udGV4dFdpbmRvdywgfSxcbiAgICAgIHN5c3RlbTpcbiAgICAgICAgXCJZb3UgYXJlIGEgaGVscGZ1bCBhc3Npc3RhbnQgc3BlY2lhbGl6aW5nIGluIGNvbmNpc2VseSBzdW1tYXJpemluZyBjb252ZXJzYXRpb24gaGlzdG9yeS4gRm9jdXMgb24gZXh0cmFjdGluZyBrZXkgcG9pbnRzLCBkZWNpc2lvbnMsIHVucmVzb2x2ZWQgcXVlc3Rpb25zLCBhbmQgdGhlIGNvbnRleHQgb2YgYW55IHRvb2wgY2FsbHMgYW5kIHRoZWlyIHJlc3VsdHMuXCIsXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBpZiAoIXRoaXMucGx1Z2luLm9sbGFtYVNlcnZpY2UpIHJldHVybiBudWxsO1xuICAgICAgY29uc3QgcmVzcG9uc2VEYXRhOiBPbGxhbWFHZW5lcmF0ZVJlc3BvbnNlID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZW5lcmF0ZVJhdyhyZXF1ZXN0Qm9keSk7XG4gICAgICBpZiAocmVzcG9uc2VEYXRhICYmIHR5cGVvZiByZXNwb25zZURhdGEucmVzcG9uc2UgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlRGF0YS5yZXNwb25zZS50cmltKCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG59Il19