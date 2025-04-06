"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
exports.__esModule = true;
exports.PromptService = void 0;
// PromptService.ts
var obsidian_1 = require("obsidian");
var PromptService = /** @class */ (function () {
    function PromptService(plugin) {
        this.currentSystemPrompt = null;
        this.currentRolePath = null;
        this.roleCache = {};
        this.modelDetailsCache = {};
        this.plugin = plugin;
        this.app = plugin.app;
    }
    // --- Приватний метод для підрахунку токенів ---
    PromptService.prototype._countTokens = function (text) {
        if (!text)
            return 0;
        return Math.ceil(text.length / 4); // Груба оцінка
    };
    // ---------------------------------------------
    PromptService.prototype.clearRoleCache = function () {
        console.log("[PromptService] Clearing role definition cache.");
        this.roleCache = {};
        this.currentSystemPrompt = null;
        this.currentRolePath = null;
    };
    PromptService.prototype.clearModelDetailsCache = function () {
        console.log("[PromptService] Clearing model details cache.");
        this.modelDetailsCache = {};
    };
    /**
     * Повертає поточний *тіло* системного промпту (без frontmatter).
     * Гарантує, що роль завантажена для поточного шляху.
     * @returns Тіло системного промпту або null.
     */
    PromptService.prototype.getSystemPromptForAPI = function (chatMetadata) {
        return __awaiter(this, void 0, Promise, function () {
            var selectedRolePath, roleDefinition, systemPrompt, now, formattedDate, formattedTime;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        selectedRolePath = chatMetadata.selectedRolePath || this.plugin.settings.selectedRolePath;
                        return [4 /*yield*/, this.getRoleDefinition(selectedRolePath)];
                    case 1:
                        roleDefinition = _a.sent();
                        systemPrompt = (roleDefinition === null || roleDefinition === void 0 ? void 0 : roleDefinition.systemPrompt) || null;
                        // Опціонально: Додаємо динамічний час/дату для персон продуктивності
                        if ((roleDefinition === null || roleDefinition === void 0 ? void 0 : roleDefinition.isProductivityPersona) && systemPrompt) {
                            now = new Date();
                            formattedDate = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                            formattedTime = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                            // Замінюємо плейсхолдери (якщо вони є в промпті ролі)
                            systemPrompt = systemPrompt.replace(/\[Current Time\]/gi, formattedTime);
                            systemPrompt = systemPrompt.replace(/\[Current Date\]/gi, formattedDate);
                            // Можна додати [Location] аналогічно, якщо потрібно
                        }
                        return [2 /*return*/, systemPrompt];
                }
            });
        });
    };
    PromptService.prototype.getRoleDefinition = function (rolePath) {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var normalizedPath, file, fileCache, frontmatter, frontmatterPos, content, systemPromptBody, assistantType, isProductivity, definition, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        normalizedPath = rolePath ? obsidian_1.normalizePath(rolePath) : null;
                        // Оновлюємо лише якщо шлях дійсно змінився, щоб уникнути зайвих перезавантажень
                        if (normalizedPath !== this.currentRolePath) {
                            console.log("[PromptService] Role path changed from " + this.currentRolePath + " to " + normalizedPath + ". Clearing cache for this path.");
                            if (normalizedPath && this.roleCache[normalizedPath]) {
                                delete this.roleCache[normalizedPath]; // Видаляємо старий кеш для цього шляху
                            }
                            this.currentRolePath = normalizedPath; // Встановлюємо новий шлях
                            this.currentSystemPrompt = null; // Скидаємо поточний системний промпт
                        }
                        else if (normalizedPath && this.roleCache[normalizedPath]) {
                            // Шлях не змінився, повертаємо кеш
                            // console.log(`[PromptService] Returning cached role definition for: ${normalizedPath}`);
                            // Переконуємось, що currentSystemPrompt відповідає кешу
                            this.currentSystemPrompt = this.roleCache[normalizedPath].systemPrompt;
                            return [2 /*return*/, this.roleCache[normalizedPath]];
                        }
                        // Якщо шлях null або вимкнено followRole
                        if (!normalizedPath || !this.plugin.settings.followRole) {
                            // console.log("[PromptService] No role path or followRole disabled. Using null system prompt.");
                            this.currentSystemPrompt = null;
                            // Не кешуємо null-роль, щоб вона могла завантажитись, якщо налаштування зміниться
                            return [2 /*return*/, { systemPrompt: null, isProductivityPersona: false }];
                        }
                        // Якщо кешу немає, завантажуємо
                        console.log("[PromptService] Loading role definition using metadataCache for: " + normalizedPath);
                        file = this.app.vault.getAbstractFileByPath(normalizedPath);
                        if (!(file instanceof obsidian_1.TFile)) return [3 /*break*/, 5];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        fileCache = this.app.metadataCache.getFileCache(file);
                        frontmatter = fileCache === null || fileCache === void 0 ? void 0 : fileCache.frontmatter;
                        frontmatterPos = fileCache === null || fileCache === void 0 ? void 0 : fileCache.frontmatterPosition;
                        return [4 /*yield*/, this.app.vault.cachedRead(file)];
                    case 2:
                        content = _b.sent();
                        systemPromptBody = (frontmatterPos === null || frontmatterPos === void 0 ? void 0 : frontmatterPos.end) ? content.substring(frontmatterPos.end.offset).trim() // Беремо все ПІСЛЯ frontmatter
                            : content.trim();
                        assistantType = (_a = frontmatter === null || frontmatter === void 0 ? void 0 : frontmatter.assistant_type) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                        isProductivity = assistantType === 'productivity' || (frontmatter === null || frontmatter === void 0 ? void 0 : frontmatter.is_planner) === true;
                        definition = {
                            systemPrompt: systemPromptBody || null,
                            isProductivityPersona: isProductivity
                        };
                        console.log("[PromptService] Role loaded: " + normalizedPath + ". Is Productivity Persona: " + isProductivity);
                        this.roleCache[normalizedPath] = definition;
                        this.currentSystemPrompt = definition.systemPrompt; // Зберігаємо ТІЛО в кеш
                        return [2 /*return*/, definition];
                    case 3:
                        error_1 = _b.sent();
                        console.error("[PromptService] Error processing role file " + normalizedPath + ":", error_1);
                        new obsidian_1.Notice("Error loading role: " + file.basename + ".");
                        this.currentSystemPrompt = null;
                        return [2 /*return*/, null]; // Повертаємо null при помилці
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        console.warn("[PromptService] Role file not found or not a file: " + normalizedPath);
                        this.currentSystemPrompt = null;
                        // Кешуємо відсутність файлу, щоб не шукати постійно? Можливо.
                        // this.roleCache[normalizedPath] = { systemPrompt: null, isProductivityPersona: false };
                        return [2 /*return*/, null]; // Повертаємо null, якщо файл не знайдено
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    PromptService.prototype._isProductivityPersonaActive = function (rolePath) {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var roleDefinition;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.plugin.settings.enableProductivityFeatures) {
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, this.getRoleDefinition(rolePath)];
                    case 1:
                        roleDefinition = _b.sent();
                        return [2 /*return*/, (_a = roleDefinition === null || roleDefinition === void 0 ? void 0 : roleDefinition.isProductivityPersona) !== null && _a !== void 0 ? _a : false];
                }
            });
        });
    };
    PromptService.prototype.prepareFullPrompt = function (history, chatMetadata) {
        var _a, _b, _c;
        return __awaiter(this, void 0, Promise, function () {
            var settings, selectedRolePath, isProductivityActive, taskContext, tasksWereUpdated, needsUpdateBefore, processedHistoryString, approxContextTokens, maxHistoryTokens, ragContext, lastUserMessage, ragResult, error_2, finalPrompt;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        console.log("[PromptService] Preparing full prompt...");
                        settings = this.plugin.settings;
                        selectedRolePath = chatMetadata.selectedRolePath || settings.selectedRolePath;
                        return [4 /*yield*/, this._isProductivityPersonaActive(selectedRolePath)];
                    case 1:
                        isProductivityActive = _d.sent();
                        console.log("[PromptService] Productivity features active for this request: " + isProductivityActive);
                        taskContext = "";
                        tasksWereUpdated = false;
                        if (!isProductivityActive) return [3 /*break*/, 3];
                        needsUpdateBefore = this.plugin.isTaskFileUpdated();
                        return [4 /*yield*/, ((_b = (_a = this.plugin).checkAndProcessTaskUpdate) === null || _b === void 0 ? void 0 : _b.call(_a))];
                    case 2:
                        _d.sent(); // Запускаємо перевірку/обробку
                        // Визначаємо, чи відбулося оновлення (прапорець був true, а тепер false)
                        tasksWereUpdated = needsUpdateBefore && !this.plugin.isTaskFileUpdated();
                        // -------------------------------------
                        if ((_c = this.plugin.chatManager) === null || _c === void 0 ? void 0 : _c.filePlanExists) {
                            taskContext = tasksWereUpdated
                                ? "\n--- Updated Tasks Context ---\n"
                                : "\n--- Today's Tasks Context ---\n";
                            taskContext += "Urgent: " + (this.plugin.chatManager.fileUrgentTasks.length > 0 ? this.plugin.chatManager.fileUrgentTasks.join(', ') : "None") + "\n";
                            taskContext += "Other: " + (this.plugin.chatManager.fileRegularTasks.length > 0 ? this.plugin.chatManager.fileRegularTasks.join(', ') : "None") + "\n";
                            taskContext += "--- End Tasks Context ---";
                            console.log("[PromptService] Injecting task context (Updated: " + tasksWereUpdated + ").");
                        }
                        _d.label = 3;
                    case 3:
                        processedHistoryString = "";
                        approxContextTokens = this._countTokens(taskContext);
                        maxHistoryTokens = settings.contextWindow - approxContextTokens - 200;
                        if (!(isProductivityActive && settings.useAdvancedContextStrategy)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this._buildAdvancedContext(history, chatMetadata, maxHistoryTokens)];
                    case 4:
                        processedHistoryString = _d.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        processedHistoryString = this._buildSimpleContext(history, maxHistoryTokens);
                        _d.label = 6;
                    case 6:
                        ragContext = "";
                        if (!(settings.ragEnabled && this.plugin.ragService)) return [3 /*break*/, 11];
                        lastUserMessage = history.findLast(function (m) { return m.role === 'user'; });
                        if (!(lastUserMessage === null || lastUserMessage === void 0 ? void 0 : lastUserMessage.content)) return [3 /*break*/, 11];
                        _d.label = 7;
                    case 7:
                        _d.trys.push([7, 9, , 10]);
                        return [4 /*yield*/, this.plugin.ragService.findRelevantDocuments(lastUserMessage.content, 5)];
                    case 8:
                        ragResult = _d.sent();
                        if (ragResult && ragResult.length > 0) { /*...*/
                            ragContext = "\n--- Relevant Notes Context ---\n" + ragResult.map(function (r) { var _a, _b; return "[" + (((_a = r.metadata) === null || _a === void 0 ? void 0 : _a.filename) || ((_b = r.metadata) === null || _b === void 0 ? void 0 : _b.source) || 'Note') + "]:\n" + r.content; }).join("\n\n") + "\n--- End Notes Context ---"; /*...*/
                        }
                        else { /*...*/ }
                        return [3 /*break*/, 10];
                    case 9:
                        error_2 = _d.sent();
                        return [3 /*break*/, 10];
                    case 10: return [3 /*break*/, 11];
                    case 11:
                        finalPrompt = ("" + ragContext + taskContext + "\n" + processedHistoryString).trim();
                        console.log("[PromptService] Final prompt body length (approx tokens): " + this._countTokens(finalPrompt));
                        return [2 /*return*/, finalPrompt];
                }
            });
        });
    };
    // --- Методи обробки контексту та підсумовування ---
    // (Залишаються без змін, але використовують this._countTokens)
    PromptService.prototype._buildSimpleContext = function (history, maxTokens) {
        var context = "";
        var currentTokens = 0;
        for (var i = history.length - 1; i >= 0; i--) {
            var message = history[i];
            var formattedMessage = (message.role === 'user' ? 'User' : 'Assistant') + ": " + message.content.trim();
            var messageTokens = this._countTokens(formattedMessage) + 5; // Використовуємо this._countTokens
            if (currentTokens + messageTokens <= maxTokens) {
                context = formattedMessage + "\n\n" + context;
                currentTokens += messageTokens;
            }
            else {
                console.log("[PromptService] Simple context limit reached (" + currentTokens + "/" + maxTokens + " tokens).");
                break;
            }
        }
        return context.trim();
    };
    PromptService.prototype._buildAdvancedContext = function (history, chatMetadata, maxTokens) {
        return __awaiter(this, void 0, Promise, function () {
            var settings, processedParts, currentTokens, keepN, messagesToKeep, messagesToProcess, remainingMessages, chunkTokens, chunkMessages, msg, msgText, msgTokens, chunkCombinedText, actualChunkTokens, summary, summaryTokens, summaryText, olderHistoryString, keepHistoryString, keepHistoryTokens, truncatedKeepHistory;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("[PromptService] Building advanced context...");
                        settings = this.plugin.settings;
                        processedParts = [];
                        currentTokens = 0;
                        keepN = Math.min(history.length, settings.keepLastNMessagesBeforeSummary);
                        messagesToKeep = history.slice(-keepN);
                        messagesToProcess = history.slice(0, -keepN);
                        console.log("[PromptService] Advanced Context: Keeping last " + messagesToKeep.length + ", processing " + messagesToProcess.length + " older messages.");
                        if (!(messagesToProcess.length > 0)) return [3 /*break*/, 7];
                        if (!settings.enableSummarization) return [3 /*break*/, 6];
                        console.log("[PromptService] Summarization enabled...");
                        remainingMessages = __spreadArrays(messagesToProcess);
                        _a.label = 1;
                    case 1:
                        if (!(remainingMessages.length > 0)) return [3 /*break*/, 5];
                        chunkTokens = 0;
                        chunkMessages = [];
                        while (remainingMessages.length > 0 && chunkTokens < settings.summarizationChunkSize) {
                            msg = remainingMessages.pop();
                            msgText = (msg.role === 'user' ? 'User' : 'Assistant') + ": " + msg.content.trim();
                            msgTokens = this._countTokens(msgText) + 5;
                            if (chunkTokens + msgTokens <= settings.summarizationChunkSize) {
                                chunkMessages.unshift(msg);
                                chunkTokens += msgTokens;
                            }
                            else {
                                remainingMessages.push(msg);
                                break;
                            }
                        }
                        if (!(chunkMessages.length > 0)) return [3 /*break*/, 4];
                        chunkCombinedText = chunkMessages.map(function (m) { return (m.role === 'user' ? 'User' : 'Assistant') + ": " + m.content.trim(); }).join("\n\n");
                        actualChunkTokens = this._countTokens(chunkCombinedText);
                        if (!(currentTokens + actualChunkTokens <= maxTokens)) return [3 /*break*/, 2];
                        console.log("[PromptService] Adding chunk (" + actualChunkTokens + " tokens) directly.");
                        processedParts.unshift(chunkCombinedText);
                        currentTokens += actualChunkTokens;
                        return [3 /*break*/, 4];
                    case 2:
                        console.log("[PromptService] Chunk (" + actualChunkTokens + " tokens) too large. Summarizing.");
                        return [4 /*yield*/, this._summarizeMessages(chunkMessages, chatMetadata)];
                    case 3:
                        summary = _a.sent();
                        if (summary) {
                            summaryTokens = this._countTokens(summary) + 10;
                            summaryText = "[Summary of previous messages]:\n" + summary;
                            if (currentTokens + summaryTokens <= maxTokens) {
                                console.log("[PromptService] Adding summary (" + summaryTokens + " tokens).");
                                processedParts.unshift(summaryText);
                                currentTokens += summaryTokens;
                            }
                            else {
                                console.warn("[PromptService] Summary too large. Skipping.");
                                return [3 /*break*/, 5];
                            }
                        }
                        else {
                            console.warn("[PromptService] Summarization failed. Skipping.");
                            return [3 /*break*/, 5];
                        }
                        _a.label = 4;
                    case 4: return [3 /*break*/, 1];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        console.log("[PromptService] Summarization disabled. Including older messages directly.");
                        olderHistoryString = this._buildSimpleContext(messagesToProcess, maxTokens - currentTokens);
                        if (olderHistoryString) {
                            processedParts.unshift(olderHistoryString);
                            currentTokens += this._countTokens(olderHistoryString);
                        } // Використовуємо this._countTokens
                        _a.label = 7;
                    case 7:
                        keepHistoryString = messagesToKeep.map(function (m) { return (m.role === 'user' ? 'User' : 'Assistant') + ": " + m.content.trim(); }).join("\n\n");
                        keepHistoryTokens = this._countTokens(keepHistoryString);
                        if (currentTokens + keepHistoryTokens <= maxTokens) {
                            processedParts.push(keepHistoryString);
                            currentTokens += keepHistoryTokens;
                        }
                        else {
                            console.warn("[PromptService] Cannot fit all 'keepLastNMessages'. Truncating.");
                            truncatedKeepHistory = this._buildSimpleContext(messagesToKeep, maxTokens - currentTokens);
                            if (truncatedKeepHistory) {
                                processedParts.push(truncatedKeepHistory);
                                currentTokens += this._countTokens(truncatedKeepHistory);
                            } // Використовуємо this._countTokens
                        }
                        console.log("[PromptService] Advanced context built. Total approx tokens: " + currentTokens);
                        return [2 /*return*/, processedParts.join("\n\n").trim()];
                }
            });
        });
    };
    PromptService.prototype._summarizeMessages = function (messagesToSummarize, chatMetadata) {
        return __awaiter(this, void 0, Promise, function () {
            var textToSummarize, summarizationFullPrompt, modelName, contextWindow, requestBody, responseData, summary, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // ... (код без змін, але внутрішньо використовує this._countTokens через виклик generateRaw) ...
                        if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0)
                            return [2 /*return*/, null];
                        console.log("[PromptService] Summarizing chunk of " + messagesToSummarize.length + " messages...");
                        textToSummarize = messagesToSummarize.map(function (m) { return (m.role === 'user' ? 'User' : 'Assistant') + ": " + m.content.trim(); }).join("\n");
                        summarizationFullPrompt = this.plugin.settings.summarizationPrompt.replace('{text_to_summarize}', textToSummarize);
                        modelName = chatMetadata.modelName || this.plugin.settings.modelName;
                        contextWindow = this.plugin.settings.contextWindow;
                        requestBody = { model: modelName, prompt: summarizationFullPrompt, stream: false, temperature: 0.3, options: { num_ctx: contextWindow }, system: "You are a helpful assistant that summarizes conversation history concisely." };
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        if (!this.plugin.ollamaService) {
                            console.error("[PromptService] OllamaService is not available for summarization.");
                            return [2 /*return*/, null];
                        }
                        return [4 /*yield*/, this.plugin.ollamaService.generateRaw(requestBody)];
                    case 2:
                        responseData = _a.sent();
                        if (responseData && typeof responseData.response === 'string') {
                            summary = responseData.response.trim();
                            console.log("[PromptService] Summarization successful (" + this._countTokens(summary) + " tokens).");
                            return [2 /*return*/, summary];
                        }
                        else {
                            console.warn("[PromptService] Summarization request returned unexpected structure:", responseData);
                            return [2 /*return*/, null];
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _a.sent();
                        console.error("[PromptService] Error during summarization request:", error_3);
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return PromptService;
}()); // End of PromptService class
exports.PromptService = PromptService;
