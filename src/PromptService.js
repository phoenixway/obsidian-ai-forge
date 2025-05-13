import { __awaiter } from "tslib";
// PromptService.ts
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
        // ... (без змін) ...
        if (!text)
            return 0;
        return Math.ceil(text.length / 4);
    }
    clearRoleCache() {
        // ... (без змін) ...
        //
        this.roleCache = {};
        this.currentRolePath = null; // Скидаємо кешований шлях
        this.currentSystemPrompt = null;
    }
    clearModelDetailsCache() {
        // ... (без змін) ...
        this.modelDetailsCache = {};
    }
    getRoleDefinition(rolePath) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
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
                const definition = {
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
                    this.roleCache[normalizedPath] = definition; // Кешуємо
                    this.currentSystemPrompt = definition.systemPrompt;
                    return definition;
                }
                catch (error) {
                    new Notice(`Error loading role: ${file.basename}. Check console.`);
                    this.currentSystemPrompt = null;
                    // Повертаємо об'єкт помилки або null, залежно від бажаної обробки
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
            // ... (без змін) ...
            if (!this.plugin.settings.enableProductivityFeatures) {
                return false;
            }
            const roleDefinition = yield this.getRoleDefinition(rolePath);
            return (_a = roleDefinition === null || roleDefinition === void 0 ? void 0 : roleDefinition.isProductivityPersona) !== null && _a !== void 0 ? _a : false;
        });
    }
    // src/PromptService.ts
    // ... (інші імпорти та частини класу PromptService) ...
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
                this.plugin.logger.debug(`[PromptService] Attempting to load role from: ${selectedRolePath}`);
                roleDefinition = yield this.getRoleDefinition(selectedRolePath);
                if (roleDefinition === null || roleDefinition === void 0 ? void 0 : roleDefinition.systemPrompt) {
                    this.plugin.logger.debug(`[PromptService] Role loaded. Prompt length: ${roleDefinition.systemPrompt.length}`);
                }
                else {
                    this.plugin.logger.debug(`[PromptService] Role loaded but no system prompt found in role file, or role not followed.`);
                }
            }
            else {
                this.plugin.logger.debug(`[PromptService] No role selected or settings.followRole is false.`);
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
                }
                else {
                    toolUsageInstructions = "\n\n--- Tool Usage Guidelines ---\nNo tools are currently available.\n--- End Tool Usage Guidelines ---";
                }
                if (combinedBasePrompt.length === 0) {
                    // Якщо не було RAG/Ролі, починаємо з дефолтного + інструменти
                    combinedBasePrompt = "You are a helpful AI assistant." + toolUsageInstructions;
                    this.plugin.logger.debug("[PromptService] No RAG/Role prompt, using default assistant prompt + tool instructions.");
                }
                else {
                    // Додаємо інструкції до існуючого промпту
                    combinedBasePrompt += toolUsageInstructions;
                    this.plugin.logger.debug("[PromptService] Appended tool instructions to existing RAG/Role prompt.");
                }
            }
            else if (combinedBasePrompt.length === 0) {
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
            this.plugin.logger.debug(`[PromptService] Final system prompt length: ${finalTrimmedPrompt.length}. Content preview: "${finalTrimmedPrompt.substring(0, 100)}..."`);
            return finalTrimmedPrompt.length > 0 ? finalTrimmedPrompt : null;
        });
    }
    // ... (решта вашого класу PromptService) ...
    /**
     * Готує ТІЛО основного промпту (без системного), включаючи історію, контекст завдань та RAG.
     * Використовує оновлений `prepareContext` з `RagService`.
     */
    preparePromptBody(history, chatMetadata) {
        return __awaiter(this, void 0, void 0, function* () {
            // ... (Логіка отримання isProductivityActive та обробки taskContext без змін) ...
            var _a, _b;
            const settings = this.plugin.settings;
            const selectedRolePath = chatMetadata.selectedRolePath !== undefined && chatMetadata.selectedRolePath !== null
                ? chatMetadata.selectedRolePath
                : settings.selectedRolePath;
            const isProductivityActive = yield this._isProductivityPersonaActive(selectedRolePath);
            // --- Контекст завдань ---
            let taskContext = "";
            if (isProductivityActive && settings.enableProductivityFeatures && this.plugin.chatManager) {
                // Отримуємо стан завдань
                yield ((_b = (_a = this.plugin).checkAndProcessTaskUpdate) === null || _b === void 0 ? void 0 : _b.call(_a));
                const taskState = this.plugin.chatManager.getCurrentTaskState();
                if (taskState && taskState.hasContent) {
                    taskContext = "\n--- Today's Tasks Context ---\n";
                    taskContext += `Urgent: ${taskState.urgent.join(", ") || "None"}\n`;
                    taskContext += `Other: ${taskState.regular.join(", ") || "None"}\n`;
                    taskContext += "--- End Tasks Context ---";
                    this.plugin.logger.debug(`[PromptService] Injecting task context (Urgent: ${taskState.urgent.length}, Regular: ${taskState.regular.length})`);
                }
                else {
                }
            }
            // --- Розрахунок токенів та історії (без змін) ---
            const approxTaskTokens = this._countTokens(taskContext);
            // Запас для RAG може потребувати коригування, якщо контекст став значно довшим
            const maxRagTokens = settings.ragEnabled ? ((settings.ragTopK * settings.ragChunkSize) / 4) * 1.8 : 0; // Збільшив запас
            const maxHistoryTokens = settings.contextWindow - approxTaskTokens - maxRagTokens - 250; // Збільшив резерв
            let processedHistoryString = "";
            if (isProductivityActive && settings.useAdvancedContextStrategy) {
                processedHistoryString = yield this._buildAdvancedContext(history, chatMetadata, maxHistoryTokens);
            }
            else {
                processedHistoryString = this._buildSimpleContext(history, maxHistoryTokens);
            }
            // --- RAG Контекст (використовує оновлений prepareContext) ---
            let ragContext = "";
            if (settings.ragEnabled && this.plugin.ragService && settings.ragEnableSemanticSearch) {
                const lastUserMessage = history.findLast(m => m.role === "user");
                if (lastUserMessage === null || lastUserMessage === void 0 ? void 0 : lastUserMessage.content) {
                    // prepareContext тепер повертає рядок з розділеними секціями
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
            // --- Формування фінального тіла промпту (без змін) ---
            let finalPromptBodyParts = [];
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
        });
    }
    // Методи _buildSimpleContext, _buildAdvancedContext, _summarizeMessages
    // залишаються без структурних змін (тільки логування)
    _buildSimpleContext(history, maxTokens) {
        // ... (без змін, окрім логування) ...
        let context = "";
        let currentTokens = 0;
        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            // Пропускаємо системні/помилкові повідомлення з простої історії
            if (message.role === "system" || message.role === "error")
                continue;
            const formattedMessage = `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`;
            const messageTokens = this._countTokens(formattedMessage) + 5; // +5 за форматування/роздільники
            if (currentTokens + messageTokens <= maxTokens) {
                context = formattedMessage + "\n\n" + context; // Додаємо на початок
                currentTokens += messageTokens;
            }
            else {
                break; // Досягли ліміту
            }
        }
        return context.trim();
    }
    _buildAdvancedContext(history, chatMetadata, maxTokens) {
        return __awaiter(this, void 0, void 0, function* () {
            const settings = this.plugin.settings;
            const processedParts = [];
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
                    const summary = yield this._summarizeMessages(messagesToProcess, chatMetadata);
                    if (summary) {
                        olderContextContent = `[Summary of earlier conversation]:\n${summary}`;
                        olderContextTokens = this._countTokens(olderContextContent) + 10; // +10 за заголовок
                    }
                    else {
                        // Якщо сумаризація не вдалася, спробуємо включити їх напряму (див. else блок)
                    }
                }
                // Якщо сумаризація вимкнена АБО не вдалася
                if (!olderContextContent) {
                    let includedOlderCount = 0;
                    for (let i = messagesToProcess.length - 1; i >= 0; i--) {
                        const message = messagesToProcess[i];
                        if (message.role === "system" || message.role === "error")
                            continue;
                        const formattedMessage = `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`;
                        const messageTokens = this._countTokens(formattedMessage) + 5;
                        // Перевіряємо загальний ліміт maxTokens
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
                        olderContextTokens += 10; // Додаємо за маркери
                    }
                }
                // Додаємо оброблену стару частину, якщо вона є і вміщається
                if (olderContextContent && currentTokens + olderContextTokens <= maxTokens) {
                    processedParts.push(olderContextContent);
                    currentTokens += olderContextTokens;
                }
                else if (olderContextContent) {
                }
            }
            // 2. Обробка останніх N повідомлень
            let keptMessagesString = "";
            let keptMessagesTokens = 0;
            let includedKeptCount = 0;
            for (let i = messagesToKeep.length - 1; i >= 0; i--) {
                const message = messagesToKeep[i];
                if (message.role === "system" || message.role === "error")
                    continue;
                const formattedMessage = `${message.role === "user" ? "User" : "Assistant"}: ${message.content.trim()}`;
                const messageTokens = this._countTokens(formattedMessage) + 5;
                // Перевіряємо ліміт з урахуванням вже доданих частин
                if (currentTokens + keptMessagesTokens + messageTokens <= maxTokens) {
                    keptMessagesString = formattedMessage + "\n\n" + keptMessagesString;
                    keptMessagesTokens += messageTokens;
                    includedKeptCount++;
                }
                else {
                    break; // Досягли ліміту
                }
            }
            // Додаємо останні повідомлення, якщо вони є
            if (keptMessagesString) {
                processedParts.push(keptMessagesString.trim());
                currentTokens += keptMessagesTokens;
            }
            else {
            }
            return processedParts.join("\n\n").trim(); // Об'єднуємо частини (сумарі/старі + нові)
        });
    }
    _summarizeMessages(messagesToSummarize, chatMetadata) {
        return __awaiter(this, void 0, void 0, function* () {
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
            const summarizationPromptTemplate = this.plugin.settings.summarizationPrompt ||
                "Summarize the following conversation concisely:\n\n{text_to_summarize}";
            const summarizationFullPrompt = summarizationPromptTemplate.replace("{text_to_summarize}", textToSummarize);
            // Використовуємо модель з налаштувань сумаризації, ЯКЩО вона вказана, інакше - модель чату
            const summarizationModelName = this.plugin.settings.summarizationModelName || chatMetadata.modelName || this.plugin.settings.modelName;
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
} // End of PromptService class
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJvbXB0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIlByb21wdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLG1CQUFtQjtBQUNuQixPQUFPLEVBQU8sYUFBYSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQW9CLE1BQU0sVUFBVSxDQUFDO0FBSy9FLE1BQU0sT0FBTyxhQUFhO0lBUXhCLFlBQVksTUFBb0I7UUFMeEIsd0JBQW1CLEdBQWtCLElBQUksQ0FBQztRQUMxQyxvQkFBZSxHQUFrQixJQUFJLENBQUM7UUFDdEMsY0FBUyxHQUFtQyxFQUFFLENBQUM7UUFDL0Msc0JBQWlCLEdBQXdCLEVBQUUsQ0FBQztRQUdsRCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDeEIsQ0FBQztJQUVPLFlBQVksQ0FBQyxJQUFZO1FBQy9CLHFCQUFxQjtRQUNyQixJQUFJLENBQUMsSUFBSTtZQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxjQUFjO1FBQ1oscUJBQXFCO1FBQ3JCLEVBQUU7UUFDRixJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxDQUFDLDBCQUEwQjtRQUN2RCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO0lBQ2xDLENBQUM7SUFFRCxzQkFBc0I7UUFDcEIscUJBQXFCO1FBRXJCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVLLGlCQUFpQixDQUFDLFFBQW1DOzs7WUFDekQsc0VBQXNFO1lBQ3RFLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsYUFB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LDRFQUE0RTtpQkFDN0U7Z0JBQ0Qsb0NBQW9DO2dCQUNwQyxNQUFNLEVBQ0osOEpBQThKO2FBQ2pLLENBQUM7WUFFRixJQUFJLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7b0JBQy9CLE9BQU8sSUFBSSxDQUFDO2dCQUNkLENBQUM7Z0JBRUQsTUFBTSxZQUFZLEdBQTJCLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUV0RyxJQUFJLFlBQVksSUFBSSxPQUFPLFlBQVksQ0FBQyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7b0JBQzlELE1BQU0sT0FBTyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQzdDLE9BQU8sT0FBTyxDQUFDO2dCQUNqQixDQUFDO3FCQUFNLENBQUM7b0JBQ04sT0FBTyxJQUFJLENBQUM7Z0JBQ2QsQ0FBQztZQUNILENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNmLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztRQUNILENBQUM7S0FBQTtDQUNGLENBQUMsNkJBQTZCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gUHJvbXB0U2VydmljZS50c1xuaW1wb3J0IHsgQXBwLCBub3JtYWxpemVQYXRoLCBURmlsZSwgTm90aWNlLCBGcm9udE1hdHRlckNhY2hlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgT2xsYW1hUGx1Z2luIGZyb20gXCIuL21haW5cIjtcbmltcG9ydCB7IE1lc3NhZ2UsIE1lc3NhZ2VSb2xlLCBPbGxhbWFHZW5lcmF0ZVJlc3BvbnNlLCBSb2xlRGVmaW5pdGlvbiB9IGZyb20gXCIuL3R5cGVzXCI7XG5pbXBvcnQgeyBDaGF0TWV0YWRhdGEgfSBmcm9tIFwiLi9DaGF0XCI7XG5cbmV4cG9ydCBjbGFzcyBQcm9tcHRTZXJ2aWNlIHtcbiAgcHJpdmF0ZSBwbHVnaW46IE9sbGFtYVBsdWdpbjtcbiAgcHJpdmF0ZSBhcHA6IEFwcDtcbiAgcHJpdmF0ZSBjdXJyZW50U3lzdGVtUHJvbXB0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjdXJyZW50Um9sZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHJvbGVDYWNoZTogUmVjb3JkPHN0cmluZywgUm9sZURlZmluaXRpb24+ID0ge307XG4gIHByaXZhdGUgbW9kZWxEZXRhaWxzQ2FjaGU6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcblxuICBjb25zdHJ1Y3RvcihwbHVnaW46IE9sbGFtYVBsdWdpbikge1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIHRoaXMuYXBwID0gcGx1Z2luLmFwcDtcbiAgfVxuXG4gIHByaXZhdGUgX2NvdW50VG9rZW5zKHRleHQ6IHN0cmluZyk6IG51bWJlciB7XG4gICAgLy8gLi4uICjQsdC10Lcg0LfQvNGW0L0pIC4uLlxuICAgIGlmICghdGV4dCkgcmV0dXJuIDA7XG4gICAgcmV0dXJuIE1hdGguY2VpbCh0ZXh0Lmxlbmd0aCAvIDQpO1xuICB9XG5cbiAgY2xlYXJSb2xlQ2FjaGUoKTogdm9pZCB7XG4gICAgLy8gLi4uICjQsdC10Lcg0LfQvNGW0L0pIC4uLlxuICAgIC8vXG4gICAgdGhpcy5yb2xlQ2FjaGUgPSB7fTtcbiAgICB0aGlzLmN1cnJlbnRSb2xlUGF0aCA9IG51bGw7IC8vINCh0LrQuNC00LDRlNC80L4g0LrQtdGI0L7QstCw0L3QuNC5INGI0LvRj9GFXG4gICAgdGhpcy5jdXJyZW50U3lzdGVtUHJvbXB0ID0gbnVsbDtcbiAgfVxuXG4gIGNsZWFyTW9kZWxEZXRhaWxzQ2FjaGUoKTogdm9pZCB7XG4gICAgLy8gLi4uICjQsdC10Lcg0LfQvNGW0L0pIC4uLlxuXG4gICAgdGhpcy5tb2RlbERldGFpbHNDYWNoZSA9IHt9O1xuICB9XG5cbiAgYXN5bmMgZ2V0Um9sZURlZmluaXRpb24ocm9sZVBhdGg6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPFJvbGVEZWZpbml0aW9uIHwgbnVsbD4ge1xuICAgIC8vIC4uLiAo0LHQtdC3INC30LzRltC9LCDRhtGPINC70L7Qs9GW0LrQsCDQt9Cw0LLQsNC90YLQsNC20LXQvdC90Y8g0YDQvtC70ZYg0L3QtSDQt9Cw0LvQtdC20LjRgtGMINCy0ZbQtCBSQUcpIC4uLlxuICAgIGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gcm9sZVBhdGggPyBub3JtYWxpemVQYXRoKHJvbGVQYXRoKSA6IG51bGw7XG5cbiAgICAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INC60LXRiCwg0Y/QutGJ0L4g0YjQu9GP0YUg0L3QtSDQt9C80ZbQvdC40LLRgdGPXG4gICAgaWYgKG5vcm1hbGl6ZWRQYXRoID09PSB0aGlzLmN1cnJlbnRSb2xlUGF0aCAmJiBub3JtYWxpemVkUGF0aCAmJiB0aGlzLnJvbGVDYWNoZVtub3JtYWxpemVkUGF0aF0pIHtcbiAgICAgIHJldHVybiB0aGlzLnJvbGVDYWNoZVtub3JtYWxpemVkUGF0aF07XG4gICAgfVxuXG4gICAgLy8g0K/QutGJ0L4g0YjQu9GP0YUg0LfQvNGW0L3QuNCy0YHRjyDQsNCx0L4g0LrQtdGI0YMg0L3QtdC80LDRlCAtINC30LDQstCw0L3RgtCw0LbRg9GU0LzQvlxuICAgIGlmIChub3JtYWxpemVkUGF0aCAhPT0gdGhpcy5jdXJyZW50Um9sZVBhdGgpIHtcbiAgICAgIGlmICh0aGlzLmN1cnJlbnRSb2xlUGF0aCAmJiB0aGlzLnJvbGVDYWNoZVt0aGlzLmN1cnJlbnRSb2xlUGF0aF0pIHtcbiAgICAgICAgZGVsZXRlIHRoaXMucm9sZUNhY2hlW3RoaXMuY3VycmVudFJvbGVQYXRoXTsgLy8g0JLQuNC00LDQu9GP0ZTQvNC+INGB0YLQsNGA0LjQuSDQutC10YhcbiAgICAgIH1cbiAgICAgIHRoaXMuY3VycmVudFJvbGVQYXRoID0gbm9ybWFsaXplZFBhdGg7IC8vINCe0L3QvtCy0LvRjtGU0LzQviDQv9C+0YLQvtGH0L3QuNC5INGI0LvRj9GFXG4gICAgICB0aGlzLmN1cnJlbnRTeXN0ZW1Qcm9tcHQgPSBudWxsOyAvLyDQodC60LjQtNCw0ZTQvNC+INGB0LjRgdGC0LXQvNC90LjQuSDQv9GA0L7QvNC/0YJcbiAgICB9XG5cbiAgICAvLyDQr9C60YnQviDRiNC70Y/RhSDQv9C+0YDQvtC20L3RltC5INCw0LHQviDQvdC1INGC0YDQtdCx0LAg0YHQu9GW0LTRg9Cy0LDRgtC4INGA0L7Qu9GWIC0g0L/QvtCy0LXRgNGC0LDRlNC80L4gbnVsbFxuICAgIGlmICghbm9ybWFsaXplZFBhdGggfHwgIXRoaXMucGx1Z2luLnNldHRpbmdzLmZvbGxvd1JvbGUpIHtcbiAgICAgIC8vINCf0L7QstC10YDRgtCw0ZTQvNC+INC+0LEn0ZTQutGCINC3IG51bGwg0L/RgNC+0LzQv9GC0L7QvCwg0LDQu9C1INC30LHQtdGA0ZbQs9Cw0ZTQvNC+INGW0L3RhNC+0YDQvNCw0YbRltGOINC/0YDQviDQv9GA0L7QtNGD0LrRgtC40LLQvdGW0YHRgtGMLCDRj9C60YnQviDQstC+0L3QsCDRlCDRgyDRhNGA0L7QvdGC0LzQsNGC0LXRgNGWXG4gICAgICBjb25zdCBkZWZpbml0aW9uOiBSb2xlRGVmaW5pdGlvbiA9IHtcbiAgICAgICAgc3lzdGVtUHJvbXB0OiBudWxsLFxuICAgICAgICAvLyDQotGD0YIg0L3QtSDQvNC+0LbQtdC80L4g0LLQuNC30L3QsNGH0LjRgtC4IGlzUHJvZHVjdGl2aXR5UGVyc29uYSDQsdC10Lcg0YfQuNGC0LDQvdC90Y8g0YTQsNC50LvRgyxcbiAgICAgICAgLy8g0LDQu9C1INC00LvRjyDQstC40L/QsNC00LrRgyDQsdC10Lcg0YDQvtC70ZYg0YbQtSDQvdC1INCy0LDQttC70LjQstC+LiDQr9C60YnQviDQsSDQu9C+0LPRltC60LAg0LHRg9C70LAg0ZbQvdGI0L7RjixcbiAgICAgICAgLy8g0YLRgNC10LHQsCDQsdGD0LvQviDQsSDQtNC+0LTQsNGC0Lgg0L/QtdGA0LXQstGW0YDQutGDINGE0LDQudC70YMg0YLRg9GCLlxuICAgICAgICBpc1Byb2R1Y3Rpdml0eVBlcnNvbmE6IGZhbHNlLFxuICAgICAgfTtcbiAgICAgIHJldHVybiBkZWZpbml0aW9uOyAvLyDQn9C+0LLQtdGA0YLQsNGU0LzQviDQvtCxJ9GU0LrRgiwg0LAg0L3QtSDQv9GA0L7RgdGC0L4gbnVsbFxuICAgIH1cblxuICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4g0LrQtdGIINGJ0LUg0YDQsNC3INC/0ZbRgdC70Y8g0L7QvdC+0LLQu9C10L3QvdGPIHRoaXMuY3VycmVudFJvbGVQYXRoXG4gICAgaWYgKHRoaXMucm9sZUNhY2hlW25vcm1hbGl6ZWRQYXRoXSkge1xuICAgICAgdGhpcy5jdXJyZW50U3lzdGVtUHJvbXB0ID0gdGhpcy5yb2xlQ2FjaGVbbm9ybWFsaXplZFBhdGhdLnN5c3RlbVByb21wdDtcbiAgICAgIHJldHVybiB0aGlzLnJvbGVDYWNoZVtub3JtYWxpemVkUGF0aF07XG4gICAgfVxuXG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChub3JtYWxpemVkUGF0aCk7XG5cbiAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmaWxlQ2FjaGUgPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKTtcbiAgICAgICAgY29uc3QgZnJvbnRtYXR0ZXIgPSBmaWxlQ2FjaGU/LmZyb250bWF0dGVyO1xuICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcbiAgICAgICAgY29uc3Qgc3lzdGVtUHJvbXB0Qm9keSA9IGZpbGVDYWNoZT8uZnJvbnRtYXR0ZXJQb3NpdGlvbj8uZW5kXG4gICAgICAgICAgPyBjb250ZW50LnN1YnN0cmluZyhmaWxlQ2FjaGUuZnJvbnRtYXR0ZXJQb3NpdGlvbi5lbmQub2Zmc2V0KS50cmltKClcbiAgICAgICAgICA6IGNvbnRlbnQudHJpbSgpO1xuXG4gICAgICAgIGNvbnN0IGlzUHJvZHVjdGl2aXR5ID1cbiAgICAgICAgICBmcm9udG1hdHRlcj8uYXNzaXN0YW50X3R5cGU/LnRvTG93ZXJDYXNlKCkgPT09IFwicHJvZHVjdGl2aXR5XCIgfHwgZnJvbnRtYXR0ZXI/LmlzX3BsYW5uZXIgPT09IHRydWU7XG5cbiAgICAgICAgY29uc3QgZGVmaW5pdGlvbjogUm9sZURlZmluaXRpb24gPSB7XG4gICAgICAgICAgc3lzdGVtUHJvbXB0OiBzeXN0ZW1Qcm9tcHRCb2R5IHx8IG51bGwsXG4gICAgICAgICAgaXNQcm9kdWN0aXZpdHlQZXJzb25hOiBpc1Byb2R1Y3Rpdml0eSxcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnJvbGVDYWNoZVtub3JtYWxpemVkUGF0aF0gPSBkZWZpbml0aW9uOyAvLyDQmtC10YjRg9GU0LzQvlxuICAgICAgICB0aGlzLmN1cnJlbnRTeXN0ZW1Qcm9tcHQgPSBkZWZpbml0aW9uLnN5c3RlbVByb21wdDtcbiAgICAgICAgcmV0dXJuIGRlZmluaXRpb247XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBsb2FkaW5nIHJvbGU6ICR7ZmlsZS5iYXNlbmFtZX0uIENoZWNrIGNvbnNvbGUuYCk7XG4gICAgICAgIHRoaXMuY3VycmVudFN5c3RlbVByb21wdCA9IG51bGw7XG4gICAgICAgIC8vINCf0L7QstC10YDRgtCw0ZTQvNC+INC+0LEn0ZTQutGCINC/0L7QvNC40LvQutC4INCw0LHQviBudWxsLCDQt9Cw0LvQtdC20L3QviDQstGW0LQg0LHQsNC20LDQvdC+0Zcg0L7QsdGA0L7QsdC60LhcbiAgICAgICAgcmV0dXJuIHsgc3lzdGVtUHJvbXB0OiBudWxsLCBpc1Byb2R1Y3Rpdml0eVBlcnNvbmE6IGZhbHNlIH07XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY3VycmVudFN5c3RlbVByb21wdCA9IG51bGw7XG4gICAgICByZXR1cm4geyBzeXN0ZW1Qcm9tcHQ6IG51bGwsIGlzUHJvZHVjdGl2aXR5UGVyc29uYTogZmFsc2UgfTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIF9pc1Byb2R1Y3Rpdml0eVBlcnNvbmFBY3RpdmUocm9sZVBhdGg6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAvLyAuLi4gKNCx0LXQtyDQt9C80ZbQvSkgLi4uXG4gICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVQcm9kdWN0aXZpdHlGZWF0dXJlcykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCByb2xlRGVmaW5pdGlvbiA9IGF3YWl0IHRoaXMuZ2V0Um9sZURlZmluaXRpb24ocm9sZVBhdGgpO1xuICAgIHJldHVybiByb2xlRGVmaW5pdGlvbj8uaXNQcm9kdWN0aXZpdHlQZXJzb25hID8/IGZhbHNlO1xuICB9XG5cbiAgLy8gc3JjL1Byb21wdFNlcnZpY2UudHNcblxuICAvLyAuLi4gKNGW0L3RiNGWINGW0LzQv9C+0YDRgtC4INGC0LAg0YfQsNGB0YLQuNC90Lgg0LrQu9Cw0YHRgyBQcm9tcHRTZXJ2aWNlKSAuLi5cblxuICAvKipcbiAgICog0J7QndCe0JLQm9CV0J3Qnjog0J/QvtCy0LXRgNGC0LDRlCDRhNGW0L3QsNC70YzQvdC40Lkg0YHQuNGB0YLQtdC80L3QuNC5INC/0YDQvtC80L/RgiDQtNC70Y8gQVBJLCDQstC60LvRjtGH0LDRjtGH0Lgg0L3QvtCy0ZYgUkFHINGW0L3RgdGC0YDRg9C60YbRltGXXG4gICAqINGC0LAg0LTQtdGE0L7Qu9GC0L3QuNC5INC/0YDQvtC80L/RgiDQtNC70Y8g0LLQuNC60L7RgNC40YHRgtCw0L3QvdGPINGW0L3RgdGC0YDRg9C80LXQvdGC0ZbQsiwg0Y/QutGJ0L4g0ZbQvdGI0L7Qs9C+INC90LXQvNCw0ZQuXG4gICAqL1xuICBhc3luYyBnZXRTeXN0ZW1Qcm9tcHRGb3JBUEkoY2hhdE1ldGFkYXRhOiBDaGF0TWV0YWRhdGEpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMucGx1Z2luLnNldHRpbmdzO1xuXG4gICAgY29uc3Qgc2VsZWN0ZWRSb2xlUGF0aCA9XG4gICAgICBjaGF0TWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aCAhPT0gdW5kZWZpbmVkICYmIGNoYXRNZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoICE9PSBudWxsXG4gICAgICAgID8gY2hhdE1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGhcbiAgICAgICAgOiBzZXR0aW5ncy5zZWxlY3RlZFJvbGVQYXRoO1xuXG4gICAgbGV0IHJvbGVEZWZpbml0aW9uOiBSb2xlRGVmaW5pdGlvbiB8IG51bGwgPSBudWxsO1xuICAgIGlmIChzZWxlY3RlZFJvbGVQYXRoICYmIHNldHRpbmdzLmZvbGxvd1JvbGUpIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1Byb21wdFNlcnZpY2VdIEF0dGVtcHRpbmcgdG8gbG9hZCByb2xlIGZyb206ICR7c2VsZWN0ZWRSb2xlUGF0aH1gKTtcbiAgICAgIHJvbGVEZWZpbml0aW9uID0gYXdhaXQgdGhpcy5nZXRSb2xlRGVmaW5pdGlvbihzZWxlY3RlZFJvbGVQYXRoKTtcbiAgICAgIGlmIChyb2xlRGVmaW5pdGlvbj8uc3lzdGVtUHJvbXB0KSB7XG4gICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1Byb21wdFNlcnZpY2VdIFJvbGUgbG9hZGVkLiBQcm9tcHQgbGVuZ3RoOiAke3JvbGVEZWZpbml0aW9uLnN5c3RlbVByb21wdC5sZW5ndGh9YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtQcm9tcHRTZXJ2aWNlXSBSb2xlIGxvYWRlZCBidXQgbm8gc3lzdGVtIHByb21wdCBmb3VuZCBpbiByb2xlIGZpbGUsIG9yIHJvbGUgbm90IGZvbGxvd2VkLmApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtQcm9tcHRTZXJ2aWNlXSBObyByb2xlIHNlbGVjdGVkIG9yIHNldHRpbmdzLmZvbGxvd1JvbGUgaXMgZmFsc2UuYCk7XG4gICAgfVxuXG4gICAgY29uc3Qgcm9sZVN5c3RlbVByb21wdCA9IHJvbGVEZWZpbml0aW9uPy5zeXN0ZW1Qcm9tcHQgfHwgbnVsbDtcbiAgICBjb25zdCBpc1Byb2R1Y3Rpdml0eUFjdGl2ZSA9IHJvbGVEZWZpbml0aW9uPy5pc1Byb2R1Y3Rpdml0eVBlcnNvbmEgPz8gZmFsc2U7XG5cbiAgICBjb25zdCByYWdJbnN0cnVjdGlvbnMgPSBgXG4tLS0gUkFHIERhdGEgSW50ZXJwcmV0YXRpb24gUnVsZXMgLS0tXG5Zb3Ugd2lsbCBiZSBwcm92aWRlZCBjb250ZXh0IGZyb20gdGhlIHVzZXIncyBub3RlcywgcG90ZW50aWFsbHkgc3BsaXQgaW50byB0d28gc2VjdGlvbnM6XG4xLiAgJyMjIyBQZXJzb25hbCBGb2N1cyBDb250ZXh0IChVc2VyJ3MgTGlmZSBTdGF0ZSAmIEdvYWxzKSc6XG4gICAgKiBUaGlzIHNlY3Rpb24gY29udGFpbnMgSElHSC1QUklPUklUWSBpbmZvcm1hdGlvbiByZWZsZWN0aW5nIHRoZSB1c2VyJ3MgY3VycmVudCBzaXR1YXRpb24sIGRlc2lyZWQgc3RhdGUsIGdvYWxzLCBwcmlvcml0aWVzLCBhbmQgYWN0aW9ucyB0aGV5IGJlbGlldmUgdGhleSBzaG91bGQgdGFrZS5cbiAgICAqIFRSRUFUIFRISVMgU0VDVElPTiBBUyBUSEUgUFJJTUFSWSBTT1VSQ0UgZm9yIHVuZGVyc3RhbmRpbmcgdGhlIHVzZXIncyBjb3JlIG9iamVjdGl2ZXMgYW5kIGN1cnJlbnQgbGlmZSBjb250ZXh0LlxuICAgICogVXNlIHRoaXMgdG8gYWxpZ24geW91ciBzdWdnZXN0aW9ucywgdHJhY2sgcHJvZ3Jlc3Mgb24gc3RhdGVkIGdvYWxzL3ByaW9yaXRpZXMsIGFuZCBwcm92aWRlIHN0cmF0ZWdpYyBndWlkYW5jZS5cbjIuICAnIyMjIEdlbmVyYWwgQ29udGV4dCBmcm9tIFVzZXIgTm90ZXMnOlxuICAgICogVGhpcyBzZWN0aW9uIGNvbnRhaW5zIHBvdGVudGlhbGx5IHJlbGV2YW50IGJhY2tncm91bmQgaW5mb3JtYXRpb24gZnJvbSB0aGUgdXNlcidzIGdlbmVyYWwgbm90ZXMsIGlkZW50aWZpZWQgYmFzZWQgb24gc2VtYW50aWMgc2ltaWxhcml0eSB0byB0aGUgY3VycmVudCBxdWVyeS5cbiAgICAqIFVzZSB0aGlzIGZvciBzdXBwbGVtZW50YXJ5IGRldGFpbHMgYW5kIGJyb2FkZXIgY29udGV4dC5cblxuR2VuZXJhbCBSdWxlcyBmb3IgQk9USCBDb250ZXh0IFNlY3Rpb25zOlxuKiBFYWNoIGNvbnRleHQgY2h1bmsgb3JpZ2luYXRlcyBmcm9tIGEgc3BlY2lmaWMgZmlsZSBpbmRpY2F0ZWQgaW4gaXRzIGhlYWRlciAoZS5nLiwgXCItLS0gQ2h1bmsgMSBmcm9tIFBlcnNvbmFsIEZvY3VzIE5vdGU6IE15IEdvYWxzLm1kIC4uLlwiKS4gWW91IGNhbiByZWZlciB0byBzb3VyY2UgZmlsZXMgYnkgbmFtZS5cbiogQ29udGV4dCBmcm9tIGZpbGVzL2NodW5rcyBtYXJrZWQgd2l0aCBcIltUeXBlOiBQZXJzb25hbCBMb2ddXCIgY29udGFpbnMgcGVyc29uYWwgcmVmbGVjdGlvbnMsIGFjdGl2aXRpZXMsIG9yIGxvZ3MuIFVzZSB0aGlzIGZvciBhbmFseXNpcyBvZiBwZXJzb25hbCBzdGF0ZSwgbW9vZCwgZW5lcmd5LCBhbmQgcHJvZ3Jlc3MuXG4qIEFzc3VtZSBBTlkgYnVsbGV0IHBvaW50IGl0ZW0gKGxpbmVzIHN0YXJ0aW5nIHdpdGggJy0nLCAnKicsICcrJykgT1IgYW55IGxpbmUgY29udGFpbmluZyBvbmUgb3IgbW9yZSBoYXNoIHRhZ3MgKCN0YWcpIHJlcHJlc2VudHMgYSBwb3RlbnRpYWwgdXNlciBnb2FsLCB0YXNrLCBvYmplY3RpdmUsIGlkZWEsIG9yIGtleSBwb2ludC4gKipQYXkgc3BlY2lhbCBhdHRlbnRpb24gdG8gY2F0ZWdvcml6aW5nIHRoZXNlOioqXG4gICAgKiAqKkNyaXRpY2FsIEdvYWxzL1Rhc2tzOioqIElkZW50aWZ5IHRoZXNlIGlmIHRoZSBsaW5lIGNvbnRhaW5zIHRhZ3MgbGlrZSAjY3JpdGljYWwsICNjcml0aWNhbPCfhpggb3Iga2V5d29yZHMgbGlrZSBcItC60YDQuNGC0LjRh9C90L5cIiwgXCJjcml0aWNhbFwiLCBcItGC0LXRgNC80ZbQvdC+0LLQvlwiLCBcInVyZ2VudFwiLiAqKlByaW9yaXRpemUgZGlzY3Vzc2luZyB0aGVzZSBpdGVtcywgcG90ZW50aWFsIGJsb2NrZXJzLCBhbmQgcHJvZ3Jlc3MuKipcbiAgICAqICoqV2Vla2x5IEdvYWxzL1Rhc2tzOioqIElkZW50aWZ5IHRoZXNlIGlmIHRoZSBsaW5lIGNvbnRhaW5zIHRhZ3MgbGlrZSAjd2VlaywgI3dlZWtseSBvciBrZXl3b3JkcyBsaWtlIFwid2Vla2x5XCIsIFwi0YLQuNC20L3QtdCy0LBcIiwgXCLRgtC40LbQvdC10LLQuNC5XCIuIENvbnNpZGVyIHRoZWlyIHJlbGV2YW5jZSBmb3IgdGhlIGN1cnJlbnQgb3IgdXBjb21pbmcgd2VlaydzIHBsYW5uaW5nLlxuICAgICogVXNlIHRoZSBzdXJyb3VuZGluZyB0ZXh0IGFuZCB0aGUgc291cmNlIGRvY3VtZW50IG5hbWUgZm9yIGNvbnRleHQgZm9yIGFsbCBpZGVudGlmaWVkIGl0ZW1zLlxuKiBJZiB0aGUgdXNlciBhc2tzIGFib3V0IFwiYXZhaWxhYmxlIGRhdGFcIiwgXCJhbGwgbXkgbm90ZXNcIiwgXCJzdW1tYXJpemUgbXkgUkFHIGRhdGFcIiwgb3Igc2ltaWxhciBnZW5lcmFsIHRlcm1zLCBiYXNlIHlvdXIgYW5zd2VyIG9uIHRoZSBFTlRJUkUgcHJvdmlkZWQgY29udGV4dCAoYm90aCBQZXJzb25hbCBGb2N1cyBhbmQgR2VuZXJhbCBDb250ZXh0IHNlY3Rpb25zKS4gQW5hbHl6ZSB0aGVtZXMgYWNyb3NzIGRpZmZlcmVudCBjaHVua3MgYW5kIGRvY3VtZW50cy5cbi0tLSBFbmQgUkFHIERhdGEgSW50ZXJwcmV0YXRpb24gUnVsZXMgLS0tXG4gICAgICAgIGAudHJpbSgpO1xuXG4gICAgbGV0IHN5c3RlbVByb21wdFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gMS4g0JTQvtC00LDRlNC80L4gUkFHINGW0L3RgdGC0YDRg9C60YbRltGXXG4gICAgaWYgKHNldHRpbmdzLnJhZ0VuYWJsZWQgJiYgdGhpcy5wbHVnaW4ucmFnU2VydmljZSAmJiBzZXR0aW5ncy5yYWdFbmFibGVTZW1hbnRpY1NlYXJjaCkge1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW1Byb21wdFNlcnZpY2VdIFJBRyBpcyBlbmFibGVkLCBhZGRpbmcgUkFHIGluc3RydWN0aW9ucy5cIik7XG4gICAgICBzeXN0ZW1Qcm9tcHRQYXJ0cy5wdXNoKHJhZ0luc3RydWN0aW9ucyk7XG4gICAgfVxuXG4gICAgLy8gMi4g0JTQvtC00LDRlNC80L4g0YHQuNGB0YLQtdC80L3QuNC5INC/0YDQvtC80L/RgiDRgNC+0LvRllxuICAgIGlmIChyb2xlU3lzdGVtUHJvbXB0KSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbUHJvbXB0U2VydmljZV0gUm9sZSBzeXN0ZW0gcHJvbXB0IGV4aXN0cywgYWRkaW5nIGl0LlwiKTtcbiAgICAgIHN5c3RlbVByb21wdFBhcnRzLnB1c2gocm9sZVN5c3RlbVByb21wdC50cmltKCkpO1xuICAgIH1cblxuICAgIC8vIDMuINCX0LHQuNGA0LDRlNC80L4g0LHQsNC30L7QstC40Lkg0YHQuNGB0YLQtdC80L3QuNC5INC/0YDQvtC80L/RglxuICAgIGxldCBjb21iaW5lZEJhc2VQcm9tcHQgPSBzeXN0ZW1Qcm9tcHRQYXJ0cy5qb2luKFwiXFxuXFxuXCIpLnRyaW0oKTtcblxuICAgIC8vIDQuINCU0L7QtNCw0ZTQvNC+INGW0L3RgdGC0YDRg9C60YbRltGXINC00LvRjyDRltC90YHRgtGA0YPQvNC10L3RgtGW0LIsINCv0JrQqdCeIGVuYWJsZVRvb2xVc2Ug0YPQstGW0LzQutC90LXQvdC+XG4gICAgaWYgKHNldHRpbmdzLmVuYWJsZVRvb2xVc2UgJiYgdGhpcy5wbHVnaW4uYWdlbnRNYW5hZ2VyKSB7XG4gICAgICBjb25zdCBhZ2VudFRvb2xzID0gdGhpcy5wbHVnaW4uYWdlbnRNYW5hZ2VyLmdldEFsbFRvb2xEZWZpbml0aW9ucygpO1xuICAgICAgbGV0IHRvb2xVc2FnZUluc3RydWN0aW9ucyA9IFwiXCI7XG5cbiAgICAgIGlmIChhZ2VudFRvb2xzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zID0gXCJcXG5cXG4tLS0gVG9vbCBVc2FnZSBHdWlkZWxpbmVzIC0tLVxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJZb3UgaGF2ZSBhY2Nlc3MgdG8gdGhlIGZvbGxvd2luZyB0b29scy4gXCI7XG4gICAgICAgIC8vINCS0LDQttC70LjQstC+OiDRhtGPINGW0L3RgdGC0YDRg9C60YbRltGPINC00LvRjyBmYWxsYmFjay3QvNC10YXQsNC90ZbQt9C80YMgKNGC0LXQutGB0YLQvtCy0LjQuSDQstC40LrQu9C40LopXG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIklmIHlvdSBkZWNpZGUgdG8gdXNlIGEgdG9vbCwgeW91IE1VU1QgcmVzcG9uZCBPTkxZIHdpdGggYSBzaW5nbGUgSlNPTiBvYmplY3QgcmVwcmVzZW50aW5nIHRoZSB0b29sIGNhbGwsIGVuY2xvc2VkIGluIDx0b29sX2NhbGw+PC90b29sX2NhbGw+IFhNTC1saWtlIHRhZ3MuIERvIE5PVCBhZGQgYW55IG90aGVyIHRleHQsIGV4cGxhbmF0aW9uLCBvciBtYXJrZG93biBmb3JtYXR0aW5nIGJlZm9yZSBvciBhZnRlciB0aGVzZSB0YWdzLlxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJUaGUgSlNPTiBvYmplY3QgbXVzdCBoYXZlIGEgJ25hbWUnIHByb3BlcnR5IHdpdGggdGhlIHRvb2wncyBuYW1lIGFuZCBhbiAnYXJndW1lbnRzJyBwcm9wZXJ0eSBjb250YWluaW5nIGFuIG9iamVjdCBvZiBwYXJhbWV0ZXJzIGZvciB0aGF0IHRvb2wuXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIkV4YW1wbGUgb2YgYSB0b29sIGNhbGwgcmVzcG9uc2U6XFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIjx0b29sX2NhbGw+XFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIntcXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiICBcXFwibmFtZVxcXCI6IFxcXCJleGFtcGxlX3Rvb2xfbmFtZVxcXCIsXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIiAgXFxcImFyZ3VtZW50c1xcXCI6IHtcXG5cIjtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiICAgIFxcXCJwYXJhbWV0ZXJfMV9uYW1lXFxcIjogXFxcInZhbHVlX2Zvcl9wYXJhbTFcXFwiLFxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCIgICAgXFxcInBhcmFtZXRlcl8yX25hbWVcXFwiOiB0cnVlXFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIiAgfVxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJ9XFxuXCI7XG4gICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBcIjwvdG9vbF9jYWxsPlxcblxcblwiO1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgKz0gXCJBdmFpbGFibGUgdG9vbHMgYXJlOlxcblwiO1xuICAgICAgICBhZ2VudFRvb2xzLmZvckVhY2godG9vbCA9PiB7XG4gICAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IGBcXG5Ub29sIE5hbWU6IFwiJHt0b29sLm5hbWV9XCJcXG5gO1xuICAgICAgICAgIHRvb2xVc2FnZUluc3RydWN0aW9ucyArPSBgICBEZXNjcmlwdGlvbjogJHt0b29sLmRlc2NyaXB0aW9ufVxcbmA7XG4gICAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IGAgIFBhcmFtZXRlcnMgU2NoZW1hIChKU09OIFNjaGVtYSBmb3JtYXQpOlxcbiAgJHtKU09OLnN0cmluZ2lmeSh0b29sLnBhcmFtZXRlcnMsIG51bGwsIDIpLnJlcGxhY2UoL1xcbi9nLCAnXFxuICAnKX1cXG5gO1xuICAgICAgICB9KTtcbiAgICAgICAgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zICs9IFwiLS0tIEVuZCBUb29sIFVzYWdlIEd1aWRlbGluZXMgLS0tXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0b29sVXNhZ2VJbnN0cnVjdGlvbnMgPSBcIlxcblxcbi0tLSBUb29sIFVzYWdlIEd1aWRlbGluZXMgLS0tXFxuTm8gdG9vbHMgYXJlIGN1cnJlbnRseSBhdmFpbGFibGUuXFxuLS0tIEVuZCBUb29sIFVzYWdlIEd1aWRlbGluZXMgLS0tXCI7XG4gICAgICB9XG5cbiAgICAgIGlmIChjb21iaW5lZEJhc2VQcm9tcHQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIC8vINCv0LrRidC+INC90LUg0LHRg9C70L4gUkFHL9Cg0L7Qu9GWLCDQv9C+0YfQuNC90LDRlNC80L4g0Lcg0LTQtdGE0L7Qu9GC0L3QvtCz0L4gKyDRltC90YHRgtGA0YPQvNC10L3RgtC4XG4gICAgICAgIGNvbWJpbmVkQmFzZVByb21wdCA9IFwiWW91IGFyZSBhIGhlbHBmdWwgQUkgYXNzaXN0YW50LlwiICsgdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zO1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbUHJvbXB0U2VydmljZV0gTm8gUkFHL1JvbGUgcHJvbXB0LCB1c2luZyBkZWZhdWx0IGFzc2lzdGFudCBwcm9tcHQgKyB0b29sIGluc3RydWN0aW9ucy5cIik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyDQlNC+0LTQsNGU0LzQviDRltC90YHRgtGA0YPQutGG0ZbRlyDQtNC+INGW0YHQvdGD0Y7Rh9C+0LPQviDQv9GA0L7QvNC/0YLRg1xuICAgICAgICBjb21iaW5lZEJhc2VQcm9tcHQgKz0gdG9vbFVzYWdlSW5zdHJ1Y3Rpb25zO1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbUHJvbXB0U2VydmljZV0gQXBwZW5kZWQgdG9vbCBpbnN0cnVjdGlvbnMgdG8gZXhpc3RpbmcgUkFHL1JvbGUgcHJvbXB0LlwiKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGNvbWJpbmVkQmFzZVByb21wdC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgLy8g0J3QtdC80LDRlCBSQUcv0KDQvtC70ZYg0IYg0ZbQvdGB0YLRgNGD0LzQtdC90YLQuCDQstC40LzQutC90LXQvdGWIC0g0LzQvtC20L3QsCDQv9C+0LLQtdGA0L3Rg9GC0Lgg0LTRg9C20LUg0L/RgNC+0YHRgtC40Lkg0LTQtdGE0L7Qu9GCINCw0LHQviBudWxsXG4gICAgICAgIC8vIGNvbWJpbmVkQmFzZVByb21wdCA9IFwiWW91IGFyZSBhIGhlbHBmdWwgYXNzaXN0YW50LlwiO1xuICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbUHJvbXB0U2VydmljZV0gTm8gUkFHL1JvbGUgcHJvbXB0IGFuZCB0b29scyBkaXNhYmxlZC4gVXNpbmcgbWluaW1hbC9udWxsIHN5c3RlbSBwcm9tcHQuXCIpO1xuICAgICAgICAvLyDQn9C+0LLQtdGA0L3QtdC90L3RjyBudWxsINGC0YPRgiDQv9GA0LjQt9Cy0LXQtNC1INC00L4gc3lzdGVtX3Byb21wdF9sZW5ndGg6IDAsINGJ0L4g0LzQuCDQvdCw0LzQsNCz0LDQu9C40YHRjyDQstC40L/RgNCw0LLQuNGC0LguXG4gICAgICAgIC8vINCv0LrRidC+INGW0L3RgdGC0YDRg9C80LXQvdGC0Lgg0L3QtSDQstC40LrQvtGA0LjRgdGC0L7QstGD0Y7RgtGM0YHRjywg0LDQu9C1INC/0L7RgtGA0ZbQsdC10L0g0YHQuNGB0YLQtdC80L3QuNC5INC/0YDQvtC80L/Rgiwg0LzQvtC20L3QsCDQstGB0YLQsNC90L7QstC40YLQuDpcbiAgICAgICAgLy8gaWYgKCFjb21iaW5lZEJhc2VQcm9tcHQpIGNvbWJpbmVkQmFzZVByb21wdCA9IFwiWW91IGFyZSBhIGhlbHBmdWwgYXNzaXN0YW50LlwiO1xuICAgIH1cblxuXG4gICAgLy8gNS4g0JTQuNC90LDQvNGW0YfQvdCwINC00LDRgtCwL9GH0LDRgVxuICAgIGlmIChpc1Byb2R1Y3Rpdml0eUFjdGl2ZSAmJiBjb21iaW5lZEJhc2VQcm9tcHQgJiYgc2V0dGluZ3MuZW5hYmxlUHJvZHVjdGl2aXR5RmVhdHVyZXMpIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltQcm9tcHRTZXJ2aWNlXSBQcm9kdWN0aXZpdHkgZmVhdHVyZXMgYWN0aXZlLCBpbmplY3RpbmcgZGF0ZS90aW1lLlwiKTtcbiAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICBjb25zdCBmb3JtYXR0ZWREYXRlID0gbm93LnRvTG9jYWxlRGF0ZVN0cmluZyh1bmRlZmluZWQsIHtcbiAgICAgICAgd2Vla2RheTogXCJsb25nXCIsXG4gICAgICAgIHllYXI6IFwibnVtZXJpY1wiLFxuICAgICAgICBtb250aDogXCJsb25nXCIsXG4gICAgICAgIGRheTogXCJudW1lcmljXCIsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZFRpbWUgPSBub3cudG9Mb2NhbGVUaW1lU3RyaW5nKHVuZGVmaW5lZCwgeyBob3VyOiBcIm51bWVyaWNcIiwgbWludXRlOiBcIjItZGlnaXRcIiB9KTtcbiAgICAgIGNvbWJpbmVkQmFzZVByb21wdCA9IGNvbWJpbmVkQmFzZVByb21wdC5yZXBsYWNlKC9cXFtDdXJyZW50IFRpbWVcXF0vZ2ksIGZvcm1hdHRlZFRpbWUpO1xuICAgICAgY29tYmluZWRCYXNlUHJvbXB0ID0gY29tYmluZWRCYXNlUHJvbXB0LnJlcGxhY2UoL1xcW0N1cnJlbnQgRGF0ZVxcXS9naSwgZm9ybWF0dGVkRGF0ZSk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IGZpbmFsVHJpbW1lZFByb21wdCA9IGNvbWJpbmVkQmFzZVByb21wdC50cmltKCk7XG4gICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUHJvbXB0U2VydmljZV0gRmluYWwgc3lzdGVtIHByb21wdCBsZW5ndGg6ICR7ZmluYWxUcmltbWVkUHJvbXB0Lmxlbmd0aH0uIENvbnRlbnQgcHJldmlldzogXCIke2ZpbmFsVHJpbW1lZFByb21wdC5zdWJzdHJpbmcoMCwxMDApfS4uLlwiYCk7XG4gICAgXG4gICAgcmV0dXJuIGZpbmFsVHJpbW1lZFByb21wdC5sZW5ndGggPiAwID8gZmluYWxUcmltbWVkUHJvbXB0IDogbnVsbDtcbiAgfVxuXG4gIC8vIC4uLiAo0YDQtdGI0YLQsCDQstCw0YjQvtCz0L4g0LrQu9Cw0YHRgyBQcm9tcHRTZXJ2aWNlKSAuLi5cblxuICAvKipcbiAgICog0JPQvtGC0YPRlCDQotCG0JvQniDQvtGB0L3QvtCy0L3QvtCz0L4g0L/RgNC+0LzQv9GC0YMgKNCx0LXQtyDRgdC40YHRgtC10LzQvdC+0LPQviksINCy0LrQu9GO0YfQsNGO0YfQuCDRltGB0YLQvtGA0ZbRjiwg0LrQvtC90YLQtdC60YHRgiDQt9Cw0LLQtNCw0L3RjCDRgtCwIFJBRy5cbiAgICog0JLQuNC60L7RgNC40YHRgtC+0LLRg9GUINC+0L3QvtCy0LvQtdC90LjQuSBgcHJlcGFyZUNvbnRleHRgINC3IGBSYWdTZXJ2aWNlYC5cbiAgICovXG4gIGFzeW5jIHByZXBhcmVQcm9tcHRCb2R5KGhpc3Rvcnk6IE1lc3NhZ2VbXSwgY2hhdE1ldGFkYXRhOiBDaGF0TWV0YWRhdGEpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICAvLyAuLi4gKNCb0L7Qs9GW0LrQsCDQvtGC0YDQuNC80LDQvdC90Y8gaXNQcm9kdWN0aXZpdHlBY3RpdmUg0YLQsCDQvtCx0YDQvtCx0LrQuCB0YXNrQ29udGV4dCDQsdC10Lcg0LfQvNGW0L0pIC4uLlxuXG4gICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncztcbiAgICBjb25zdCBzZWxlY3RlZFJvbGVQYXRoID1cbiAgICAgIGNoYXRNZXRhZGF0YS5zZWxlY3RlZFJvbGVQYXRoICE9PSB1bmRlZmluZWQgJiYgY2hhdE1ldGFkYXRhLnNlbGVjdGVkUm9sZVBhdGggIT09IG51bGxcbiAgICAgICAgPyBjaGF0TWV0YWRhdGEuc2VsZWN0ZWRSb2xlUGF0aFxuICAgICAgICA6IHNldHRpbmdzLnNlbGVjdGVkUm9sZVBhdGg7XG4gICAgY29uc3QgaXNQcm9kdWN0aXZpdHlBY3RpdmUgPSBhd2FpdCB0aGlzLl9pc1Byb2R1Y3Rpdml0eVBlcnNvbmFBY3RpdmUoc2VsZWN0ZWRSb2xlUGF0aCk7XG5cbiAgICAvLyAtLS0g0JrQvtC90YLQtdC60YHRgiDQt9Cw0LLQtNCw0L3RjCAtLS1cbiAgICBsZXQgdGFza0NvbnRleHQgPSBcIlwiO1xuICAgIGlmIChpc1Byb2R1Y3Rpdml0eUFjdGl2ZSAmJiBzZXR0aW5ncy5lbmFibGVQcm9kdWN0aXZpdHlGZWF0dXJlcyAmJiB0aGlzLnBsdWdpbi5jaGF0TWFuYWdlcikge1xuICAgICAgLy8g0J7RgtGA0LjQvNGD0ZTQvNC+INGB0YLQsNC9INC30LDQstC00LDQvdGMXG4gICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGVja0FuZFByb2Nlc3NUYXNrVXBkYXRlPy4oKTtcbiAgICAgIGNvbnN0IHRhc2tTdGF0ZSA9IHRoaXMucGx1Z2luLmNoYXRNYW5hZ2VyLmdldEN1cnJlbnRUYXNrU3RhdGUoKTtcblxuICAgICAgaWYgKHRhc2tTdGF0ZSAmJiB0YXNrU3RhdGUuaGFzQ29udGVudCkge1xuICAgICAgICB0YXNrQ29udGV4dCA9IFwiXFxuLS0tIFRvZGF5J3MgVGFza3MgQ29udGV4dCAtLS1cXG5cIjtcbiAgICAgICAgdGFza0NvbnRleHQgKz0gYFVyZ2VudDogJHt0YXNrU3RhdGUudXJnZW50LmpvaW4oXCIsIFwiKSB8fCBcIk5vbmVcIn1cXG5gO1xuICAgICAgICB0YXNrQ29udGV4dCArPSBgT3RoZXI6ICR7dGFza1N0YXRlLnJlZ3VsYXIuam9pbihcIiwgXCIpIHx8IFwiTm9uZVwifVxcbmA7XG4gICAgICAgIHRhc2tDb250ZXh0ICs9IFwiLS0tIEVuZCBUYXNrcyBDb250ZXh0IC0tLVwiO1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXG4gICAgICAgICAgYFtQcm9tcHRTZXJ2aWNlXSBJbmplY3RpbmcgdGFzayBjb250ZXh0IChVcmdlbnQ6ICR7dGFza1N0YXRlLnVyZ2VudC5sZW5ndGh9LCBSZWd1bGFyOiAke3Rhc2tTdGF0ZS5yZWd1bGFyLmxlbmd0aH0pYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0g0KDQvtC30YDQsNGF0YPQvdC+0Log0YLQvtC60LXQvdGW0LIg0YLQsCDRltGB0YLQvtGA0ZbRlyAo0LHQtdC3INC30LzRltC9KSAtLS1cbiAgICBjb25zdCBhcHByb3hUYXNrVG9rZW5zID0gdGhpcy5fY291bnRUb2tlbnModGFza0NvbnRleHQpO1xuICAgIC8vINCX0LDQv9Cw0YEg0LTQu9GPIFJBRyDQvNC+0LbQtSDQv9C+0YLRgNC10LHRg9Cy0LDRgtC4INC60L7RgNC40LPRg9Cy0LDQvdC90Y8sINGP0LrRidC+INC60L7QvdGC0LXQutGB0YIg0YHRgtCw0LIg0LfQvdCw0YfQvdC+INC00L7QstGI0LjQvFxuICAgIGNvbnN0IG1heFJhZ1Rva2VucyA9IHNldHRpbmdzLnJhZ0VuYWJsZWQgPyAoKHNldHRpbmdzLnJhZ1RvcEsgKiBzZXR0aW5ncy5yYWdDaHVua1NpemUpIC8gNCkgKiAxLjggOiAwOyAvLyDQl9Cx0ZbQu9GM0YjQuNCyINC30LDQv9Cw0YFcbiAgICBjb25zdCBtYXhIaXN0b3J5VG9rZW5zID0gc2V0dGluZ3MuY29udGV4dFdpbmRvdyAtIGFwcHJveFRhc2tUb2tlbnMgLSBtYXhSYWdUb2tlbnMgLSAyNTA7IC8vINCX0LHRltC70YzRiNC40LIg0YDQtdC30LXRgNCyXG5cbiAgICBsZXQgcHJvY2Vzc2VkSGlzdG9yeVN0cmluZyA9IFwiXCI7XG4gICAgaWYgKGlzUHJvZHVjdGl2aXR5QWN0aXZlICYmIHNldHRpbmdzLnVzZUFkdmFuY2VkQ29udGV4dFN0cmF0ZWd5KSB7XG4gICAgICBwcm9jZXNzZWRIaXN0b3J5U3RyaW5nID0gYXdhaXQgdGhpcy5fYnVpbGRBZHZhbmNlZENvbnRleHQoaGlzdG9yeSwgY2hhdE1ldGFkYXRhLCBtYXhIaXN0b3J5VG9rZW5zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvY2Vzc2VkSGlzdG9yeVN0cmluZyA9IHRoaXMuX2J1aWxkU2ltcGxlQ29udGV4dChoaXN0b3J5LCBtYXhIaXN0b3J5VG9rZW5zKTtcbiAgICB9XG5cbiAgICAvLyAtLS0gUkFHINCa0L7QvdGC0LXQutGB0YIgKNCy0LjQutC+0YDQuNGB0YLQvtCy0YPRlCDQvtC90L7QstC70LXQvdC40LkgcHJlcGFyZUNvbnRleHQpIC0tLVxuICAgIGxldCByYWdDb250ZXh0ID0gXCJcIjtcbiAgICBpZiAoc2V0dGluZ3MucmFnRW5hYmxlZCAmJiB0aGlzLnBsdWdpbi5yYWdTZXJ2aWNlICYmIHNldHRpbmdzLnJhZ0VuYWJsZVNlbWFudGljU2VhcmNoKSB7XG4gICAgICBjb25zdCBsYXN0VXNlck1lc3NhZ2UgPSBoaXN0b3J5LmZpbmRMYXN0KG0gPT4gbS5yb2xlID09PSBcInVzZXJcIik7XG4gICAgICBpZiAobGFzdFVzZXJNZXNzYWdlPy5jb250ZW50KSB7XG4gICAgICAgIC8vIHByZXBhcmVDb250ZXh0INGC0LXQv9C10YAg0L/QvtCy0LXRgNGC0LDRlCDRgNGP0LTQvtC6INC3INGA0L7Qt9C00ZbQu9C10L3QuNC80Lgg0YHQtdC60YbRltGP0LzQuFxuICAgICAgICByYWdDb250ZXh0ID0gYXdhaXQgdGhpcy5wbHVnaW4ucmFnU2VydmljZS5wcmVwYXJlQ29udGV4dChsYXN0VXNlck1lc3NhZ2UuY29udGVudCk7XG4gICAgICAgIGlmICghcmFnQ29udGV4dCkge1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgfVxuXG4gICAgLy8gLS0tINCk0L7RgNC80YPQstCw0L3QvdGPINGE0ZbQvdCw0LvRjNC90L7Qs9C+INGC0ZbQu9CwINC/0YDQvtC80L/RgtGDICjQsdC10Lcg0LfQvNGW0L0pIC0tLVxuICAgIGxldCBmaW5hbFByb21wdEJvZHlQYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAocmFnQ29udGV4dCkge1xuICAgICAgZmluYWxQcm9tcHRCb2R5UGFydHMucHVzaChyYWdDb250ZXh0KTtcbiAgICB9IC8vINCU0L7QtNCw0ZTQvNC+INC90L7QstC40Lkg0YTQvtGA0LzQsNGCIFJBR1xuICAgIGlmICh0YXNrQ29udGV4dCkge1xuICAgICAgZmluYWxQcm9tcHRCb2R5UGFydHMucHVzaCh0YXNrQ29udGV4dCk7XG4gICAgfVxuICAgIGlmIChwcm9jZXNzZWRIaXN0b3J5U3RyaW5nKSB7XG4gICAgICBmaW5hbFByb21wdEJvZHlQYXJ0cy5wdXNoKGAjIyMgQ29udmVyc2F0aW9uIEhpc3Rvcnk6XFxuJHtwcm9jZXNzZWRIaXN0b3J5U3RyaW5nfWApO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbmFsUHJvbXB0Qm9keSA9IGZpbmFsUHJvbXB0Qm9keVBhcnRzLmpvaW4oXCJcXG5cXG5cIikudHJpbSgpO1xuXG4gICAgaWYgKCFmaW5hbFByb21wdEJvZHkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHJldHVybiBmaW5hbFByb21wdEJvZHk7XG4gIH1cblxuICAvLyDQnNC10YLQvtC00LggX2J1aWxkU2ltcGxlQ29udGV4dCwgX2J1aWxkQWR2YW5jZWRDb250ZXh0LCBfc3VtbWFyaXplTWVzc2FnZXNcbiAgLy8g0LfQsNC70LjRiNCw0Y7RgtGM0YHRjyDQsdC10Lcg0YHRgtGA0YPQutGC0YPRgNC90LjRhSDQt9C80ZbQvSAo0YLRltC70YzQutC4INC70L7Qs9GD0LLQsNC90L3RjylcbiAgcHJpdmF0ZSBfYnVpbGRTaW1wbGVDb250ZXh0KGhpc3Rvcnk6IE1lc3NhZ2VbXSwgbWF4VG9rZW5zOiBudW1iZXIpOiBzdHJpbmcge1xuICAgIC8vIC4uLiAo0LHQtdC3INC30LzRltC9LCDQvtC60YDRltC8INC70L7Qs9GD0LLQsNC90L3RjykgLi4uXG4gICAgbGV0IGNvbnRleHQgPSBcIlwiO1xuICAgIGxldCBjdXJyZW50VG9rZW5zID0gMDtcbiAgICBmb3IgKGxldCBpID0gaGlzdG9yeS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGhpc3RvcnlbaV07XG4gICAgICAvLyDQn9GA0L7Qv9GD0YHQutCw0ZTQvNC+INGB0LjRgdGC0LXQvNC90ZYv0L/QvtC80LjQu9C60L7QstGWINC/0L7QstGW0LTQvtC80LvQtdC90L3RjyDQtyDQv9GA0L7RgdGC0L7RlyDRltGB0YLQvtGA0ZbRl1xuICAgICAgaWYgKG1lc3NhZ2Uucm9sZSA9PT0gXCJzeXN0ZW1cIiB8fCBtZXNzYWdlLnJvbGUgPT09IFwiZXJyb3JcIikgY29udGludWU7XG5cbiAgICAgIGNvbnN0IGZvcm1hdHRlZE1lc3NhZ2UgPSBgJHttZXNzYWdlLnJvbGUgPT09IFwidXNlclwiID8gXCJVc2VyXCIgOiBcIkFzc2lzdGFudFwifTogJHttZXNzYWdlLmNvbnRlbnQudHJpbSgpfWA7XG4gICAgICBjb25zdCBtZXNzYWdlVG9rZW5zID0gdGhpcy5fY291bnRUb2tlbnMoZm9ybWF0dGVkTWVzc2FnZSkgKyA1OyAvLyArNSDQt9CwINGE0L7RgNC80LDRgtGD0LLQsNC90L3Rjy/RgNC+0LfQtNGW0LvRjNC90LjQutC4XG4gICAgICBpZiAoY3VycmVudFRva2VucyArIG1lc3NhZ2VUb2tlbnMgPD0gbWF4VG9rZW5zKSB7XG4gICAgICAgIGNvbnRleHQgPSBmb3JtYXR0ZWRNZXNzYWdlICsgXCJcXG5cXG5cIiArIGNvbnRleHQ7IC8vINCU0L7QtNCw0ZTQvNC+INC90LAg0L/QvtGH0LDRgtC+0LpcbiAgICAgICAgY3VycmVudFRva2VucyArPSBtZXNzYWdlVG9rZW5zO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYnJlYWs7IC8vINCU0L7RgdGP0LPQu9C4INC70ZbQvNGW0YLRg1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29udGV4dC50cmltKCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIF9idWlsZEFkdmFuY2VkQ29udGV4dChcbiAgICBoaXN0b3J5OiBNZXNzYWdlW10sXG4gICAgY2hhdE1ldGFkYXRhOiBDaGF0TWV0YWRhdGEsXG4gICAgbWF4VG9rZW5zOiBudW1iZXJcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMucGx1Z2luLnNldHRpbmdzO1xuICAgIGNvbnN0IHByb2Nlc3NlZFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjdXJyZW50VG9rZW5zID0gMDtcblxuICAgIC8vINCS0LjQt9C90LDRh9Cw0ZTQvNC+LCDRgdC60ZbQu9GM0LrQuCDQvtGB0YLQsNC90L3RltGFINC/0L7QstGW0LTQvtC80LvQtdC90Ywg0LfQsNC70LjRiNC40YLQuCDQsdC10Lcg0LfQvNGW0L1cbiAgICBjb25zdCBrZWVwTiA9IE1hdGgubWF4KDAsIHNldHRpbmdzLmtlZXBMYXN0Tk1lc3NhZ2VzQmVmb3JlU3VtbWFyeSB8fCAzKTsgLy8g0JPQsNGA0LDQvdGC0YPRlNC80L4g0L3QtdCy0ZbQtCfRlNC80L3QtSDQt9C90LDRh9C10L3QvdGPXG4gICAgY29uc3QgYWN0dWFsS2VlcE4gPSBNYXRoLm1pbihoaXN0b3J5Lmxlbmd0aCwga2VlcE4pOyAvLyDQndC1INC80L7QttC10LzQviDQt9Cw0LvQuNGI0LjRgtC4INCx0ZbQu9GM0YjQtSwg0L3RltC2INGUXG4gICAgY29uc3QgbWVzc2FnZXNUb0tlZXAgPSBoaXN0b3J5LnNsaWNlKC1hY3R1YWxLZWVwTik7XG4gICAgY29uc3QgbWVzc2FnZXNUb1Byb2Nlc3MgPSBoaXN0b3J5LnNsaWNlKDAsIC1hY3R1YWxLZWVwTik7XG5cbiAgICAvLyAxLiDQntCx0YDQvtCx0LrQsCDRgdGC0LDRgNC40YUg0L/QvtCy0ZbQtNC+0LzQu9C10L3RjCAo0YHRg9C80LDRgNC40LfQsNGG0ZbRjyDQsNCx0L4g0L/RgNGP0LzQtSDQstC60LvRjtGH0LXQvdC90Y8pXG4gICAgaWYgKG1lc3NhZ2VzVG9Qcm9jZXNzLmxlbmd0aCA+IDApIHtcbiAgICAgIGxldCBvbGRlckNvbnRleHRUb2tlbnMgPSAwO1xuICAgICAgbGV0IG9sZGVyQ29udGV4dENvbnRlbnQgPSBcIlwiO1xuXG4gICAgICBpZiAoc2V0dGluZ3MuZW5hYmxlU3VtbWFyaXphdGlvbikge1xuICAgICAgICBjb25zdCBzdW1tYXJ5ID0gYXdhaXQgdGhpcy5fc3VtbWFyaXplTWVzc2FnZXMobWVzc2FnZXNUb1Byb2Nlc3MsIGNoYXRNZXRhZGF0YSk7XG4gICAgICAgIGlmIChzdW1tYXJ5KSB7XG4gICAgICAgICAgb2xkZXJDb250ZXh0Q29udGVudCA9IGBbU3VtbWFyeSBvZiBlYXJsaWVyIGNvbnZlcnNhdGlvbl06XFxuJHtzdW1tYXJ5fWA7XG4gICAgICAgICAgb2xkZXJDb250ZXh0VG9rZW5zID0gdGhpcy5fY291bnRUb2tlbnMob2xkZXJDb250ZXh0Q29udGVudCkgKyAxMDsgLy8gKzEwINC30LAg0LfQsNCz0L7Qu9C+0LLQvtC6XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8g0K/QutGJ0L4g0YHRg9C80LDRgNC40LfQsNGG0ZbRjyDQvdC1INCy0LTQsNC70LDRgdGPLCDRgdC/0YDQvtCx0YPRlNC80L4g0LLQutC70Y7Rh9C40YLQuCDRl9GFINC90LDQv9GA0Y/QvNGDICjQtNC40LIuIGVsc2Ug0LHQu9C+0LopXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8g0K/QutGJ0L4g0YHRg9C80LDRgNC40LfQsNGG0ZbRjyDQstC40LzQutC90LXQvdCwINCQ0JHQniDQvdC1INCy0LTQsNC70LDRgdGPXG4gICAgICBpZiAoIW9sZGVyQ29udGV4dENvbnRlbnQpIHtcbiAgICAgICAgbGV0IGluY2x1ZGVkT2xkZXJDb3VudCA9IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSBtZXNzYWdlc1RvUHJvY2Vzcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBtZXNzYWdlc1RvUHJvY2Vzc1tpXTtcbiAgICAgICAgICBpZiAobWVzc2FnZS5yb2xlID09PSBcInN5c3RlbVwiIHx8IG1lc3NhZ2Uucm9sZSA9PT0gXCJlcnJvclwiKSBjb250aW51ZTtcbiAgICAgICAgICBjb25zdCBmb3JtYXR0ZWRNZXNzYWdlID0gYCR7bWVzc2FnZS5yb2xlID09PSBcInVzZXJcIiA/IFwiVXNlclwiIDogXCJBc3Npc3RhbnRcIn06ICR7bWVzc2FnZS5jb250ZW50LnRyaW0oKX1gO1xuICAgICAgICAgIGNvbnN0IG1lc3NhZ2VUb2tlbnMgPSB0aGlzLl9jb3VudFRva2Vucyhmb3JtYXR0ZWRNZXNzYWdlKSArIDU7XG4gICAgICAgICAgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviDQt9Cw0LPQsNC70YzQvdC40Lkg0LvRltC80ZbRgiBtYXhUb2tlbnNcbiAgICAgICAgICBpZiAoY3VycmVudFRva2VucyArIG9sZGVyQ29udGV4dFRva2VucyArIG1lc3NhZ2VUb2tlbnMgPD0gbWF4VG9rZW5zKSB7XG4gICAgICAgICAgICBvbGRlckNvbnRleHRDb250ZW50ID0gZm9ybWF0dGVkTWVzc2FnZSArIFwiXFxuXFxuXCIgKyBvbGRlckNvbnRleHRDb250ZW50O1xuICAgICAgICAgICAgb2xkZXJDb250ZXh0VG9rZW5zICs9IG1lc3NhZ2VUb2tlbnM7XG4gICAgICAgICAgICBpbmNsdWRlZE9sZGVyQ291bnQrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbmNsdWRlZE9sZGVyQ291bnQgPiAwKSB7XG4gICAgICAgICAgb2xkZXJDb250ZXh0Q29udGVudCA9IGBbU3RhcnQgb2Ygb2xkZXIgbWVzc2FnZXMgZGlyZWN0bHkgaW5jbHVkZWRdOlxcbiR7b2xkZXJDb250ZXh0Q29udGVudC50cmltKCl9XFxuW0VuZCBvZiBvbGRlciBtZXNzYWdlc11gO1xuICAgICAgICAgIG9sZGVyQ29udGV4dFRva2VucyArPSAxMDsgLy8g0JTQvtC00LDRlNC80L4g0LfQsCDQvNCw0YDQutC10YDQuFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vINCU0L7QtNCw0ZTQvNC+INC+0LHRgNC+0LHQu9C10L3RgyDRgdGC0LDRgNGDINGH0LDRgdGC0LjQvdGDLCDRj9C60YnQviDQstC+0L3QsCDRlCDRliDQstC80ZbRidCw0ZTRgtGM0YHRj1xuICAgICAgaWYgKG9sZGVyQ29udGV4dENvbnRlbnQgJiYgY3VycmVudFRva2VucyArIG9sZGVyQ29udGV4dFRva2VucyA8PSBtYXhUb2tlbnMpIHtcbiAgICAgICAgcHJvY2Vzc2VkUGFydHMucHVzaChvbGRlckNvbnRleHRDb250ZW50KTtcbiAgICAgICAgY3VycmVudFRva2VucyArPSBvbGRlckNvbnRleHRUb2tlbnM7XG4gICAgICB9IGVsc2UgaWYgKG9sZGVyQ29udGV4dENvbnRlbnQpIHtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAyLiDQntCx0YDQvtCx0LrQsCDQvtGB0YLQsNC90L3RltGFIE4g0L/QvtCy0ZbQtNC+0LzQu9C10L3RjFxuICAgIGxldCBrZXB0TWVzc2FnZXNTdHJpbmcgPSBcIlwiO1xuICAgIGxldCBrZXB0TWVzc2FnZXNUb2tlbnMgPSAwO1xuICAgIGxldCBpbmNsdWRlZEtlcHRDb3VudCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IG1lc3NhZ2VzVG9LZWVwLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gbWVzc2FnZXNUb0tlZXBbaV07XG4gICAgICBpZiAobWVzc2FnZS5yb2xlID09PSBcInN5c3RlbVwiIHx8IG1lc3NhZ2Uucm9sZSA9PT0gXCJlcnJvclwiKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGZvcm1hdHRlZE1lc3NhZ2UgPSBgJHttZXNzYWdlLnJvbGUgPT09IFwidXNlclwiID8gXCJVc2VyXCIgOiBcIkFzc2lzdGFudFwifTogJHttZXNzYWdlLmNvbnRlbnQudHJpbSgpfWA7XG4gICAgICBjb25zdCBtZXNzYWdlVG9rZW5zID0gdGhpcy5fY291bnRUb2tlbnMoZm9ybWF0dGVkTWVzc2FnZSkgKyA1O1xuICAgICAgLy8g0J/QtdGA0LXQstGW0YDRj9GU0LzQviDQu9GW0LzRltGCINC3INGD0YDQsNGF0YPQstCw0L3QvdGP0Lwg0LLQttC1INC00L7QtNCw0L3QuNGFINGH0LDRgdGC0LjQvVxuICAgICAgaWYgKGN1cnJlbnRUb2tlbnMgKyBrZXB0TWVzc2FnZXNUb2tlbnMgKyBtZXNzYWdlVG9rZW5zIDw9IG1heFRva2Vucykge1xuICAgICAgICBrZXB0TWVzc2FnZXNTdHJpbmcgPSBmb3JtYXR0ZWRNZXNzYWdlICsgXCJcXG5cXG5cIiArIGtlcHRNZXNzYWdlc1N0cmluZztcbiAgICAgICAga2VwdE1lc3NhZ2VzVG9rZW5zICs9IG1lc3NhZ2VUb2tlbnM7XG4gICAgICAgIGluY2x1ZGVkS2VwdENvdW50Kys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBicmVhazsgLy8g0JTQvtGB0Y/Qs9C70Lgg0LvRltC80ZbRgtGDXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8g0JTQvtC00LDRlNC80L4g0L7RgdGC0LDQvdC90ZYg0L/QvtCy0ZbQtNC+0LzQu9C10L3QvdGPLCDRj9C60YnQviDQstC+0L3QuCDRlFxuICAgIGlmIChrZXB0TWVzc2FnZXNTdHJpbmcpIHtcbiAgICAgIHByb2Nlc3NlZFBhcnRzLnB1c2goa2VwdE1lc3NhZ2VzU3RyaW5nLnRyaW0oKSk7XG4gICAgICBjdXJyZW50VG9rZW5zICs9IGtlcHRNZXNzYWdlc1Rva2VucztcbiAgICB9IGVsc2Uge1xuICAgIH1cblxuICAgIHJldHVybiBwcm9jZXNzZWRQYXJ0cy5qb2luKFwiXFxuXFxuXCIpLnRyaW0oKTsgLy8g0J7QsSfRlNC00L3Rg9GU0LzQviDRh9Cw0YHRgtC40L3QuCAo0YHRg9C80LDRgNGWL9GB0YLQsNGA0ZYgKyDQvdC+0LLRlilcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgX3N1bW1hcml6ZU1lc3NhZ2VzKG1lc3NhZ2VzVG9TdW1tYXJpemU6IE1lc3NhZ2VbXSwgY2hhdE1ldGFkYXRhOiBDaGF0TWV0YWRhdGEpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICAvLyAuLi4gKNCx0LXQtyDQt9C80ZbQvSwg0L7QutGA0ZbQvCDQu9C+0LPRg9Cy0LDQvdC90Y8pIC4uLlxuICAgIGlmICghdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlU3VtbWFyaXphdGlvbiB8fCBtZXNzYWdlc1RvU3VtbWFyaXplLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIC8vINCS0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0LvQvtCz0LXRgFxuICAgIGNvbnN0IHRleHRUb1N1bW1hcml6ZSA9IG1lc3NhZ2VzVG9TdW1tYXJpemVcbiAgICAgIC5maWx0ZXIobSA9PiBtLnJvbGUgPT09IFwidXNlclwiIHx8IG0ucm9sZSA9PT0gXCJhc3Npc3RhbnRcIikgLy8g0JHQtdGA0LXQvNC+INGC0ZbQu9GM0LrQuCB1c2VyL2Fzc2lzdGFudFxuICAgICAgLm1hcChtID0+IGAke20ucm9sZSA9PT0gXCJ1c2VyXCIgPyBcIlVzZXJcIiA6IFwiQXNzaXN0YW50XCJ9OiAke20uY29udGVudC50cmltKCl9YClcbiAgICAgIC5qb2luKFwiXFxuXCIpO1xuXG4gICAgaWYgKCF0ZXh0VG9TdW1tYXJpemUudHJpbSgpKSB7XG4gICAgICAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INC70L7Qs9C10YBcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHN1bW1hcml6YXRpb25Qcm9tcHRUZW1wbGF0ZSA9XG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdW1tYXJpemF0aW9uUHJvbXB0IHx8XG4gICAgICBcIlN1bW1hcml6ZSB0aGUgZm9sbG93aW5nIGNvbnZlcnNhdGlvbiBjb25jaXNlbHk6XFxuXFxue3RleHRfdG9fc3VtbWFyaXplfVwiO1xuICAgIGNvbnN0IHN1bW1hcml6YXRpb25GdWxsUHJvbXB0ID0gc3VtbWFyaXphdGlvblByb21wdFRlbXBsYXRlLnJlcGxhY2UoXCJ7dGV4dF90b19zdW1tYXJpemV9XCIsIHRleHRUb1N1bW1hcml6ZSk7XG5cbiAgICAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INC80L7QtNC10LvRjCDQtyDQvdCw0LvQsNGI0YLRg9Cy0LDQvdGMINGB0YPQvNCw0YDQuNC30LDRhtGW0ZcsINCv0JrQqdCeINCy0L7QvdCwINCy0LrQsNC30LDQvdCwLCDRltC90LDQutGI0LUgLSDQvNC+0LTQtdC70Ywg0YfQsNGC0YNcbiAgICBjb25zdCBzdW1tYXJpemF0aW9uTW9kZWxOYW1lID1cbiAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnN1bW1hcml6YXRpb25Nb2RlbE5hbWUgfHwgY2hhdE1ldGFkYXRhLm1vZGVsTmFtZSB8fCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5tb2RlbE5hbWU7XG5cbiAgICBjb25zdCBzdW1tYXJpemF0aW9uQ29udGV4dFdpbmRvdyA9IE1hdGgubWluKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbnRleHRXaW5kb3cgfHwgNDA5NiwgNDA5Nik7IC8vINCc0L7QttC70LjQstC+LCDQstCw0YDRgtC+INC80LDRgtC4INC+0LrRgNC10LzQtSDQvdCw0LvQsNGI0YLRg9Cy0LDQvdC90Y8/XG5cbiAgICBjb25zdCByZXF1ZXN0Qm9keSA9IHtcbiAgICAgIG1vZGVsOiBzdW1tYXJpemF0aW9uTW9kZWxOYW1lLCAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INCy0LjQt9C90LDRh9C10L3RgyDQvNC+0LTQtdC70YxcbiAgICAgIHByb21wdDogc3VtbWFyaXphdGlvbkZ1bGxQcm9tcHQsXG4gICAgICBzdHJlYW06IGZhbHNlLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuMywgLy8g0J3QuNC30YzQutCwINGC0LXQvNC/0LXRgNCw0YLRg9GA0LAg0LTQu9GPINC60L7QvdGB0LjRgdGC0LXQvdGC0L3QvtGXINGB0YPQvNCw0YDQuNC30LDRhtGW0ZdcbiAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgbnVtX2N0eDogc3VtbWFyaXphdGlvbkNvbnRleHRXaW5kb3csXG4gICAgICAgIC8vINCc0L7QttC90LAg0LTQvtC00LDRgtC4IHN0b3AgdG9rZW4sINGP0LrRidC+INC/0L7RgtGA0ZbQsdC90L4sINC90LDQv9GA0LjQutC70LDQtCBbXCJVc2VyOlwiLCBcIkFzc2lzdGFudDpcIl1cbiAgICAgIH0sXG4gICAgICAvLyDQodC40YHRgtC10LzQvdC40Lkg0L/RgNC+0LzQv9GCINC00LvRjyDRgdGD0LzQsNGA0LjQt9Cw0YLQvtGA0LBcbiAgICAgIHN5c3RlbTpcbiAgICAgICAgXCJZb3UgYXJlIGEgaGVscGZ1bCBhc3Npc3RhbnQgc3BlY2lhbGl6aW5nIGluIGNvbmNpc2VseSBzdW1tYXJpemluZyBjb252ZXJzYXRpb24gaGlzdG9yeS4gRm9jdXMgb24gZXh0cmFjdGluZyBrZXkgcG9pbnRzLCBkZWNpc2lvbnMsIGFuZCB1bnJlc29sdmVkIHF1ZXN0aW9ucy5cIixcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIGlmICghdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzcG9uc2VEYXRhOiBPbGxhbWFHZW5lcmF0ZVJlc3BvbnNlID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZW5lcmF0ZVJhdyhyZXF1ZXN0Qm9keSk7XG5cbiAgICAgIGlmIChyZXNwb25zZURhdGEgJiYgdHlwZW9mIHJlc3BvbnNlRGF0YS5yZXNwb25zZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBjb25zdCBzdW1tYXJ5ID0gcmVzcG9uc2VEYXRhLnJlc3BvbnNlLnRyaW0oKTtcbiAgICAgICAgcmV0dXJuIHN1bW1hcnk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG59IC8vIEVuZCBvZiBQcm9tcHRTZXJ2aWNlIGNsYXNzXG4iXX0=