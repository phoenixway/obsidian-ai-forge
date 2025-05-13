import { __awaiter } from "tslib";
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
    /**
     * ОНОВЛЕНО: Повертає фінальний системний промпт для API, включаючи нові RAG інструкції
     * та дефолтний промпт для використання інструментів, якщо іншого немає.
     */
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
                if (roleDefinition === null || roleDefinition === void 0 ? void 0 : roleDefinition.systemPrompt) {
                }
                else {
                }
            }
            else {
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
                    toolUsageInstructions +=
                        "If you decide to use a tool, you MUST respond ONLY with a single JSON object representing the tool call, enclosed in <tool_call></tool_call> XML-like tags. Do NOT add any other text, explanation, or markdown formatting before or after these tags.\n";
                    toolUsageInstructions +=
                        "The JSON object must have a 'name' property with the tool's name and an 'arguments' property containing an object of parameters for that tool.\n";
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
    /**
     * Готує ТІЛО основного промпту (без системного), включаючи історію, контекст завдань та RAG.
     * Використовує оновлений `prepareContext` з `RagService`.
     */
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
                else {
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
                    if (!ragContext) {
                    }
                    else {
                    }
                }
                else {
                }
            }
            else {
            }
            let finalPromptBodyParts = [];
            if (ragContext) {
                finalPromptBodyParts.push(ragContext);
            }
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
        });
    }
    _buildSimpleContext(history, maxTokens) {
        let context = "";
        let currentTokens = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            if (message.role === "system" || message.role === "error")
                continue;
            const formattedMessage = `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`;
            const messageTokens = this._countTokens(formattedMessage) + 5;
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
                    else {
                    }
                }
                if (!olderContextContent) {
                    let includedOlderCount = 0;
                    for (let i = messagesToProcess.length - 1; i >= 0; i--) {
                        const message = messagesToProcess[i];
                        if (message.role === "system" || message.role === "error")
                            continue;
                        const formattedMessage = `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`;
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
                else if (olderContextContent) {
                }
            }
            let keptMessagesString = "";
            let keptMessagesTokens = 0;
            let includedKeptCount = 0;
            for (let i = messagesToKeep.length - 1; i >= 0; i--) {
                const message = messagesToKeep[i];
                if (message.role === "system" || message.role === "error")
                    continue;
                const formattedMessage = `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`;
                const messageTokens = this._countTokens(formattedMessage) + 5;
                if (currentTokens + keptMessagesTokens + messageTokens <= maxTokens) {
                    keptMessagesString = formattedMessage + "\n\n" + keptMessagesString;
                    keptMessagesTokens += messageTokens;
                    includedKeptCount++;
                }
                else {
                    break;
                }
            }
            if (keptMessagesString) {
                processedParts.push(keptMessagesString.trim());
                currentTokens += keptMessagesTokens;
            }
            else {
            }
            return processedParts.join("\n\n").trim();
        });
    }
    _summarizeMessages(messagesToSummarize, chatMetadata) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0) {
                return null;
            }
            const textToSummarize = messagesToSummarize
                .filter(m => m.role === "user" || m.role === "assistant")
                .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.trim()}`)
                .join("\n");
            if (!textToSummarize.trim()) {
                return null;
            }
            const summarizationPromptTemplate = this.plugin.settings.summarizationPrompt ||
                "Summarize the following conversation concisely:\n\n{text_to_summarize}";
            const summarizationFullPrompt = summarizationPromptTemplate.replace("{text_to_summarize}", textToSummarize);
            const summarizationModelName = this.plugin.settings.summarizationModelName || chatMetadata.modelName || this.plugin.settings.modelName;
            const summarizationContextWindow = Math.min(this.plugin.settings.contextWindow || 4096, 4096);
            const requestBody = {
                model: summarizationModelName,
                prompt: summarizationFullPrompt,
                stream: false,
                temperature: 0.3,
                options: {
                    num_ctx: summarizationContextWindow,
                },
                system: "You are a helpful assistant specializing in concisely summarizing conversation history. Focus on extracting key points, decisions, and unresolved questions.",
            };
            try {
                if (!this.plugin.ollamaService) {
                    return null;
                }
                const responseData = yield this.plugin.ollamaService.generateRaw(requestBody);
                if (responseData && typeof responseData.response === "string") {
                    const summary = responseData.response.trim();
                    return summary;
                }
                else {
                    return null;
                }
            }
            catch (error) {
                return null;
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJvbXB0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIlByb21wdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBTyxhQUFhLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBb0IsTUFBTSxVQUFVLENBQUM7QUFLL0UsTUFBTSxPQUFPLGFBQWE7SUFReEIsWUFBWSxNQUFvQjtRQUx4Qix3QkFBbUIsR0FBa0IsSUFBSSxDQUFDO1FBQzFDLG9CQUFlLEdBQWtCLElBQUksQ0FBQztRQUN0QyxjQUFTLEdBQW1DLEVBQUUsQ0FBQztRQUMvQyxzQkFBaUIsR0FBd0IsRUFBRSxDQUFDO1FBR2xELElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxHQUFHLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUN4QixDQUFDO0lBRU8sWUFBWSxDQUFDLElBQVk7UUFDL0IsSUFBSSxDQUFDLElBQUk7WUFBRSxPQUFPLENBQUMsQ0FBQztRQUNwQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRUQsY0FBYztRQUNaLElBQUksQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1FBQ3BCLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBQzVCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7SUFDbEMsQ0FBQztJQUVELHNCQUFzQjtRQUNwQixJQUFJLENBQUMsaUJBQWlCLEdBQUcsRUFBRSxDQUFDO0lBQzlCLENBQUM7SUFFSyxpQkFBaUIsQ0FBQyxRQUFtQzs7O1lBQ3pELE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFFakUsSUFBSSxjQUFjLEtBQUssSUFBSSxDQUFDLGVBQWUsSUFBSSxjQUFj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T0FBTyxJQUFJLENBQUM7Z0JBQ2QsQ0FBQztnQkFFRCxNQUFNLFlBQVksR0FBMkIsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBRXRHLElBQUksWUFBWSxJQUFJLE9BQU8sWUFBWSxDQUFDLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDOUQsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDN0MsT0FBTyxPQUFPLENBQUM7Z0JBQ2pCLENBQUM7cUJBQU0sQ0FBQztvQkFDTixPQUFPLElBQUksQ0FBQztnQkFDZCxDQUFDO1lBQ0gsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxJQUFJLENBQUM7WUFDZCxDQUFDO1FBQ0gsQ0FBQztLQUFBO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIG5vcm1hbGl6ZVBhdGgsIFRGaWxlLCBOb3RpY2UsIEZyb250TWF0dGVyQ2FjaGUgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCBPbGxhbWFQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xuaW1wb3J0IHsgTWVzc2FnZSwgTWVzc2FnZVJvbGUsIE9sbGFtYUdlbmVyYXRlUmVzcG9uc2UsIFJvbGVEZWZpbml0aW9uIH0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IENoYXRNZXRhZGF0YSB9IGZyb20gXCIuL0NoYXRcIjtcblxuZXhwb3J0IGNsYXNzIFByb21wdFNlcnZpY2Uge1xuICBwcml2YXRlIHBsdWdpbjogT2xsYW1hUGx1Z2luO1xuICBwcml2YXRlIGFwcDogQXBwO1xuICBwcml2YXRlIGN1cnJlbnRTeXN0ZW1Qcm9tcHQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGN1cnJlbnRSb2xlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcm9sZUNhY2hlOiBSZWNvcmQ8c3RyaW5nLCBSb2xlRGVmaW5pdGlvbj4gPSB7fTtcbiAgcHJpdmF0ZSBtb2RlbERldGFpbHNDYWNoZTogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9O1xuXG4gIGNvbnN0cnVjdG9yKHBsdWdpbjogT2xsYW1hUGx1Z2luKSB7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gICAgdGhpcy5hcHAgPSBwbHVnaW4uYXBwO1xuICB9XG5cbiAgcHJpdmF0ZSBfY291bnRUb2tlbnModGV4dDogc3RyaW5nKTogbnVtYmVyIHtcbiAgICBpZiAoIXRleHQpIHJldHVybiAwO1xuICAgIHJldHVybiBNYXRoLmNlaWwodGV4dC5sZW5ndGggLyA0KTtcbiAgfVxuXG4gIGNsZWFyUm9sZUNhY2hlKCk6IHZvaWQge1xuICAgIHRoaXMucm9sZUNhY2hlID0ge307XG4gICAgdGhpcy5jdXJyZW50Um9sZVBhdGggPSBudWxsO1xuICAgIHRoaXMuY3VycmVudFN5c3RlbVByb21wdCA9IG51bGw7XG4gIH1cblxuICBjbGVhck1vZGVsRGV0YWlsc0NhY2hlKCk6IHZvaWQge1xuICAgIHRoaXMubW9kZWxEZXRhaWxzQ2FjaGUgPSB7fTtcbiAgfVxuXG4gIGFzeW5jIGdldFJvbGVEZWZpbml0aW9uKHJvbGVQYXRoOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxSb2xlRGVmaW5pdGlvbiB8IG51bGw+IHtcbiAgICBjb25zdCBub3JtYWxpemVkUGF0aCA9IHJvbGVQYXRoID8gbm9ybWFsaXplUGF0aChyb2xlUGF0aCkgOiBudWxsO1xuXG4gICAgaWYgKG5vcm1hbGl6ZWRQYXRoID09PSB0aGlzLmN1cnJlbnRSb2xlUGF0aCAmJiBub3JtYWxpemVkUGF0aCAmJiB0aGlzLnJvbGVDYWNoZVtub3JtYWxpemVkUGF0aF0pIHtcbiAgICAgIHJldHVybiB0aGlzLnJvbGVDYWNoZVtub3JtYWxpemVkUGF0aF07XG4gICAgfVxuXG4gICAgaWYgKG5vcm1hbGl6ZWRQYXRoICE9PSB0aGlzLmN1cnJlbnRSb2xlUGF0aCkge1xuICAgICAgaWYgKHRoaXMuY3VycmVudFJvbGVQYXRoICYmIHRoaXMucm9sZUNhY2hlW3RoaXMuY3VycmVudFJvbGVQYXRoXSkge1xuICAgICAgICBkZWxldGUgdGhpcy5yb2xlQ2FjaGVbdGhpcy5jdXJyZW50Um9sZVBhdGhdO1xuICAgICAgfVxuICAgICAgdGhpcy5jdXJyZW50Um9sZVBhdGggPSBub3JtYWxpemVkUGF0aDtcbiAgICAgIHRoaXMuY3VycmVudFN5c3RlbVByb21wdCA9IG51bGw7XG4gICAgfVxuXG4gICAgaWYgKCFub3JtYWxpemVkUGF0aCB8fCAhdGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9sbG93Um9sZSkge1xuICAgICAgY29uc3QgZGVmaW5pdGlvbjogUm9sZURlZmluaXRpb24gPSB7XG4gICAgICAgIHN5c3RlbVByb21wdDogbnVsbCxcblxuICAgICAgICBpc1Byb2R1Y3Rpdml0eVBlcnNvbmE6IGZhbHNlLFxuICAgICAgfTtcbiAgICAgIHJldHVybiBkZWZpbml0aW9uO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnJvbGVDYWNoZVtub3JtYWxpemVkUGF0aF0pIHtcbiAgICAgIHRoaXMuY3VycmVudFN5c3RlbVByb21wdCA9IHRoaXMucm9sZUNhY2hlW25vcm1hbGl6ZWRQYXRoXS5zeXN0ZW1Qcm9tcHQ7XG4gICAgICByZXR1cm4gdGhpcy5yb2xlQ2FjaGVbbm9ybWFsaXplZFBhdGhdO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobm9ybWFsaXplZFBhdGgpO1xuXG4gICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZmlsZUNhY2hlID0gdGhpcy5hcHAubWV0YWRhdGFDYWNoZS5nZXRGaWxlQ2FjaGUoZmlsZSk7XG4gICAgICAgIGNvbnN0IGZyb250bWF0dGVyID0gZmlsZUNhY2hlPy5mcm9udG1hdHRlcjtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XG4gICAgICAgIGNvbnN0IHN5c3RlbVByb21wdEJvZHkgPSBmaWxlQ2FjaGU/LmZyb250bWF0dGVyUG9zaXRpb24/LmVuZFxuICAgICAgICAgID8gY29udGVudC5zdWJzdHJpbmcoZmlsZUNhY2hlLmZyb250bWF0dGVyUG9zaXRpb24uZW5kLm9mZnNldCkudHJpbSgpXG4gICAgICAgICAgOiBjb250ZW50LnRyaW0oKTtcblxuICAgICAgICBjb25zdCBpc1Byb2R1Y3Rpdml0eSA9XG4gICAgICAgICAgZnJvbnRtYXR0ZXI/LmFzc2lzdGFudF90eXBlPy50b0xvd2VyQ2FzZSgpID09PSBcInByb2R1Y3Rpdml0eVwiIHx8IGZyb250bWF0dGVyPy5pc19wbGFubmVyID09PSB0cnVlO1xuXG4gICAgICAgIGNvbnN0IGRlZmluaXRpb246IFJvbGVEZWZpbml0aW9uID0ge1xuICAgICAgICAgIHN5c3RlbVByb21wdDogc3lzdGVtUHJvbXB0Qm9keSB8fCBudWxsLFxuICAgICAgICAgIGlzUHJvZHVjdGl2aXR5UGVyc29uYTogaXNQcm9kdWN0aXZpdHksXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5yb2xlQ2FjaGVbbm9ybWFsaXplZFBhdGhdID0gZGVmaW5pdGlvbjtcbiAgICAgICAgdGhpcy5jdXJyZW50U3lzdGVtUHJvbXB0ID0gZGVmaW5pdGlvbi5zeXN0ZW1Qcm9tcHQ7XG4gICAgICAgIHJldHVybiBkZWZpbml0aW9uO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgbG9hZGluZyByb2xlOiAke2ZpbGUuYmFzZW5hbWV9LiBDaGVjayBjb25zb2xlLmApO1xuICAgICAgICB0aGlzLmN1cnJlbnRTeXN0ZW1Qcm9tcHQgPSBudWxsO1xuXG4gICAgICAgIHJldHVybiB7IHN5c3RlbVByb21wdDogbnVsbCwgaXNQcm9kdWN0aXZpdHlQZXJzb25hOiBmYWxzZSB9O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmN1cnJlbnRTeXN0ZW1Qcm9tcHQgPSBudWxsO1xuICAgICAgcmV0dXJuIHsgc3lzdGVtUHJvbXB0OiBudWxsLCBpc1Byb2R1Y3Rpdml0eVBlcnNvbmE6IGZhbHNlIH07XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBfaXNQcm9kdWN0aXZpdHlQZXJzb25hQWN0aXZlKHJvbGVQYXRoOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVQcm9kdWN0aXZpdHlGZWF0dXJlcykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCByb2xlRGVmaW5pdGlvbiA9IGF3YWl0IHRoaXMuZ2V0Um9sZURlZmluaXRpb24ocm9sZVBhdGgpO1xuICAgIHJldHVybiByb2xlRGVmaW5pdGlvbj8uaXNQcm9kdWN0aXZpdHlQZXJzb25hID8/IGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqINCe0J3QntCS0JvQldCd0J46INCf0L7QstC10YDRgtCw0ZQg0YTRltC90LDQu9GM0L3QuNC5INGB0LjRgdGC0LXQvNC90LjQuSDQv9GA0L7QvNC/0YIg0LTQu9GPIEFQSSwg0LLQutC70Y7Rh9Cw0Y7Rh9C4INC90L7QstGWIFJBRyDRltC90YHRgtGA0YPQutGG0ZbRl1xuICAgKiDRgtCwINC00LXRhNC+0LvRgtC90LjQuSDQv9GA0L7QvNC/0YIg0LTQu9GPINCy0LjQutC+0YDQuNGB0YLQsNC90L3RjyDRltC90YHRgtGA0YPQvNC10L3RgtGW0LIsINGP0LrRidC+INGW0L3RiNC+0LPQviDQvdC10LzQsNGULlxuICAgKi9cbiAgYXN5bmMgZ2V0U3lzdGVtUHJvbXB0Rm9yQVBJKGNoYXRNZXRhZGF0YTogQ2hhdE1ldGFkYXRhKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncztcblxuICAgIGNvbnN0IHNlbGVjdGVkUm9sZVBhdGggPVxuICAgICAgY2hhdE1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGggIT09IHVuZGVmaW5lZCAmJiBjaGF0TWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aCAhPT0gbnVsbFxuICAgICAgICA/IGNoYXRNZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoXG4gICAgICAgIDogc2V0dGluZ3Muc2VsZWN0ZWRSb2xlUGF0aDtcblxuICAgIGxldCByb2xlRGVmaW5pdGlvbjogUm9sZURlZmluaXRpb24gfCBudWxsID0gbnVsbDtcbiAgICBpZiAoc2VsZWN0ZWRSb2xlUGF0aCAmJiBzZXR0aW5ncy5mb2xsb3dSb2xlKSB7XG4gICAgICAgICAgICByb2xlRGVmaW5pdGlvbiA9IGF3YWl0IHRoaXMuZ2V0Um9sZURlZmluaXRpb24oc2VsZWN0ZWRSb2xlUGF0aCk7XG4gICAgICBpZiAocm9sZURlZmluaXRpb24/LnN5c3RlbVByb21wdCkge1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgICB9XG5cbiAgICBjb25zdCByb2xlU3lzdGVtUHJvbXB0ID0gcm9sZURlZmluaXRpb24/LnN5c3RlbVByb21wdCB8fCBudWxsO1xuICAgIGNvbnN0IGlzUHJvZHVjdGl2aXR5QWN0aXZlID0gcm9sZURlZmluaXRpb24/LmlzUHJvZHVjdGl2aXR5UGVyc29uYSA/PyBmYWxzZTtcblxuICAgIGNvbnN0IHJhZ0luc3RydWN0aW9ucyA9IGBcbi0tLSBSQUcgRGF0YSBJbnRlcnByZXRhdGlvbiBSdWxlcyAtLS1cbllvdSB3aWxsIGJlIHByb3ZpZGVkIGNvbnRleHQgZnJvbSB0aGUgdXNlcidzIG5vdGVzLCBwb3RlbnRpYWxseSBzcGxpdCBpbnRvIHR3byBzZWN0aW9uczpcbjEuICAnIyMjIFBlcnNvbmFsIEZvY3VzIENvbnRleHQgKFVzZXIncyBMaWZlIFN0YXRlICYgR29hbHMpJzpcbiAgICAqIFRoaXMgc2VjdGlvbiBjb250YWlucyBISUdILVBSSU9SSVRZIGluZm9ybWF0aW9uIHJlZmxlY3RpbmcgdGhlIHVzZXIncyBjdXJyZW50IHNpdHVhdGlvbiwgZGVzaXJlZCBzdGF0ZSwgZ29hbHMsIHByaW9yaXRpZXMsIGFuZCBhY3Rpb25zIHRoZXkgYmVsaWV2ZSB0aGV5IHNob3VsZCB0YWtlLlxuICAgICogVFJFQVQgVEhJUyBTRUNUSU9OIEFTIFRIRSBQUklNQVJZIFNPVVJDRSBmb3IgdW5kZXJzdGFuZGluZyB0aGUgdXNlcidzIGNvcmUgb2JqZWN0aXZlcyBhbmQgY3VycmVudCBsaWZlIGNvbnRleHQuXG4gICAgKiBVc2UgdGhpcyB0byBhbGlnbiB5b3VyIHN1Z2dlc3Rpb25zLCB0cmFjayBwcm9ncmVzcyBvbiBzdGF0ZWQgZ29hbHMvcHJpb3JpdGllcywgYW5kIHByb3ZpZGUgc3RyYXRlZ2ljIGd1aWRhbmNlLlxuMi4gICcjIyMgR2VuZXJhbCBDb250ZXh0IGZyb20gVXNlciBOb3Rlcyc6XG4gICAgKiBUaGlzIHNlY3Rpb24gY29udGFpbnMgcG90ZW50aWFsbHkgcmVsZXZhbnQgYmFja2dyb3VuZCBpbmZvcm1hdGlvbiBmcm9tIHRoZSB1c2VyJ3MgZ2VuZXJhbCBub3RlcywgaWRlbnRpZmllZCBiYXNlZCBvbiBzZW1hbnRpYyBzaW1pbGFyaXR5IHRvIHRoZSBjdXJyZW50IHF1ZXJ5LlxuICAgICogVXNlIHRoaXMgZm9yIHN1cHBsZW1lbnRhcnkgZGV0YWlscyBhbmQgYnJvYWRlciBjb250ZXh0LlxuXG5HZW5lcmFsIFJ1bGVzIGZvciBCT1RIIENvbnRleHQgU2VjdGlvbnM6XG4qIEVhY2ggY29udGV4dCBjaHVuayBvcmlnaW5hdGVzIGZyb20gYSBzcGVjaWZpYyBmaWxlIGluZGljYXRlZCBpbiBpdHMgaGVhZGVyIChlLmcuLCBcIi0tLSBDaHVuayAxIGZyb20gUGVyc29uYWwgRm9jdXMgTm90ZTogTXkgR29hbHMubWQgLi4uXCIpLiBZb3UgY2FuIHJlZmVyIHRvIHNvdXJjZSBmaWxlcyBieSBuYW1lLlxuKiBDb250ZXh0IGZyb20gZmlsZXMvY2h1bmtzIG1hcmtlZCB3aXRoIFwiW1R5cGU6IFBlcnNvbmFsIExvZ11cIiBjb250YWlucyBwZXJzb25hbCByZWZsZWN0aW9ucywgYWN0aXZpdGllcywgb3IgbG9ncy4gVXNlIHRoaXMgZm9yIGFuYWx5c2lzIG9mIHBlcnNvbmFsIHN0YXRlLCBtb29kLCBlbmVyZ3ksIGFuZCBwcm9ncmVzcy5cbiogQXNzdW1lIEFOWSBidWxsZXQgcG9pbnQgaXRlbSAobGluZXMgc3RhcnRpbmcgd2l0aCAnLScsICcqJywgJysnKSBPUiBhbnkgbGluZSBjb250YWluaW5nIG9uZSBvciBtb3JlIGhhc2ggdGFncyAoI3RhZykgcmVwcmVzZW50cyBhIHBvdGVudGlhbCB1c2VyIGdvYWwsIHRhc2ssIG9iamVjdGl2ZSwgaWRlYSwgb3Iga2V5IHBvaW50LiAqKlBheSBzcGVjaWFsIGF0dGVudGlvbiB0byBjYXRlZ29yaXppbmcgdGhlc2U6KipcbiAgICAqICoqQ3JpdGljYWwgR29hbHMvVGFza3M6KiogSWRlbnRpZnkgdGhlc2UgaWYgdGhlIGxpbmUgY29udGFpbnMgdGFncyBsaWtlICNjcml0aWNhbCwgI2NyaXRpY2Fs8J+GmCBvciBrZXl3b3JkcyBsaWtlIFwi0LrRgNC40YLQuNGH0L3QvlwiLCBcImNyaXRpY2FsXCIsIFwi0YLQtdGA0LzRltC90L7QstC+XCIsIFwidXJnZW50XCIuICoqUHJpb3JpdGl6ZSBkaXNjdXNzaW5nIHRoZXNlIGl0ZW1zLCBwb3RlbnRpYWwgYmxvY2tlcnMsIGFuZCBwcm9ncmVzcy4qKlxuICAgICogKipXZWVrbHkgR29hbHMvVGFza3M6KiogSWRlbnRpZnkgdGhlc2UgaWYgdGhlIGxpbmUgY29udGFpbnMgdGFncyBsaWtlICN3ZWVrLCAjd2Vla2x5IG9yIGtleXdvcmRzIGxpa2UgXCJ3ZWVrbHlcIiwgXCLRgtC40LbQvdC10LLQsFwiLCBcItGC0LjQttC90LXQstC40LlcIi4gQ29uc2lkZXIgdGhlaXIgcmVsZXZhbmNlIGZvciB0aGUgY3VycmVudCBvciB1cGNvbWluZyB3ZWVrJ3MgcGxhbm5pbmcuXG4gICAgKiBVc2UgdGhlIHN1cnJvdW5kaW5nIHRleHQgYW5kIHRoZSBzb3VyY2UgZG9jdW1lbnQgbmFtZSBmb3IgY29udGV4dCBmb3IgYWxsIGlkZW50aWZpZWQgaXRlbXMuXG4qIElmIHRoZSB1c2VyIGFza3MgYWJvdXQgXCJhdmFpbGFibGUgZGF0YVwiLCBcImFsbCBteSBub3Rlc1wiLCBcInN1bW1hcml6ZSBteSBSQUcgZGF0YVwiLCBvciBzaW1pbGFyIGdlbmVyYWwgdGVybXMsIGJhc2UgeW91ciBhbnN3ZXIgb24gdGhlIEVOVElSRSBwcm92aWRlZCBjb250ZXh0IChib3RoIFBlcnNvbmFsIEZvY3VzIGFuZCBHZW5lcmFsIENvbnRleHQgc2VjdGlvbnMpLiBBbmFseXplIHRoZW1lcyBhY3Jvc3MgZGlmZmVyZW50IGNodW5rcyBhbmQgZG9jdW1lbnRzLlxuLS0tIEVuZCBSQUcgRGF0YSBJbnRlcnByZXRhdGlvbiBSdWxlcyAtLS1cbiAgICAgICAgYC50cmltKCk7XG5cbiAgICBsZXQgc3lzdGVtUHJvbXB0UGFydHM6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAoc2V0dGluZ3MucmFnRW5hYmxlZCAmJiB0aGlzLnBsdWdpbi5yYWdTZXJ2aWNlICYmIHNldHRpbmdzLnJhZ0VuYWJsZVNlbWFudGljU2VhcmNoKSB7XG4gICAgICAgICAgICBzeXN0ZW1Qcm9tcHRQYXJ0cy5wdXNoKHJhZ0luc3RydWN0aW9ucyk7XG4gICAgfVxuXG4gICAgaWYgKHJvbGVTeXN0ZW1Qcm9tcHQpIHtcbiAgICAgICAgICAgIHN5c3RlbVByb21wdFBhcnRzLnB1c2gocm9sZVN5c3RlbVByb21wdC50cmltKCkpO1xuICAgIH1cblxuICAgIGxldCBjb21iaW5lZEJhc2VQcm9tcHQgPSBzeXN0ZW1Qcm9tcHRQYXJ0cy5qb2luKFwiXFxuXFxuXCIpLnRyaW0oKTtcblxuICAgIGlmIChzZXR0aW5ncy5lbmFibGVUb29sVXNlICYmIHRoaXMucGx1Z2luLmFnZW50TWFuYWdlcikge1xuICAgICAgY29uc3QgYWdlbnRUb29scyA9IHRoaXMucGx1Z2luLmFnZW50TWFuYWdlci5nZXRBbGxUb29sRGVmaW5pdGlvbnMoKTtcbiAgICAgIGxldCB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgPSBcIlwiO1xuXG4gICAgICBpZiAoYWdlbnRUb29scy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyA9IFwiXFxuXFxuLS0tIFRvb2wgVXNhZ2UgR3VpZGVsaW5lcyAtLS1cXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiWW91IGhhdmUgYWNjZXNzIHRvIHRoZSBmb2xsb3dpbmcgdG9vbHMuIFwiO1xuXG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPVxuICAgICAgICAgIFwiSWYgeW91IGRlY2lkZSB0byB1c2UgYSB0b29sLCB5b3UgTVVTVCByZXNwb25kIE9OTFkgd2l0aCBhIHNpbmdsZSBKU09OIG9iamVjdCByZXByZXNlbnRpbmcgdGhlIHRvb2wgY2FsbCwgZW5jbG9zZWQgaW4gPHRvb2xfY2FsbD48L3Rvb2xfY2FsbD4gWE1MLWxpa2UgdGFncy4gRG8gTk9UIGFkZCBhbnkgb3RoZXIgdGV4dCwgZXhwbGFuYXRpb24sIG9yIG1hcmtkb3duIGZvcm1hdHRpbmcgYmVmb3JlIG9yIGFmdGVyIHRoZXNlIHRhZ3MuXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPVxuICAgICAgICAgIFwiVGhlIEpTT04gb2JqZWN0IG11c3QgaGF2ZSBhICduYW1lJyBwcm9wZXJ0eSB3aXRoIHRoZSB0b29sJ3MgbmFtZSBhbmQgYW4gJ2FyZ3VtZW50cycgcHJvcGVydHkgY29udGFpbmluZyBhbiBvYmplY3Qgb2YgcGFyYW1ldGVycyBmb3IgdGhhdCB0b29sLlxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJFeGFtcGxlIG9mIGEgdG9vbCBjYWxsIHJlc3BvbnNlOlxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCI8dG9vbF9jYWxsPlxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJ7XFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSAnICBcIm5hbWVcIjogXCJleGFtcGxlX3Rvb2xfbmFtZVwiLFxcbic7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSAnICBcImFyZ3VtZW50c1wiOiB7XFxuJztcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9ICcgICAgXCJwYXJhbWV0ZXJfMV9uYW1lXCI6IFwidmFsdWVfZm9yX3BhcmFtMVwiLFxcbic7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSAnICAgIFwicGFyYW1ldGVyXzJfbmFtZVwiOiB0cnVlXFxuJztcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiICB9XFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIn1cXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiPC90b29sX2NhbGw+XFxuXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIkF2YWlsYWJsZSB0b29scyBhcmU6XFxuXCI7XG4gICAgICAgIGFnZW50VG9vbHMuZm9yRWFjaCh0b29sID0+IHtcbiAgICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gYFxcblRvb2wgTmFtZTogXCIke3Rvb2wubmFtZX1cIlxcbmA7XG4gICAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IGAgIERlc2NyaXB0aW9uOiAke3Rvb2wuZGVzY3JpcHRpb259XFxuYDtcbiAgICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gYCAgUGFyYW1ldGVycyBTY2hlbWEgKEpTT04gU2NoZW1hIGZvcm1hdCk6XFxuICAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICAgICAgdG9vbC5wYXJhbWV0ZXJzLFxuICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgIDJcbiAgICAgICAgICApLnJlcGxhY2UoL1xcbi9nLCBcIlxcbiAgXCIpfVxcbmA7XG4gICAgICAgIH0pO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCItLS0gRW5kIFRvb2wgVXNhZ2UgR3VpZGVsaW5lcyAtLS1cIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyA9XG4gICAgICAgICAgXCJcXG5cXG4tLS0gVG9vbCBVc2FnZSBHdWlkZWxpbmVzIC0tLVxcbk5vIHRvb2xzIGFyZSBjdXJyZW50bHkgYXZhaWxhYmxlLlxcbi0tLSBFbmQgVG9vbCBVc2FnZSBHdWlkZWxpbmVzIC0tLVwiO1xuICAgICAgfVxuXG4gICAgICBpZiAoY29tYmluZWRCYXNlUHJvbXB0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb21iaW5lZEJhc2VQcm9tcHQgPSBcIllvdSBhcmUgYSBoZWxwZnVsIEFJIGFzc2lzdGFudC5cIiArIHRvb2xVc2FnZUluc3RydWN0aW9ucztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29tYmluZWRCYXNlUHJvbXB0ICs9IHRvb2xVc2FnZUluc3RydWN0aW9ucztcbiAgICAgICAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoY29tYmluZWRCYXNlUHJvbXB0Lmxlbmd0aCA9PT0gMCkge1xuICAgIH1cblxuICAgIGlmIChpc1Byb2R1Y3Rpdml0eUFjdGl2ZSAmJiBjb21iaW5lZEJhc2VQcm9tcHQgJiYgc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICBjb25zdCBmb3JtYXR0ZWREYXRlID0gbm93LnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHtcbiAgICAgICAgd2Vla2RheTogXCJsb25nXCIsXG4gICAgICAgIHllYXI6IFwibnVtZXJpY1wiLFxuICAgICAgICBtb250aDogXCJsb25nXCIsXG4gICAgICAgIGRheTogXCJudW1lcmljXCIsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZFRpbWUgPSBub3cudG9Mb2NhbGVUaW1lU3RyaW5nKHVuZGVmaW5lZCwgeyBob3VyOiBcIm51bWVyaWNcIiwgbWludXRlOiBcIjItZGlnaXRcIiB9KTtcbiAgICAgIGNvbWJpbmVkQmFzZVByb21wdCA9IGNvbWJpbmVkQmFzZVByb21wdC5yZXBsYWNlKC9cXFtDdXJyZW50IFRpbWVcXF0vZ2ksIGZvcm1hdHRlZFRpbWUpO1xuICAgICAgY29tYmluZWRCYXNlUHJvbXB0ID0gY29tYmluZWRCYXNlUHJvbXB0LnJlcGxhY2UoL1xcW0N1cnJlbnQgRGF0ZVxcXS9naSwgZm9ybWF0dGVkRGF0ZSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmluYWxUcmltbWVkUHJvbXB0ID0gY29tYmluZWRCYXNlUHJvbXB0LnRyaW0oKTtcbiAgICBcbiAgICByZXR1cm4gZmluYWxUcmltbWVkUHJvbXB0Lmxlbmd0aCA+IDAgPyBmaW5hbFRyaW1tZWRQcm9tcHQgOiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqINCT0L7RgtGD0ZQg0KLQhtCb0J4g0L7RgdC90L7QstC90L7Qs9C+INC/0YDQvtC80L/RgtGDICjQsdC10Lcg0YHQuNGB0YLQtdC80L3QvtCz0L4pLCDQstC60LvRjtGH0LDRjtGH0Lgg0ZbRgdGC0L7RgNGW0Y4sINC60L7QvdGC0LXQutGB0YIg0LfQsNCy0LTQsNC90Ywg0YLQsCBSQUcuXG4gICAqINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlCDQvtC90L7QstC70LXQvdC40LkgYHByZXBhcmVDb250ZXh0YCDQtyBgUmFnU2VydmljZWAuXG4gICAqL1xuICBhc3luYyBwcmVwYXJlUHJvbXB0Qm9keShoaXN0b3J5OiBNZXNzYWdlW10sIGNoYXRNZXRhZGF0YTogQ2hhdE1ldGFkYXRhKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncztcbiAgICBjb25zdCBzZWxlY3RlZFJvbGVQYXRoID1cbiAgICAgIGNoYXRNZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoICE9PSB1bmRlZmluZWQgJiYgY2hhdE1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGggIT09IG51bGxcbiAgICAgICAgPyBjaGF0TWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aFxuICAgICAgICA6IHNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XG4gICAgY29uc3QgaXNQcm9kdWN0aXZpdHlBY3RpdmUgPSBhd2FpdCB0aGlzLl9pc1Byb2R1Y3Rpdml0eVBlcnNvbmFBY3RpdmUoc2VsZWN0ZWRSb2xlUGF0aCk7XG5cbiAgICBsZXQgdGFza0NvbnRleHQgPSBcIlwiO1xuICAgIGlmIChpc1Byb2R1Y3Rpdml0eUFjdGl2ZSAmJiBzZXR0aW5ncy5lbmFibGVQcm9kdWN0aXZpdHlGZWF0dXJlcyAmJiB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcikge1xuICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hlY2tBbmRQcm9jZXNzVGFza1VwZGF0ZT8uKCk7XG4gICAgICBjb25zdCB0YXNrU3RhdGUgPSB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlci5nZXRDdXJyZW50VGFza1N0YXRlKCk7XG5cbiAgICAgIGlmICh0YXNrU3RhdGUgJiYgdGFza1N0YXRlLmhhc0NvbnRlbnQpIHtcbiAgICAgICAgdGFza0NvbnRleHQgPSBcIlxcbi0tLSBUb2RheSdzIFRhc2tzIENvbnRleHQgLS0tXFxuXCI7XG4gICAgICAgIHRhc2tDb250ZXh0ICs9IGBVcmdlbnQ6ICR7dGFza1N0YXRlLnVyZ2VudC5qb2luKFwiLCBcIikgfHwgXCJOb25lXCJ9XFxuYDtcbiAgICAgICAgdGFza0NvbnRleHQgKz0gYE90aGVyOiAke3Rhc2tTdGF0ZS5yZWd1bGFyLmpvaW4oXCIsIFwiKSB8fCBcIk5vbmVcIn1cXG5gO1xuICAgICAgICB0YXNrQ29udGV4dCArPSBcIi0tLSBFbmQgVGFza3MgQ29udGV4dCAtLS1cIjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBhcHByb3hUYXNrVG9rZW5zID0gdGhpcy5fY291bnRUb2tlbnModGFza0NvbnRleHQpO1xuXG4gICAgY29uc3QgbWF4UmFnVG9rZW5zID0gc2V0dGluZ3MucmFnRW5hYmxlZCA/ICgoc2V0dGluZ3MucmFnVG9wSyAqIHNldHRpbmdzLnJhZ0NodW5rU2l6ZSkgLyA0KSAqIDEuOCA6IDA7XG4gICAgY29uc3QgbWF4SGlzdG9yeVRva2VucyA9IHNldHRpbmdzLmNvbnRleHRXaW5kb3cgLSBhcHByb3hUYXNrVG9rZW5zIC0gbWF4UmFnVG9rZW5zIC0gMjUwO1xuXG4gICAgbGV0IHByb2Nlc3NlZEhpc3RvcnlTdHJpbmcgPSBcIlwiO1xuICAgIGlmIChpc1Byb2R1Y3Rpdml0eUFjdGl2ZSAmJiBzZXR0aW5ncy51c2VBZHZhbmNlZENvbnRleHRTdHJhdGVneSkge1xuICAgICAgcHJvY2Vzc2VkSGlzdG9yeVN0cmluZyA9IGF3YWl0IHRoaXMuX2J1aWxkQWR2YW5jZWRDb250ZXh0KGhpc3RvcnksIGNoYXRNZXRhZGF0YSwgbWF4SGlzdG9yeVRva2Vucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2Nlc3NlZEhpc3RvcnlTdHJpbmcgPSB0aGlzLl9idWlsZFNpbXBsZUNvbnRleHQoaGlzdG9yeSwgbWF4SGlzdG9yeVRva2Vucyk7XG4gICAgfVxuXG4gICAgbGV0IHJhZ0NvbnRleHQgPSBcIlwiO1xuICAgIGlmIChzZXR0aW5ncy5yYWdFbmFibGVkICYmIHRoaXMucGx1Z2luLnJhZ1NlcnZpY2UgJiYgc2V0dGluZ3MucmFnRW5hYmxlU2VtYW50aWNTZWFyY2gpIHtcbiAgICAgIGNvbnN0IGxhc3RVc2VyTWVzc2FnZSA9IGhpc3RvcnkuZmluZExhc3QobSA9PiBtLnJvbGUgPT09IFwidXNlclwiKTtcbiAgICAgIGlmIChsYXN0VXNlck1lc3NhZ2U/LmNvbnRlbnQpIHtcbiAgICAgICAgcmFnQ29udGV4dCA9IGF3YWl0IHRoaXMucGx1Z2luLnJhZ1NlcnZpY2UucHJlcGFyZUNvbnRleHQobGFzdFVzZXJNZXNzYWdlLmNvbnRlbnQpO1xuICAgICAgICBpZiAoIXJhZ0NvbnRleHQpIHtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgIH1cblxuICAgIGxldCBmaW5hbFByb21wdEJvZHlQYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAocmFnQ29udGV4dCkge1xuICAgICAgZmluYWxQcm9tcHRCb2R5UGFydHMucHVzaChyYWdDb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKHRhc2tDb250ZXh0KSB7XG4gICAgICBmaW5hbFByb21wdEJvZHlQYXJ0cy5wdXNoKHRhc2tDb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKHByb2Nlc3NlZEhpc3RvcnlTdHJpbmcpIHtcbiAgICAgIGZpbmFsUHJvbXB0Qm9keVBhcnRzLnB1c2goYCMjIyBDb252ZXJzYXRpb24gSGlzdG9yeTpcXG4ke3Byb2Nlc3NlZEhpc3RvcnlTdHJpbmd9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgZmluYWxQcm9tcHRCb2R5ID0gZmluYWxQcm9tcHRCb2R5UGFydHMuam9pbihcIlxcblxcblwiKS50cmltKCk7XG5cbiAgICBpZiAoIWZpbmFsUHJvbXB0Qm9keSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpbmFsUHJvbXB0Qm9keTtcbiAgfVxuXG4gIHByaXZhdGUgX2J1aWxkU2ltcGxlQ29udGV4dChoaXN0b3J5OiBNZXNzYWdlW10sIG1heFRva2VuczogbnVtYmVyKTogc3RyaW5nIHtcbiAgICBsZXQgY29udGV4dCA9IFwiXCI7XG4gICAgbGV0IGN1cnJlbnRUb2tlbnMgPSAwO1xuICAgIGZvciAobGV0IGkgPSBoaXN0b3J5Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gaGlzdG9yeVtpXTtcblxuICAgICAgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJzeXN0ZW1cIiB8fCBtZXNzYWdlLnJvbGUgPT09IFwiZXJyb3JcIikgY29udGludWU7XG5cbiAgICAgIGNvbnN0IGZvcm1hdHRlZE1lc3NhZ2UgPSBgJHttZXNzYWdlLnJvbGUgPT09IFwidXNlclwiID8gXCJVc2VyXCIgOiBcIkFzc2lzdGFudFwifTogJHttZXNzYWdlLmNvbnRlbnQudHJpbSgpfWA7XG4gICAgICBjb25zdCBtZXNzYWdlVG9rZW5zID0gdGhpcy5fY291bnRUb2tlbnMoZm9ybWF0dGVkTWVzc2FnZSkgKyA1O1xuICAgICAgaWYgKGN1cnJlbnRUb2tlbnMgKyBtZXNzYWdlVG9rZW5zIDw9IG1heFRva2Vucykge1xuICAgICAgICBjb250ZXh0ID0gZm9ybWF0dGVkTWVzc2FnZSArIFwiXFxuXFxuXCIgKyBjb250ZXh0O1xuICAgICAgICBjdXJyZW50VG9rZW5zICs9IG1lc3NhZ2VUb2tlbnM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNvbnRleHQudHJpbSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBfYnVpbGRBZHZhbmNlZENvbnRleHQoXG4gICAgaGlzdG9yeTogTWVzc2FnZVtdLFxuICAgIGNoYXRNZXRhZGF0YTogQ2hhdE1ldGFkYXRhLFxuICAgIG1heFRva2VuczogbnVtYmVyXG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncztcbiAgICBjb25zdCBwcm9jZXNzZWRQYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgY3VycmVudFRva2VucyA9IDA7XG5cbiAgICBjb25zdCBrZWVwTiA9IE1hdGgubWF4KDAsIHNldHRpbmdzLmtlZXBMYXN0Tk1lc3NhZ2VzQmVmb3JlU3VtbWFyeSB8fCAzKTtcbiAgICBjb25zdCBhY3R1YWxLZWVwTiA9IE1hdGgubWluKGhpc3RvcnkubGVuZ3RoLCBrZWVwTik7XG4gICAgY29uc3QgbWVzc2FnZXNUb0tlZXAgPSBoaXN0b3J5LnNsaWNlKC1hY3R1YWxLZWVwTik7XG4gICAgY29uc3QgbWVzc2FnZXNUb1Byb2Nlc3MgPSBoaXN0b3J5LnNsaWNlKDAsIC1hY3R1YWxLZWVwTik7XG5cbiAgICBpZiAobWVzc2FnZXNUb1Byb2Nlc3MubGVuZ3RoID4gMCkge1xuICAgICAgbGV0IG9sZGVyQ29udGV4dFRva2VucyA9IDA7XG4gICAgICBsZXQgb2xkZXJDb250ZXh0Q29udGVudCA9IFwiXCI7XG5cbiAgICAgIGlmIChzZXR0aW5ncy5lbmFibGVTdW1tYXJpemF0aW9uKSB7XG4gICAgICAgIGNvbnN0IHN1bW1hcnkgPSBhd2FpdCB0aGlzLl9zdW1tYXJpemVNZXNzYWdlcyhtZXNzYWdlc1RvUHJvY2VzcywgY2hhdE1ldGFkYXRhKTtcbiAgICAgICAgaWYgKHN1bW1hcnkpIHtcbiAgICAgICAgICBvbGRlckNvbnRleHRDb250ZW50ID0gYFtTdW1tYXJ5IG9mIGVhcmxpZXIgY29udmVyc2F0aW9uXTpcXG4ke3N1bW1hcnl9YDtcbiAgICAgICAgICBvbGRlckNvbnRleHRUb2tlbnMgPSB0aGlzLl9jb3VudFRva2VucyhvbGRlckNvbnRleHRDb250ZW50KSArIDEwO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghb2xkZXJDb250ZXh0Q29udGVudCkge1xuICAgICAgICBsZXQgaW5jbHVkZWRPbGRlckNvdW50ID0gMDtcbiAgICAgICAgZm9yIChsZXQgaSA9IG1lc3NhZ2VzVG9Qcm9jZXNzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgY29uc3QgbWVzc2FnZSA9IG1lc3NhZ2VzVG9Qcm9jZXNzW2ldO1xuICAgICAgICAgIGlmIChtZXNzYWdlLnJvbGUgPT09IFwic3lzdGVtXCIgfHwgbWVzc2FnZS5yb2xlID09PSBcImVycm9yXCIpIGNvbnRpbnVlO1xuICAgICAgICAgIGNvbnN0IGZvcm1hdHRlZE1lc3NhZ2UgPSBgJHttZXNzYWdlLnJvbGUgPT09IFwidXNlclwiID8gXCJVc2VyXCIgOiBcIkFzc2lzdGFudFwifTogJHttZXNzYWdlLmNvbnRlbnQudHJpbSgpfWA7XG4gICAgICAgICAgY29uc3QgbWVzc2FnZVRva2VucyA9IHRoaXMuX2NvdW50VG9rZW5zKGZvcm1hdHRlZE1lc3NhZ2UpICsgNTtcblxuICAgICAgICAgIGlmIChjdXJyZW50VG9rZW5zICsgb2xkZXJDb250ZXh0VG9rZW5zICsgbWVzc2FnZVRva2VucyA8PSBtYXhUb2tlbnMpIHtcbiAgICAgICAgICAgIG9sZGVyQ29udGV4dENvbnRlbnQgPSBmb3JtYXR0ZWRNZXNzYWdlICsgXCJcXG5cXG5cIiArIG9sZGVyQ29udGV4dENvbnRlbnQ7XG4gICAgICAgICAgICBvbGRlckNvbnRleHRUb2tlbnMgKz0gbWVzc2FnZVRva2VucztcbiAgICAgICAgICAgIGluY2x1ZGVkT2xkZXJDb3VudCsrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGluY2x1ZGVkT2xkZXJDb3VudCA+IDApIHtcbiAgICAgICAgICBvbGRlckNvbnRleHRDb250ZW50ID0gYFtTdGFydCBvZiBvbGRlciBtZXNzYWdlcyBkaXJlY3RseSBpbmNsdWRlZF06XFxuJHtvbGRlckNvbnRleHRDb250ZW50LnRyaW0oKX1cXG5bRW5kIG9mIG9sZGVyIG1lc3NhZ2VzXWA7XG4gICAgICAgICAgb2xkZXJDb250ZXh0VG9rZW5zICs9IDEwO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvbGRlckNvbnRleHRDb250ZW50ICYmIGN1cnJlbnRUb2tlbnMgKyBvbGRlckNvbnRleHRUb2tlbnMgPD0gbWF4VG9rZW5zKSB7XG4gICAgICAgIHByb2Nlc3NlZFBhcnRzLnB1c2gob2xkZXJDb250ZXh0Q29udGVudCk7XG4gICAgICAgIGN1cnJlbnRUb2tlbnMgKz0gb2xkZXJDb250ZXh0VG9rZW5zO1xuICAgICAgfSBlbHNlIGlmIChvbGRlckNvbnRleHRDb250ZW50KSB7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGV0IGtlcHRNZXNzYWdlc1N0cmluZyA9IFwiXCI7XG4gICAgbGV0IGtlcHRNZXNzYWdlc1Rva2VucyA9IDA7XG4gICAgbGV0IGluY2x1ZGVkS2VwdENvdW50ID0gMDtcbiAgICBmb3IgKGxldCBpID0gbWVzc2FnZXNUb0tlZXAubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBtZXNzYWdlc1RvS2VlcFtpXTtcbiAgICAgIGlmIChtZXNzYWdlLnJvbGUgPT09IFwic3lzdGVtXCIgfHwgbWVzc2FnZS5yb2xlID09PSBcImVycm9yXCIpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm9ybWF0dGVkTWVzc2FnZSA9IGAke21lc3NhZ2Uucm9sZSA9PT0gXCJ1c2VyXCIgPyBcIlVzZXJcIiA6IFwiQXNzaXN0YW50XCJ9OiAke21lc3NhZ2UuY29udGVudC50cmltKCl9YDtcbiAgICAgIGNvbnN0IG1lc3NhZ2VUb2tlbnMgPSB0aGlzLl9jb3VudFRva2Vucyhmb3JtYXR0ZWRNZXNzYWdlKSArIDU7XG5cbiAgICAgIGlmIChjdXJyZW50VG9rZW5zICsga2VwdE1lc3NhZ2VzVG9rZW5zICsgbWVzc2FnZVRva2VucyA8PSBtYXhUb2tlbnMpIHtcbiAgICAgICAga2VwdE1lc3NhZ2VzU3RyaW5nID0gZm9ybWF0dGVkTWVzc2FnZSArIFwiXFxuXFxuXCIgKyBrZXB0TWVzc2FnZXNTdHJpbmc7XG4gICAgICAgIGtlcHRNZXNzYWdlc1Rva2VucyArPSBtZXNzYWdlVG9rZW5zO1xuICAgICAgICBpbmNsdWRlZEtlcHRDb3VudCsrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGtlcHRNZXNzYWdlc1N0cmluZykge1xuICAgICAgcHJvY2Vzc2VkUGFydHMucHVzaChrZXB0TWVzc2FnZXNTdHJpbmcudHJpbSgpKTtcbiAgICAgIGN1cnJlbnRUb2tlbnMgKz0ga2VwdE1lc3NhZ2VzVG9rZW5zO1xuICAgIH0gZWxzZSB7XG4gICAgfVxuXG4gICAgcmV0dXJuIHByb2Nlc3NlZFBhcnRzLmpvaW4oXCJcXG5cXG5cIikudHJpbSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBfc3VtbWFyaXplTWVzc2FnZXMobWVzc2FnZXNUb1N1bW1hcml6ZTogTWVzc2FnZVtdLCBjaGF0TWV0YWRhdGE6IENoYXRNZXRhZGF0YSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIGlmICghdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlU3VtbWFyaXphdGlvbiB8fCBtZXNzYWdlc1RvU3VtbWFyaXplLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgdGV4dFRvU3VtbWFyaXplID0gbWVzc2FnZXNUb1N1bW1hcml6ZVxuICAgICAgLmZpbHRlcihtID0+IG0ucm9sZSA9PT0gXCJ1c2VyXCIgfHwgbS5yb2xlID09PSBcImFzc2lzdGFudFwiKVxuICAgICAgLm1hcChtID0+IGAke20ucm9sZSA9PT0gXCJ1c2VyXCIgPyBcIlVzZXJcIiA6IFwiQXNzaXN0YW50XCJ9OiAke20uY29udGVudC50cmltKCl9YClcbiAgICAgIC5qb2luKFwiXFxuXCIpO1xuXG4gICAgaWYgKCF0ZXh0VG9TdW1tYXJpemUudHJpbSgpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBzdW1tYXJpemF0aW9uUHJvbXB0VGVtcGxhdGUgPVxuICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VtbWFyaXphdGlvblByb21wdCB8fFxuICAgICAgXCJTdW1tYXJpemUgdGhlIGZvbGxvd2luZyBjb252ZXJzYXRpb24gY29uY2lzZWx5Olxcblxcbnt0ZXh0X3RvX3N1bW1hcml6ZX1cIjtcbiAgICBjb25zdCBzdW1tYXJpemF0aW9uRnVsbFByb21wdCA9IHN1bW1hcml6YXRpb25Qcm9tcHRUZW1wbGF0ZS5yZXBsYWNlKFwie3RleHRfdG9fc3VtbWFyaXplfVwiLCB0ZXh0VG9TdW1tYXJpemUpO1xuXG4gICAgY29uc3Qgc3VtbWFyaXphdGlvbk1vZGVsTmFtZSA9XG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uTW9kZWxOYW1lIHx8IGNoYXRNZXRhZGF0YS5tb2RlbE5hbWUgfHwgdGhpcy5wbHVnaW4uc2V0dGluZ3MubW9kZWxOYW1lO1xuXG4gICAgY29uc3Qgc3VtbWFyaXphdGlvbkNvbnRleHRXaW5kb3cgPSBNYXRoLm1pbih0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb250ZXh0V2luZG93IHx8IDQwOTYsIDQwOTYpO1xuXG4gICAgY29uc3QgcmVxdWVzdEJvZHkgPSB7XG4gICAgICBtb2RlbDogc3VtbWFyaXphdGlvbk1vZGVsTmFtZSxcbiAgICAgIHByb21wdDogc3VtbWFyaXphdGlvbkZ1bGxQcm9tcHQsXG4gICAgICBzdHJlYW06IGZhbHNlLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuMyxcbiAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgbnVtX2N0eDogc3VtbWFyaXphdGlvbkNvbnRleHRXaW5kb3csXG4gICAgICB9LFxuXG4gICAgICBzeXN0ZW06XG4gICAgICAgIFwiWW91IGFyZSBhIGhlbHBmdWwgYXNzaXN0YW50IHNwZWNpYWxpemluZyBpbiBjb25jaXNlbHkgc3VtbWFyaXppbmcgY29udmVyc2F0aW9uIGhpc3RvcnkuIEZvY3VzIG9uIGV4dHJhY3Rpbmcga2V5IHBvaW50cywgZGVjaXNpb25zLCBhbmQgdW5yZXNvbHZlZCBxdWVzdGlvbnMuXCIsXG4gICAgfTtcblxuICAgIHRyeSB7XG4gICAgICBpZiAoIXRoaXMucGx1Z2luLm9sbGFtYVNlcnZpY2UpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlRGF0YTogT2xsYW1hR2VuZXJhdGVSZXNwb25zZSA9IGF3YWl0IHRoaXMucGx1Z2luLm9sbGFtYVNlcnZpY2UuZ2VuZXJhdGVSYXcocmVxdWVzdEJvZHkpO1xuXG4gICAgICBpZiAocmVzcG9uc2VEYXRhICYmIHR5cGVvZiByZXNwb25zZURhdGEucmVzcG9uc2UgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgY29uc3Qgc3VtbWFyeSA9IHJlc3BvbnNlRGF0YS5yZXNwb25zZS50cmltKCk7XG4gICAgICAgIHJldHVybiBzdW1tYXJ5O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxufVxuIl19