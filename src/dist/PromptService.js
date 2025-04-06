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
// promptService.ts
var obsidian_1 = require("obsidian");
var gpt_tokenizer_1 = require("gpt-tokenizer"); // Import the tokenizer
// Helper function: Word counter (for basic strategy)
function countWords(text) {
    if (!text)
        return 0;
    // More robust word count, ignoring multiple spaces
    return text.trim().split(/\s+/).filter(Boolean).length;
}
// Helper function: Token counter (for advanced strategy)
function countTokens(text) {
    if (!text)
        return 0;
    try {
        // Use encode from gpt-tokenizer library
        return gpt_tokenizer_1.encode(text).length;
    }
    catch (e) {
        console.warn("Tokenizer error, falling back to word count estimation:", e); // English warning
        // Fallback estimation in case of tokenizer error
        return Math.ceil(countWords(text) * 1.5); // Increase factor for safety
    }
}
var PromptService = /** @class */ (function () {
    function PromptService(plugin) {
        this.systemPrompt = null;
        // Reference to OllamaService needed for summarization calls and model details
        // private ollamaService: OllamaService;
        // Buffer of tokens to reserve for the model's response & potential inaccuracies
        this.RESPONSE_TOKEN_BUFFER = 500;
        // Cache for detected model context sizes { modelName: detectedContextSize | null }
        this.modelDetailsCache = {};
        // Cache for role file content { roleFilePath: content | null }
        this.roleContentCache = {};
        this.plugin = plugin;
        // Get OllamaService instance from the plugin
        // this.ollamaService = plugin.ollamaService;
    }
    PromptService.prototype.setSystemPrompt = function (prompt) { this.systemPrompt = prompt; };
    PromptService.prototype.getSystemPrompt = function () { return this.systemPrompt; };
    PromptService.prototype.clearModelDetailsCache = function () { this.modelDetailsCache = {}; console.log("[PromptService] Model details cache cleared."); };
    PromptService.prototype.clearRoleCache = function () { this.roleContentCache = {}; console.log("[PromptService] Role content cache cleared."); };
    /**
     * Determines the effective context limit by checking the model details (if advanced strategy enabled)
     * and comparing with the user's setting. Returns the smaller of the two valid values.
     */
    PromptService.prototype._getEffectiveContextLimit = function (modelName) {
        var _a, _b;
        return __awaiter(this, void 0, Promise, function () {
            var userDefinedContextSize, effectiveContextLimit, detectedSize, details, sizeStr, match, parsedSize, error_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        userDefinedContextSize = this.plugin.settings.contextWindow;
                        effectiveContextLimit = userDefinedContextSize;
                        if (!(this.plugin.settings.useAdvancedContextStrategy && modelName)) return [3 /*break*/, 6];
                        detectedSize = null;
                        if (!this.modelDetailsCache.hasOwnProperty(modelName)) return [3 /*break*/, 1];
                        detectedSize = this.modelDetailsCache[modelName];
                        return [3 /*break*/, 5];
                    case 1:
                        console.log("[PromptService] No cache for " + modelName + ", fetching details...");
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.plugin.ollamaService.getModelDetails(modelName)];
                    case 3:
                        details = _c.sent();
                        if (details) {
                            sizeStr = undefined;
                            if (details.parameters) {
                                match = details.parameters.match(/num_ctx\s+(\d+)/);
                                if (match === null || match === void 0 ? void 0 : match[1])
                                    sizeStr = match[1];
                            }
                            if (!sizeStr && ((_a = details.details) === null || _a === void 0 ? void 0 : _a['llm.context_length']))
                                sizeStr = String(details.details['llm.context_length']);
                            if (!sizeStr && ((_b = details.details) === null || _b === void 0 ? void 0 : _b['tokenizer.ggml.context_length']))
                                sizeStr = String(details.details['tokenizer.ggml.context_length']);
                            if (sizeStr) {
                                parsedSize = parseInt(sizeStr, 10);
                                if (!isNaN(parsedSize) && parsedSize > 0) {
                                    detectedSize = parsedSize;
                                    console.log("[PromptService] Detected context size for " + modelName + ": " + detectedSize);
                                    this.modelDetailsCache[modelName] = detectedSize;
                                }
                                else {
                                    console.warn("[PromptService] Parsed context size invalid: " + sizeStr);
                                    detectedSize = null;
                                }
                            }
                            if (detectedSize === null) {
                                console.log("[PromptService] Context size not found for " + modelName + ".");
                                this.modelDetailsCache[modelName] = null;
                            }
                        }
                        else {
                            this.modelDetailsCache[modelName] = null;
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _c.sent();
                        console.error("[PromptService] Error fetching model details for " + modelName + ":", error_1);
                        this.modelDetailsCache[modelName] = null;
                        return [3 /*break*/, 5];
                    case 5:
                        if (detectedSize !== null && detectedSize > 0) {
                            effectiveContextLimit = Math.min(userDefinedContextSize, detectedSize);
                            // Optional logging comparing limits
                            // if (effectiveContextLimit < userDefinedContextSize) { console.log(`[PromptService] Using detected limit (${effectiveContextLimit})`); }
                            // else { console.log(`[PromptService] Using user limit (${effectiveContextLimit})`); }
                        }
                        else { /* console.log(`[PromptService] Using user limit (${effectiveContextLimit})`); */ }
                        _c.label = 6;
                    case 6: return [2 /*return*/, Math.max(100, effectiveContextLimit)]; // Ensure minimum limit
                }
            });
        });
    };
    PromptService.prototype._summarizeMessages = function (messagesToSummarize, chatMetadata) {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var textToSummarize, summarizationFullPrompt, summaryRequestBody, summaryResponse, summaryText, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.plugin.settings.enableSummarization || messagesToSummarize.length === 0)
                            return [2 /*return*/, null];
                        console.log("[Ollama] Attempting to summarize " + messagesToSummarize.length + " messages.");
                        textToSummarize = messagesToSummarize.map(function (m) { return (m.role === 'user' ? 'User' : 'Assistant') + ": " + m.content.trim(); }).join("\n");
                        summarizationFullPrompt = this.plugin.settings.summarizationPrompt.replace('{text_to_summarize}', textToSummarize);
                        summaryRequestBody = {
                            model: chatMetadata.modelName || this.plugin.settings.modelName,
                            prompt: summarizationFullPrompt,
                            stream: false,
                            temperature: 0.2,
                            options: { num_ctx: this.plugin.settings.contextWindow }
                        };
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.plugin.ollamaService.generateRaw(summaryRequestBody)];
                    case 2:
                        summaryResponse = _b.sent();
                        summaryText = (_a = summaryResponse === null || summaryResponse === void 0 ? void 0 : summaryResponse.response) === null || _a === void 0 ? void 0 : _a.trim();
                        if (summaryText) {
                            console.log("[Ollama] Summarization successful.");
                            return [2 /*return*/, summaryText];
                        }
                        else {
                            console.warn("[Ollama] Summarization empty response.");
                            return [2 /*return*/, null];
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _b.sent();
                        console.error("[Ollama] Summarization failed:", error_2);
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Prepares the full prompt string based on history and chat metadata.
     * System prompt is handled separately.
     */
    PromptService.prototype.prepareFullPrompt = function (history, // Full message history for the chat
    chatMetadata // Metadata of the current chat
    ) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, Promise, function () {
            var roleContent, error_3, currentSystemPrompt, lastUserMessageContent, ragContext, ragHeader, ragBlock, modelName, effectiveContextLimit, systemPromptTokens, maxPromptTokens, finalPrompt, lastMessage, userInputFormatted, historyForContext, currentPromptTokens, promptHistoryParts, userInputTokens, ragTokens, finalRagBlock, keepN, messagesToKeep, messagesToProcess, keptMessagesTokens, keptMessagesStrings, i, m, fmt, tkns, processedHistoryParts, currentChunk, i, m, fmt, tkns, s, st, sf, s, st, sf, finalPromptParts, systemPromptWordCount, userInputWordCount, wordLimit, contextParts, currentWordCount, ragWords, ragAdded, addedHistoryMessages, i, m, fmt, words, finalPromptParts;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        if (!this.plugin) {
                            return [2 /*return*/, ((_b = (_a = history.slice(-1)) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) || ""];
                        }
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.getRoleDefinition(chatMetadata.selectedRolePath)];
                    case 2:
                        roleContent = _e.sent();
                        this.setSystemPrompt(roleContent);
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _e.sent();
                        console.error("Error setting role definition for prompt:", error_3);
                        this.setSystemPrompt(null);
                        return [3 /*break*/, 4];
                    case 4:
                        currentSystemPrompt = this.getSystemPrompt();
                        lastUserMessageContent = ((_c = history.findLast(function (m) { return m.role === 'user'; })) === null || _c === void 0 ? void 0 : _c.content) || "";
                        ragContext = null;
                        if (this.plugin.settings.ragEnabled && this.plugin.ragService && lastUserMessageContent) {
                            try {
                                ragContext = this.plugin.ragService.prepareContext(lastUserMessageContent);
                            }
                            catch (error) {
                                console.error("Error processing RAG:", error);
                            }
                        }
                        ragHeader = "## Contextual Information from Notes:\n";
                        ragBlock = ragContext ? "" + ragHeader + ragContext.trim() + "\n\n---\n" : "";
                        modelName = chatMetadata.modelName || this.plugin.settings.modelName;
                        return [4 /*yield*/, this._getEffectiveContextLimit(modelName)];
                    case 5:
                        effectiveContextLimit = _e.sent();
                        systemPromptTokens = currentSystemPrompt ? countTokens(currentSystemPrompt) : 0;
                        maxPromptTokens = Math.max(100, effectiveContextLimit - systemPromptTokens - this.RESPONSE_TOKEN_BUFFER);
                        lastMessage = (_d = history.slice(-1)) === null || _d === void 0 ? void 0 : _d[0];
                        userInputFormatted = lastMessage ? (lastMessage.role === 'user' ? 'User' : 'Assistant') + ": " + lastMessage.content.trim() : "";
                        historyForContext = history.slice(0, -1);
                        if (!this.plugin.settings.useAdvancedContextStrategy) return [3 /*break*/, 18];
                        // --- Advanced Strategy (Tokens + Summarization) ---
                        // (Logic remains the same as previous version)
                        console.log("[Ollama] Using advanced context (Effective Limit: " + effectiveContextLimit + ", Max Prompt Field: " + maxPromptTokens + ").");
                        currentPromptTokens = 0;
                        promptHistoryParts = [];
                        userInputTokens = countTokens(userInputFormatted);
                        currentPromptTokens += userInputTokens;
                        ragTokens = countTokens(ragBlock);
                        finalRagBlock = "";
                        if (ragBlock && currentPromptTokens + ragTokens <= maxPromptTokens) {
                            finalRagBlock = ragBlock;
                            currentPromptTokens += ragTokens;
                        }
                        else if (ragBlock) {
                            console.warn("[Ollama] RAG skipped (" + ragTokens + ").");
                        }
                        keepN = Math.min(historyForContext.length, this.plugin.settings.keepLastNMessagesBeforeSummary);
                        messagesToKeep = historyForContext.slice(-keepN);
                        messagesToProcess = historyForContext.slice(0, -keepN);
                        keptMessagesTokens = 0;
                        keptMessagesStrings = [];
                        for (i = messagesToKeep.length - 1; i >= 0; i--) {
                            m = messagesToKeep[i];
                            fmt = (m.role === 'user' ? 'User' : 'Assistant') + ": " + m.content.trim();
                            tkns = countTokens(fmt);
                            if (currentPromptTokens + tkns <= maxPromptTokens) {
                                keptMessagesStrings.push(fmt);
                                currentPromptTokens += tkns;
                                keptMessagesTokens += tkns;
                            }
                            else {
                                console.warn("[Ollama] Keep message doesn't fit.");
                                break;
                            }
                        }
                        keptMessagesStrings.reverse();
                        processedHistoryParts = [];
                        currentChunk = { messages: [], text: "", tokens: 0 };
                        i = messagesToProcess.length - 1;
                        _e.label = 6;
                    case 6:
                        if (!(i >= 0)) return [3 /*break*/, 13];
                        m = messagesToProcess[i];
                        fmt = (m.role === 'user' ? 'User' : 'Assistant') + ": " + m.content.trim();
                        tkns = countTokens(fmt);
                        if (!(currentChunk.tokens > 0 && currentChunk.tokens + tkns > this.plugin.settings.summarizationChunkSize)) return [3 /*break*/, 11];
                        currentChunk.messages.reverse();
                        currentChunk.text = currentChunk.messages.map(function (m) { return (m.role === 'user' ? 'User' : 'Assistant') + ": " + m.content.trim(); }).join("\n");
                        if (!(currentPromptTokens + currentChunk.tokens <= maxPromptTokens)) return [3 /*break*/, 7];
                        processedHistoryParts.push(currentChunk.text);
                        currentPromptTokens += currentChunk.tokens;
                        return [3 /*break*/, 10];
                    case 7:
                        if (!this.plugin.settings.enableSummarization) return [3 /*break*/, 9];
                        return [4 /*yield*/, this._summarizeMessages(currentChunk.messages, chatMetadata)];
                    case 8:
                        s = _e.sent();
                        if (s) {
                            st = countTokens(s);
                            sf = "[Summary]:\n" + s;
                            if (currentPromptTokens + st <= maxPromptTokens) {
                                processedHistoryParts.push(sf);
                                currentPromptTokens += st;
                            }
                            else {
                                console.warn("Summary too large.");
                            }
                        }
                        else {
                            console.warn("Summarization failed.");
                        }
                        return [3 /*break*/, 10];
                    case 9:
                        console.log("Chunk skipped.");
                        _e.label = 10;
                    case 10:
                        currentChunk = { messages: [], text: "", tokens: 0 };
                        _e.label = 11;
                    case 11:
                        currentChunk.messages.push(m);
                        currentChunk.tokens += tkns;
                        _e.label = 12;
                    case 12:
                        i--;
                        return [3 /*break*/, 6];
                    case 13:
                        if (!(currentChunk.messages.length > 0)) return [3 /*break*/, 17];
                        currentChunk.messages.reverse();
                        currentChunk.text = currentChunk.messages.map(function (m) { return (m.role === 'user' ? 'User' : 'Assistant') + ": " + m.content.trim(); }).join("\n");
                        if (!(currentPromptTokens + currentChunk.tokens <= maxPromptTokens)) return [3 /*break*/, 14];
                        processedHistoryParts.push(currentChunk.text);
                        currentPromptTokens += currentChunk.tokens;
                        return [3 /*break*/, 17];
                    case 14:
                        if (!this.plugin.settings.enableSummarization) return [3 /*break*/, 16];
                        return [4 /*yield*/, this._summarizeMessages(currentChunk.messages, chatMetadata)];
                    case 15:
                        s = _e.sent();
                        if (s) {
                            st = countTokens(s);
                            sf = "[Summary]:\n" + s;
                            if (currentPromptTokens + st <= maxPromptTokens) {
                                processedHistoryParts.push(sf);
                                currentPromptTokens += st;
                            }
                            else {
                                console.warn("Summary too large.");
                            }
                        }
                        else {
                            console.warn("Summarization failed.");
                        }
                        return [3 /*break*/, 17];
                    case 16:
                        console.log("Last chunk skipped.");
                        _e.label = 17;
                    case 17:
                        processedHistoryParts.reverse();
                        finalPromptParts = __spreadArrays([finalRagBlock], processedHistoryParts, keptMessagesStrings, [userInputFormatted]).filter(Boolean);
                        finalPrompt = finalPromptParts.join("\n\n");
                        console.log("[Ollama] Final prompt field tokens: " + currentPromptTokens + ". Total context (incl sys): " + (currentPromptTokens + systemPromptTokens) + ".");
                        return [3 /*break*/, 19];
                    case 18:
                        // --- Basic Strategy (Words) ---
                        console.log("[Ollama] Using basic context strategy (Word Limit Approx based on " + effectiveContextLimit + " tokens).");
                        systemPromptWordCount = currentSystemPrompt ? countWords(currentSystemPrompt) : 0;
                        userInputWordCount = countWords(userInputFormatted);
                        wordLimit = Math.max(100, (effectiveContextLimit / 1.0) - systemPromptWordCount - userInputWordCount - 300);
                        contextParts = [];
                        currentWordCount = 0;
                        ragWords = countWords(ragBlock);
                        ragAdded = false;
                        if (ragBlock && currentWordCount + ragWords <= wordLimit) {
                            contextParts.push(ragBlock);
                            currentWordCount += ragWords;
                            ragAdded = true;
                        }
                        else if (ragBlock) {
                            console.warn("[Ollama] RAG context (" + ragWords + " words) skipped.");
                        }
                        addedHistoryMessages = 0;
                        for (i = historyForContext.length - 1; i >= 0; i--) {
                            m = historyForContext[i];
                            fmt = (m.role === 'user' ? 'User' : 'Assistant') + ": " + m.content.trim();
                            words = countWords(fmt);
                            if (currentWordCount + words <= wordLimit) {
                                contextParts.push(fmt);
                                currentWordCount += words;
                                addedHistoryMessages++;
                            }
                            else {
                                break;
                            }
                        }
                        finalPromptParts = [];
                        if (ragAdded) {
                            finalPromptParts.push(contextParts.shift());
                            contextParts.reverse();
                            finalPromptParts = finalPromptParts.concat(contextParts);
                        }
                        else {
                            contextParts.reverse();
                            finalPromptParts = contextParts;
                        }
                        finalPromptParts.push(userInputFormatted);
                        finalPrompt = finalPromptParts.join("\n\n");
                        console.log("[Ollama] Final prompt word count (approx): " + (currentWordCount + userInputWordCount) + ". History messages: " + addedHistoryMessages + ".");
                        _e.label = 19;
                    case 19: return [2 /*return*/, finalPrompt];
                }
            });
        });
    };
    // --- Role definition methods ---
    /**
     * Reads the content of the specified role file path. Uses cache.
     */
    PromptService.prototype.getRoleDefinition = function (selectedRolePath) {
        return __awaiter(this, void 0, Promise, function () {
            var normalizedPath, adapter, content, currentTime, currentDate, finalContent, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.plugin || !this.plugin.settings.followRole || !selectedRolePath) {
                            return [2 /*return*/, null]; // Role functionality disabled or no role selected/passed
                        }
                        // Check cache first
                        if (this.roleContentCache.hasOwnProperty(selectedRolePath)) {
                            return [2 /*return*/, this.roleContentCache[selectedRolePath]];
                        }
                        console.log("[PromptService] Reading role file content: " + selectedRolePath);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        normalizedPath = obsidian_1.normalizePath(selectedRolePath);
                        adapter = this.plugin.app.vault.adapter;
                        return [4 /*yield*/, adapter.exists(normalizedPath)];
                    case 2:
                        if (!(_a.sent())) {
                            console.warn("Selected role file not found: " + normalizedPath);
                            this.roleContentCache[selectedRolePath] = null;
                            new obsidian_1.Notice("Selected role file not found: " + selectedRolePath);
                            return [2 /*return*/, null];
                        }
                        return [4 /*yield*/, adapter.read(normalizedPath)];
                    case 3:
                        content = _a.sent();
                        currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                        content += "\n\nCurrent date and time: " + currentDate + ", " + currentTime;
                        finalContent = content.trim();
                        this.roleContentCache[selectedRolePath] = finalContent; // Cache the result
                        return [2 /*return*/, finalContent];
                    case 4:
                        error_4 = _a.sent();
                        console.error("Error reading selected role file " + selectedRolePath + ":", error_4);
                        this.roleContentCache[selectedRolePath] = null; // Cache error
                        new obsidian_1.Notice("Error reading role file: " + selectedRolePath);
                        return [2 /*return*/, null];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return PromptService;
}());
exports.PromptService = PromptService;
