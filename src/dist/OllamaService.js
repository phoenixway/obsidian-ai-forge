"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.__esModule = true;
exports.OllamaService = void 0;
var OllamaService = /** @class */ (function () {
    function OllamaService(plugin) {
        // private promptService: PromptService;
        // No direct view reference needed now
        // private ollamaView: OllamaView | null = null;
        this.eventHandlers = {}; // Keep event emitter for connection errors
        this.plugin = plugin;
        // PromptService is now a dependency needed by OllamaService
        // this.promptService = plugin.promptService;
        // Ensure PromptService also has a reference back if needed for summarization calls
        // (This creates a potential circular dependency - consider passing generateResponse as a callback instead)
        // For now, we assume PromptService gets the ApiService instance if needed.
    }
    // --- Event Emitter for internal errors (like connection) ---
    OllamaService.prototype.on = function (event, callback) {
        var _this = this;
        if (!this.eventHandlers[event])
            this.eventHandlers[event] = [];
        this.eventHandlers[event].push(callback);
        return function () { var _a, _b; _this.eventHandlers[event] = (_a = _this.eventHandlers[event]) === null || _a === void 0 ? void 0 : _a.filter(function (h) { return h !== callback; }); if (((_b = _this.eventHandlers[event]) === null || _b === void 0 ? void 0 : _b.length) === 0)
            delete _this.eventHandlers[event]; };
    };
    OllamaService.prototype.emit = function (event, data) { var h = this.eventHandlers[event]; if (h)
        h.slice().forEach(function (handler) { try {
            handler(data);
        }
        catch (e) {
            console.error("Error in OllamaService event handler for " + event + ":", e);
        } }); };
    // --- End Event Emitter ---
    // setOllamaView(view: OllamaView): void { // No longer needed
    //   this.ollamaView = view;
    // }
    OllamaService.prototype.setBaseUrl = function (url) {
        // Base URL is now read from settings dynamically
    };
    // --- NEW: Low-level method for /api/generate ---
    /**
     * Sends a raw request body to the Ollama /api/generate endpoint.
     * @param requestBody The complete request body including model, prompt, options, etc.
     * @returns The parsed OllamaGenerateResponse.
     */
    OllamaService.prototype.generateRaw = function (requestBody) {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("[OllamaService] Sending RAW request to /api/generate:", JSON.stringify(__assign(__assign({}, requestBody), { prompt: ((_a = requestBody.prompt) === null || _a === void 0 ? void 0 : _a.substring(0, 100)) + "..." })));
                        // Note: generateRaw itself doesn't know about PromptService or Chat objects
                        // It relies on the caller to format the prompt and system message correctly.
                        if (!requestBody.model || !requestBody.prompt) {
                            throw new Error("generateRaw requires 'model' and 'prompt' in requestBody");
                        }
                        // Remove system if null/undefined before sending
                        if (!requestBody.system) {
                            delete requestBody.system;
                        }
                        return [4 /*yield*/, this._ollamaFetch('/api/generate', {
                                method: "POST",
                                body: JSON.stringify(requestBody)
                            })];
                    case 1: return [2 /*return*/, _b.sent()];
                }
            });
        });
    };
    // --- END NEW METHOD ---
    /**
     * Generates a chat response based on the current chat state.
     * Orchestrates prompt preparation and API call using generateRaw.
     */
    OllamaService.prototype.generateChatResponse = function (chat) {
        var _a;
        return __awaiter(this, void 0, Promise, function () {
            var currentSettings, modelName, temperature, selectedRolePath, history, lastUserMessage, formattedPrompt, systemPrompt, requestBody, responseData, assistantMessage, error_1, errorMessage;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!chat) {
                            console.error("[OllamaService] generateChatResponse called with null chat.");
                            return [2 /*return*/, null];
                        }
                        currentSettings = this.plugin.settings;
                        modelName = chat.metadata.modelName || currentSettings.modelName;
                        temperature = (_a = chat.metadata.temperature) !== null && _a !== void 0 ? _a : currentSettings.temperature;
                        selectedRolePath = chat.metadata.selectedRolePath || currentSettings.selectedRolePath;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        history = chat.getMessages();
                        lastUserMessage = history.findLast(function (m) { return m.role === 'user'; });
                        if (!lastUserMessage) {
                            console.warn("[OllamaService] No user message in history for response.");
                            return [2 /*return*/, null];
                        }
                        return [4 /*yield*/, this.plugin.promptService.prepareFullPrompt(history, chat.metadata)];
                    case 2:
                        formattedPrompt = _b.sent();
                        systemPrompt = this.plugin.promptService.getSystemPrompt();
                        requestBody = {
                            model: modelName,
                            prompt: formattedPrompt,
                            stream: false,
                            temperature: temperature,
                            options: { num_ctx: currentSettings.contextWindow },
                            system: systemPrompt !== null && systemPrompt !== void 0 ? systemPrompt : undefined
                        };
                        console.log("[OllamaService] Calling generateRaw for chat response: Model:\"" + modelName + "\", Temp:" + temperature);
                        return [4 /*yield*/, this.generateRaw(requestBody)];
                    case 3:
                        responseData = _b.sent();
                        // -------------------------------------------
                        // Process response
                        if (responseData && typeof responseData.response === 'string') {
                            assistantMessage = {
                                role: 'assistant',
                                content: responseData.response.trim(),
                                timestamp: new Date(responseData.created_at || Date.now())
                            };
                            return [2 /*return*/, assistantMessage];
                        }
                        else {
                            console.warn("[OllamaService] generateRaw returned unexpected structure:", responseData);
                            throw new Error("Received unexpected or empty response from the model.");
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _b.sent();
                        console.error("[OllamaService] Error during chat response generation cycle:", error_1);
                        errorMessage = error_1 instanceof Error ? error_1.message : "Unknown error generating response.";
                        if (errorMessage.includes("model not found")) {
                            errorMessage = "Model '" + modelName + "' not found. Check Ollama server or model name in settings/chat.";
                        }
                        else if (errorMessage.includes('context window')) {
                            errorMessage = "Context window error (" + currentSettings.contextWindow + " tokens): " + error_1.message + ". Adjust context settings.";
                        }
                        else if (errorMessage.includes("connect") || errorMessage.includes("fetch") || errorMessage.includes("NetworkError")) {
                            errorMessage = "Connection Error: Failed to reach Ollama at " + currentSettings.ollamaServerUrl + ". Is it running?";
                        }
                        // Throw refined error for the caller (MessageService/View) to handle
                        throw new Error(errorMessage);
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gets available models from Ollama (/api/tags).
     */
    OllamaService.prototype.getModels = function () {
        return __awaiter(this, void 0, Promise, function () { var data, e_1; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, this._ollamaFetch('/api/tags', { method: "GET" })];
                case 1:
                    data = _a.sent();
                    if (Array.isArray(data === null || data === void 0 ? void 0 : data.models)) {
                        return [2 /*return*/, data.models.map(function (m) { return typeof m === 'object' ? m.name : m; }).sort()];
                    }
                    return [2 /*return*/, []];
                case 2:
                    e_1 = _a.sent();
                    console.error("Err fetch models:", e_1);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        }); });
    };
    /**
     * Gets detailed information about a specific model (/api/show).
     */
    OllamaService.prototype.getModelDetails = function (modelName) {
        return __awaiter(this, void 0, Promise, function () { var data, e_2; return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("Workspaceing details for: " + modelName);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, this._ollamaFetch('/api/show', { method: "POST", body: JSON.stringify({ name: modelName }) })];
                case 2:
                    data = _a.sent();
                    return [2 /*return*/, data];
                case 3:
                    e_2 = _a.sent();
                    console.warn("Fail get details for " + modelName + ":", e_2);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        }); });
    };
    /**
     * Private helper for fetch requests to Ollama API.
     */
    OllamaService.prototype._ollamaFetch = function (endpoint, options) {
        return __awaiter(this, void 0, Promise, function () {
            var url, headers, response, errorText, bodyText, errorJson, _a, text, error_2, connectionErrorMsg;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        url = "" + this.plugin.settings.ollamaServerUrl + endpoint;
                        headers = __assign(__assign({}, options.headers), { 'Content-Type': 'application/json' });
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 9, , 10]);
                        return [4 /*yield*/, fetch(url, __assign(__assign({}, options), { headers: headers }))];
                    case 2:
                        response = _b.sent();
                        if (!!response.ok) return [3 /*break*/, 7];
                        errorText = "Ollama API error! Status: " + response.status + " at " + endpoint;
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, response.text()];
                    case 4:
                        bodyText = _b.sent();
                        try {
                            errorJson = JSON.parse(bodyText);
                            errorText += ": " + (errorJson.error || bodyText);
                        }
                        catch (_c) {
                            errorText += ": " + bodyText;
                        }
                        return [3 /*break*/, 6];
                    case 5:
                        _a = _b.sent();
                        return [3 /*break*/, 6];
                    case 6:
                        console.error(errorText);
                        throw new Error(errorText);
                    case 7: return [4 /*yield*/, response.text()];
                    case 8:
                        text = _b.sent();
                        if (!text) {
                            // Or return a specific type indicating no content if necessary
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, JSON.parse(text)]; // Assume JSON response
                    case 9:
                        error_2 = _b.sent();
                        console.error("Workspace error calling Ollama (" + url + "):", error_2);
                        connectionErrorMsg = "Failed to connect to Ollama server at " + this.plugin.settings.ollamaServerUrl + ". Is it running? (Endpoint: " + endpoint + ")";
                        this.emit('connection-error', new Error(connectionErrorMsg)); // Emit connection error event
                        throw new Error(connectionErrorMsg); // Re-throw for caller
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    return OllamaService;
}());
exports.OllamaService = OllamaService;
