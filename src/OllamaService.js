import { __asyncGenerator, __await, __awaiter } from "tslib";
export class OllamaService {
    constructor(plugin) {
        this.eventHandlers = {};
        this.plugin = plugin;
        if (!plugin.promptService) {
            const errorMsg = "[OllamaService] CRITICAL: PromptService not available on plugin instance during OllamaService construction!";
            throw new Error(errorMsg);
        }
        this.promptService = plugin.promptService;
        this.logger = plugin.logger;
    }
    on(event, callback) {
        if (!this.eventHandlers[event])
            this.eventHandlers[event] = [];
        this.eventHandlers[event].push(callback);
        return () => {
            var _a, _b;
            this.eventHandlers[event] = (_a = this.eventHandlers[event]) === null || _a === void 0 ? void 0 : _a.filter(h => h !== callback);
            if (((_b = this.eventHandlers[event]) === null || _b === void 0 ? void 0 : _b.length) === 0)
                delete this.eventHandlers[event];
        };
    }
    emit(event, data) {
        const h = this.eventHandlers[event];
        if (h)
            h.slice().forEach(handler => {
                try {
                    handler(data);
                }
                catch (e) { }
            });
    }
    /**
     * Відправляє запит на генерацію відповіді Ollama і повертає асинхронний ітератор для отримання частин відповіді.
     * @param chat Поточний об'єкт чату.
     * @param signal AbortSignal для можливості переривання запиту.
     * @returns Асинхронний ітератор, що видає StreamChunk.
     */
    generateChatResponseStream(chat, signal) {
        return __asyncGenerator(this, arguments, function* generateChatResponseStream_1() {
            var _a, _b, _c, _d, _e, _f;
            const requestTimestampId = Date.now();
            if (!chat) {
                yield yield __await({ type: "error", error: "Chat object is null.", done: true });
                return yield __await(void 0);
            }
            if (!this.promptService) {
                yield yield __await({ type: "error", error: "Prompt service is unavailable.", done: true });
                return yield __await(void 0);
            }
            const currentSettings = this.plugin.settings;
            const modelName = chat.metadata.modelName || currentSettings.modelName;
            const temperature = (_a = chat.metadata.temperature) !== null && _a !== void 0 ? _a : currentSettings.temperature;
            if (!modelName) {
                yield yield __await({ type: "error", error: "No Ollama model selected.", done: true });
                return yield __await(void 0);
            }
            const url = `${this.plugin.settings.ollamaServerUrl}/api/generate`;
            const headers = { "Content-Type": "application/json" };
            try {
                const history = chat.getMessages();
                const systemPrompt = yield __await(this.promptService.getSystemPromptForAPI(chat.metadata));
                const promptBody = yield __await(this.promptService.preparePromptBody(history, chat.metadata));
                if (promptBody === null || promptBody === undefined) {
                    yield yield __await({ type: "error", error: "Could not generate prompt body.", done: true });
                    return yield __await(void 0);
                }
                const requestBody = Object.assign({ model: modelName, prompt: promptBody, stream: true, temperature: temperature, options: { num_ctx: currentSettings.contextWindow } }, (systemPrompt && { system: systemPrompt }));
                if (this.plugin.agentManager && this.plugin.settings.enableToolUse) {
                    const agentTools = this.plugin.agentManager.getAllToolDefinitions();
                    if (agentTools && agentTools.length > 0) {
                        const modelDetails = yield __await(this.getModelDetails(modelName));
                        const seemsToSupportTools = ((_c = (_b = modelDetails === null || modelDetails === void 0 ? void 0 : modelDetails.details) === null || _b === void 0 ? void 0 : _b.family) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes("llama3")) ||
                            ((_e = (_d = modelDetails === null || modelDetails === void 0 ? void 0 : modelDetails.details) === null || _d === void 0 ? void 0 : _d.family) === null || _e === void 0 ? void 0 : _e.toLowerCase().includes("mistral")) ||
                            (((_f = modelDetails === null || modelDetails === void 0 ? void 0 : modelDetails.details) === null || _f === void 0 ? void 0 : _f.parameter_size) &&
                                parseFloat(modelDetails.details.parameter_size.replace("B", "")) >= 7);
                        if (seemsToSupportTools) {
                            requestBody.tools = agentTools.map(tool => ({ type: "function", function: tool }));
                        }
                        else {
                        }
                    }
                }
                const response = yield __await(fetch(url, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify(requestBody),
                    signal: signal,
                }));
                if (!response.ok) {
                    let errorText = `Ollama API error! Status: ${response.status}`;
                    try {
                        const errorJson = yield __await(response.json());
                        errorText += `: ${(errorJson === null || errorJson === void 0 ? void 0 : errorJson.error) || response.statusText || "No details"}`;
                    }
                    catch (e) {
                        errorText += `: ${response.statusText || "Could not parse error details"}`;
                    }
                    this.emit("connection-error", new Error(errorText));
                    yield yield __await({ type: "error", error: errorText, done: true });
                    return yield __await(void 0);
                }
                if (!response.body) {
                    yield yield __await({ type: "error", error: "Response body is null.", done: true });
                    return yield __await(void 0);
                }
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let rawResponseAccumulator = "";
                while (true) {
                    const { done, value } = yield __await(reader.read());
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                        reader.cancel("Aborted by user");
                        yield yield __await({ type: "error", error: "Generation aborted by user.", done: true });
                        return yield __await(void 0);
                    }
                    const decodedChunk = decoder.decode(value, { stream: !done });
                    rawResponseAccumulator += decodedChunk;
                    if (done) {
                        buffer += decodedChunk;
                        if (buffer.trim()) {
                            try {
                                const jsonChunk = JSON.parse(buffer.trim());
                                if (jsonChunk.message && jsonChunk.message.tool_calls && jsonChunk.message.tool_calls.length > 0) {
                                    yield yield __await({
                                        type: "tool_calls",
                                        calls: jsonChunk.message.tool_calls,
                                        assistant_message_with_calls: jsonChunk.message,
                                        model: jsonChunk.model,
                                        created_at: jsonChunk.created_at,
                                    });
                                }
                                else if (typeof jsonChunk.response === "string") {
                                    yield yield __await({
                                        type: "content",
                                        response: jsonChunk.response,
                                        done: jsonChunk.done || false,
                                        model: jsonChunk.model,
                                        created_at: jsonChunk.created_at,
                                    });
                                }
                                else if (jsonChunk.error) {
                                    yield yield __await({ type: "error", error: jsonChunk.error, done: true });
                                }
                            }
                            catch (e) { }
                        }
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    let eolIndex;
                    while ((eolIndex = buffer.indexOf("\n")) >= 0) {
                        const line = buffer.substring(0, eolIndex).trim();
                        buffer = buffer.substring(eolIndex + 1);
                        if (line === "")
                            continue;
                        try {
                            const jsonChunk = JSON.parse(line);
                            if (jsonChunk.error) {
                                yield yield __await({ type: "error", error: jsonChunk.error, done: true });
                                reader.cancel("Error received from Ollama stream");
                                return yield __await(void 0);
                            }
                            if (jsonChunk.message && jsonChunk.message.tool_calls && jsonChunk.message.tool_calls.length > 0) {
                                yield yield __await({
                                    type: "tool_calls",
                                    calls: jsonChunk.message.tool_calls,
                                    assistant_message_with_calls: jsonChunk.message,
                                    model: jsonChunk.model,
                                    created_at: jsonChunk.created_at,
                                });
                                if (jsonChunk.done === true) {
                                    yield yield __await({
                                        type: "done",
                                        model: jsonChunk.model,
                                        created_at: jsonChunk.created_at,
                                        context: jsonChunk.context,
                                        total_duration: jsonChunk.total_duration,
                                        load_duration: jsonChunk.load_duration,
                                        prompt_eval_count: jsonChunk.prompt_eval_count,
                                        prompt_eval_duration: jsonChunk.prompt_eval_duration,
                                        eval_count: jsonChunk.eval_count,
                                        eval_duration: jsonChunk.eval_duration,
                                    });
                                    return yield __await(void 0);
                                }
                            }
                            else if (typeof jsonChunk.response === "string") {
                                yield yield __await({
                                    type: "content",
                                    response: jsonChunk.response,
                                    done: jsonChunk.done || false,
                                    model: jsonChunk.model,
                                    created_at: jsonChunk.created_at,
                                });
                                if (jsonChunk.done === true) {
                                }
                            }
                            else if (jsonChunk.done === true) {
                                yield yield __await({
                                    type: "done",
                                    model: jsonChunk.model,
                                    created_at: jsonChunk.created_at,
                                    context: jsonChunk.context,
                                    total_duration: jsonChunk.total_duration,
                                    load_duration: jsonChunk.load_duration,
                                    prompt_eval_count: jsonChunk.prompt_eval_count,
                                    prompt_eval_duration: jsonChunk.prompt_eval_duration,
                                    eval_count: jsonChunk.eval_count,
                                    eval_duration: jsonChunk.eval_duration,
                                });
                                return yield __await(void 0);
                            }
                            else if (jsonChunk.message &&
                                (jsonChunk.message.content === null || jsonChunk.message.content === "") &&
                                !jsonChunk.message.tool_calls) {
                            }
                        }
                        catch (e) { }
                    }
                }
            }
            catch (error) {
                if (error.name === "AbortError") {
                    yield yield __await({ type: "error", error: "Generation aborted by user.", done: true });
                }
                else {
                    let errorMessage = error instanceof Error ? error.message : "Unknown error generating stream.";
                    if (errorMessage.includes("connect") ||
                        errorMessage.includes("fetch") ||
                        errorMessage.includes("NetworkError") ||
                        errorMessage.includes("Failed to fetch")) {
                        errorMessage = `Connection Error: Failed to reach Ollama at ${this.plugin.settings.ollamaServerUrl}. Is it running?`;
                        this.emit("connection-error", new Error(errorMessage));
                    }
                    yield yield __await({ type: "error", error: errorMessage, done: true });
                }
            }
            finally {
            }
        });
    }
    generateRaw(requestBody) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!requestBody.model || !requestBody.prompt) {
                throw new Error("generateRaw requires 'model' and 'prompt' in requestBody");
            }
            requestBody.stream = false;
            if (!requestBody.system) {
                delete requestBody.system;
            }
            const url = `${this.plugin.settings.ollamaServerUrl}/api/generate`;
            const headers = { "Content-Type": "application/json" };
            try {
                const response = yield fetch(url, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify(requestBody),
                });
                if (!response.ok) {
                    let errorText = `Ollama API error (generateRaw)! Status: ${response.status}`;
                    try {
                        const errorJson = yield response.json();
                        errorText += `: ${(errorJson === null || errorJson === void 0 ? void 0 : errorJson.error) || response.statusText || "No details"}`;
                    }
                    catch (e) {
                        errorText += `: ${response.statusText || "Could not parse error details"}`;
                    }
                    this.emit("connection-error", new Error(errorText));
                    throw new Error(errorText);
                }
                if (!response.body) {
                    throw new Error("Response body is null (generateRaw)");
                }
                return (yield response.json());
            }
            catch (error) {
                const connectionErrorMsg = `Failed to connect/communicate with Ollama server at ${this.plugin.settings.ollamaServerUrl}. Is it running? (Endpoint: /api/generate, non-streamed)`;
                if (!((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes("Ollama API error"))) {
                    this.emit("connection-error", new Error(connectionErrorMsg));
                }
                throw new Error(error.message || connectionErrorMsg);
            }
        });
    }
    generateEmbeddings(prompts, model) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!prompts || prompts.length === 0)
                return [];
            const endpoint = "/api/embeddings";
            const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
            const headers = { "Content-Type": "application/json" };
            const embeddingsList = [];
            try {
                for (const prompt of prompts) {
                    const trimmedPrompt = prompt.trim();
                    if (!trimmedPrompt)
                        continue;
                    const requestBody = JSON.stringify({ model: model, prompt: trimmedPrompt });
                    try {
                        const response = yield fetch(url, { method: "POST", headers, body: requestBody });
                        if (!response.ok) {
                            let errorText = `Ollama Embeddings API error! Status: ${response.status}`;
                            try {
                                const errJson = yield response.json();
                                errorText += `: ${(errJson === null || errJson === void 0 ? void 0 : errJson.error) || "Details unavailable"}`;
                            }
                            catch (_a) { }
                            continue;
                        }
                        const embeddingResponse = (yield response.json());
                        if (embeddingResponse && embeddingResponse.embedding) {
                            embeddingsList.push(embeddingResponse.embedding);
                        }
                        else {
                        }
                    }
                    catch (singleError) {
                        this.emit("connection-error", new Error(singleError.message || "Embedding generation failed for a prompt"));
                    }
                }
                return embeddingsList.length > 0 ? embeddingsList : null;
            }
            catch (error) {
                return null;
            }
        });
    }
    getModels() {
        return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
            var _a;
            const endpoint = "/api/tags";
            const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
            let modelListResult = [];
            try {
                const response = yield fetch(url, { method: "GET" });
                if (!response.ok) {
                    let errorText = `Ollama Tags API error! Status: ${response.status}`;
                    try {
                        const errJson = yield response.json();
                        errorText += `: ${(errJson === null || errJson === void 0 ? void 0 : errJson.error) || "Details unavailable"}`;
                    }
                    catch (_b) { }
                    this.emit("connection-error", new Error(errorText));
                    return [];
                }
                const data = (yield response.json());
                if (data && Array.isArray(data.models)) {
                    modelListResult = data.models
                        .map(m => m === null || m === void 0 ? void 0 : m.name)
                        .filter((name) => typeof name === "string" && name.length > 0)
                        .sort();
                }
                else {
                }
            }
            catch (e) {
                const connectionErrorMsg = `Failed to connect or fetch models from Ollama server at ${this.plugin.settings.ollamaServerUrl}. (Endpoint: /api/tags)`;
                if (!((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes("API error"))) {
                    this.emit("connection-error", new Error(e.message || connectionErrorMsg));
                }
                return [];
            }
            return modelListResult;
        });
    }
    getModelDetails(modelName) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const endpoint = "/api/show";
            const url = `${this.plugin.settings.ollamaServerUrl}${endpoint}`;
            const headers = { "Content-Type": "application/json" };
            try {
                const response = yield fetch(url, { method: "POST", headers, body: JSON.stringify({ name: modelName }) });
                if (!response.ok) {
                    let errorText = `Ollama Show API error for model ${modelName}! Status: ${response.status}`;
                    try {
                        const errJson = yield response.json();
                        errorText += `: ${(errJson === null || errJson === void 0 ? void 0 : errJson.error) || "Details unavailable"}`;
                    }
                    catch (_b) { }
                    if (response.status !== 404) {
                        this.emit("connection-error", new Error(errorText));
                    }
                    return null;
                }
                const data = (yield response.json());
                return data;
            }
            catch (e) {
                const connectionErrorMsg = `Failed to connect or get details for model ${modelName} from Ollama server at ${this.plugin.settings.ollamaServerUrl}. (Endpoint: /api/show)`;
                if (!((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes("API error"))) {
                    this.emit("connection-error", new Error(e.message || connectionErrorMsg));
                }
                return null;
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiT2xsYW1hU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIk9sbGFtYVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQXNDQSxNQUFNLE9BQU8sYUFBYTtJQU14QixZQUFZLE1BQW9CO1FBSHhCLGtCQUFhLEdBQThDLEVBQUUsQ0FBQztRQUlwRSxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQzFCLE1BQU0sUUFBUSxHQUNaLDZHQUE2RyxDQUFDO1lBQ2hILE1BQU0sSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLGFBQWEsQ0FBQztRQUMxQyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDOUIsQ0FBQztJQUVELEVBQUUsQ0FBQyxLQUFhLEVBQUUsUUFBNEI7UUFDNUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDO1lBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDL0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDekMsT0FBTyxHQUFHLEVBQUU7O1lBQ1YsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsR0FBRyxNQUFBLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLDBDQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQztZQUNuRixJQUFJLENBQUEsTUFBQSxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQywwQ0FBRSxNQUFNLE1BQUssQ0FBQztnQkFBRSxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxD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QzVCLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDdEQsQ0FBQztvQkFDRCxPQUFPLElBQUksQ0FBQztnQkFDZCxDQUFDO2dCQUNELE1BQU0sSUFBSSxHQUFHLENBQUMsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQXVCLENBQUM7Z0JBQzNELE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztZQUFDLE9BQU8sQ0FBTSxFQUFFLENBQUM7Z0JBQ2hCLE1BQU0sa0JBQWtCLEdBQUcsOENBQThDLFNBQVMsMEJBQTBCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUseUJBQXlCLENBQUM7Z0JBQzFLLElBQUksQ0FBQyxDQUFBLE1BQUEsQ0FBQyxDQUFDLE9BQU8sMENBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFBLEVBQUUsQ0FBQztvQkFDdEMsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxJQUFJLGtCQUFrQixDQUFDLENBQUMsQ0FBQztnQkFDNUUsQ0FBQztnQkFDRCxPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBPbGxhbWFQbHVnaW4gZnJvbSBcIi4vbWFpblwiO1xuXG5pbXBvcnQge1xuICBPbGxhbWFFbWJlZGRpbmdzUmVzcG9uc2UsXG4gIE9sbGFtYUdlbmVyYXRlUmVzcG9uc2UsXG4gIE9sbGFtYVNob3dSZXNwb25zZSxcbiAgVG9vbENhbGwsXG4gIEFzc2lzdGFudE1lc3NhZ2UsXG59IGZyb20gXCIuL3R5cGVzXCI7XG5cbmltcG9ydCB7IFByb21wdFNlcnZpY2UgfSBmcm9tIFwiLi9Qcm9tcHRTZXJ2aWNlXCI7XG5pbXBvcnQgeyBDaGF0IH0gZnJvbSBcIi4vQ2hhdFwiO1xuaW1wb3J0IHsgSVRvb2xGdW5jdGlvbiB9IGZyb20gXCIuL2FnZW50cy9JQWdlbnRcIjtcbmltcG9ydCB7IExvZ2dlciB9IGZyb20gXCIuL0xvZ2dlclwiO1xuXG5leHBvcnQgdHlwZSBTdHJlYW1DaHVuayA9XG4gIHwgeyB0eXBlOiBcImNvbnRlbnRcIjsgcmVzcG9uc2U6IHN0cmluZzsgZG9uZTogYm9vbGVhbjsgbW9kZWw6IHN0cmluZzsgY3JlYXRlZF9hdDogc3RyaW5nIH1cbiAgfCB7XG4gICAgICB0eXBlOiBcInRvb2xfY2FsbHNcIjtcbiAgICAgIGNhbGxzOiBUb29sQ2FsbFtdO1xuICAgICAgYXNzaXN0YW50X21lc3NhZ2Vfd2l0aF9jYWxsczogQXNzaXN0YW50TWVzc2FnZTtcbiAgICAgIG1vZGVsOiBzdHJpbmc7XG4gICAgICBjcmVhdGVkX2F0OiBzdHJpbmc7XG4gICAgfVxuICB8IHtcbiAgICAgIHR5cGU6IFwiZG9uZVwiO1xuICAgICAgbW9kZWw6IHN0cmluZztcbiAgICAgIGNyZWF0ZWRfYXQ6IHN0cmluZztcbiAgICAgIGNvbnRleHQ/OiBudW1iZXJbXTtcbiAgICAgIHRvdGFsX2R1cmF0aW9uPzogbnVtYmVyO1xuICAgICAgbG9hZF9kdXJhdGlvbj86IG51bWJlcjtcbiAgICAgIHByb21wdF9ldmFsX2NvdW50PzogbnVtYmVyO1xuICAgICAgcHJvbXB0X2V2YWxfZHVyYXRpb24/OiBudW1iZXI7XG4gICAgICBldmFsX2NvdW50PzogbnVtYmVyO1xuICAgICAgZXZhbF9kdXJhdGlvbj86IG51bWJlcjtcbiAgICB9XG4gIHwgeyB0eXBlOiBcImVycm9yXCI7IGVycm9yOiBzdHJpbmc7IGRvbmU6IHRydWUgfTtcblxuZXhwb3J0IGNsYXNzIE9sbGFtYVNlcnZpY2Uge1xuICBwcml2YXRlIHBsdWdpbjogT2xsYW1hUGx1Z2luO1xuICBwcml2YXRlIHByb21wdFNlcnZpY2U6IFByb21wdFNlcnZpY2U7XG4gIHByaXZhdGUgZXZlbnRIYW5kbGVyczogUmVjb3JkPHN0cmluZywgQXJyYXk8KGRhdGE6IGFueSkgPT4gYW55Pj4gPSB7fTtcbiAgbG9nZ2VyOiBMb2dnZXI7XG5cbiAgY29uc3RydWN0b3IocGx1Z2luOiBPbGxhbWFQbHVnaW4pIHtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgICBpZiAoIXBsdWdpbi5wcm9tcHRTZXJ2aWNlKSB7XG4gICAgICBjb25zdCBlcnJvck1zZyA9XG4gICAgICAgIFwiW09sbGFtYVNlcnZpY2VdIENSSVRJQ0FMOiBQcm9tcHRTZXJ2aWNlIG5vdCBhdmFpbGFibGUgb24gcGx1Z2luIGluc3RhbmNlIGR1cmluZyBPbGxhbWFTZXJ2aWNlIGNvbnN0cnVjdGlvbiFcIjtcbiAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvck1zZyk7XG4gICAgfVxuICAgIHRoaXMucHJvbXB0U2VydmljZSA9IHBsdWdpbi5wcm9tcHRTZXJ2aWNlO1xuICAgIHRoaXMubG9nZ2VyID0gcGx1Z2luLmxvZ2dlcjtcbiAgfVxuXG4gIG9uKGV2ZW50OiBzdHJpbmcsIGNhbGxiYWNrOiAoZGF0YTogYW55KSA9PiBhbnkpOiAoKSA9PiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0pIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0gPSBbXTtcbiAgICB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdLnB1c2goY2FsbGJhY2spO1xuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdID0gdGhpcy5ldmVudEhhbmRsZXJzW2V2ZW50XT8uZmlsdGVyKGggPT4gaCAhPT0gY2FsbGJhY2spO1xuICAgICAgaWYgKHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF0/Lmxlbmd0aCA9PT0gMCkgZGVsZXRlIHRoaXMuZXZlbnRIYW5kbGVyc1tldmVudF07XG4gICAgfTtcbiAgfVxuXG4gIGVtaXQoZXZlbnQ6IHN0cmluZywgZGF0YT86IGFueSk6IHZvaWQge1xuICAgIGNvbnN0IGggPSB0aGlzLmV2ZW50SGFuZGxlcnNbZXZlbnRdO1xuICAgIGlmIChoKVxuICAgICAgaC5zbGljZSgpLmZvckVhY2goaGFuZGxlciA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgaGFuZGxlcihkYXRhKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge31cbiAgICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqINCS0ZbQtNC/0YDQsNCy0LvRj9GUINC30LDQv9C40YIg0L3QsCDQs9C10L3QtdGA0LDRhtGW0Y4g0LLRltC00L/QvtCy0ZbQtNGWIE9sbGFtYSDRliDQv9C+0LLQtdGA0YLQsNGUINCw0YHQuNC90YXRgNC+0L3QvdC40Lkg0ZbRgtC10YDQsNGC0L7RgCDQtNC70Y8g0L7RgtGA0LjQvNCw0L3QvdGPINGH0LDRgdGC0LjQvSDQstGW0LTQv9C+0LLRltC00ZYuXG4gICAqIEBwYXJhbSBjaGF0INCf0L7RgtC+0YfQvdC40Lkg0L7QsSfRlNC60YIg0YfQsNGC0YMuXG4gICAqIEBwYXJhbSBzaWduYWwgQWJvcnRTaWduYWwg0LTQu9GPINC80L7QttC70LjQstC+0YHRgtGWINC/0LXRgNC10YDQuNCy0LDQvdC90Y8g0LfQsNC/0LjRgtGDLlxuICAgKiBAcmV0dXJucyDQkNGB0LjQvdGF0YDQvtC90L3QuNC5INGW0YLQtdGA0LDRgtC+0YAsINGJ0L4g0LLQuNC00LDRlCBTdHJlYW1DaHVuay5cbiAgICovXG4gIGFzeW5jICpnZW5lcmF0ZUNoYXRSZXNwb25zZVN0cmVhbShjaGF0OiBDaGF0LCBzaWduYWw/OiBBYm9ydFNpZ25hbCk6IEFzeW5jSXRlcmFibGVJdGVyYXRvcjxTdHJlYW1DaHVuaz4ge1xuICAgIGNvbnN0IHJlcXVlc3RUaW1lc3RhbXBJZCA9IERhdGUubm93KCk7XG4gICAgaWYgKCFjaGF0KSB7XG4gICAgICB5aWVsZCB7IHR5cGU6IFwiZXJyb3JcIiwgZXJyb3I6IFwiQ2hhdCBvYmplY3QgaXMgbnVsbC5cIiwgZG9uZTogdHJ1ZSB9O1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIXRoaXMucHJvbXB0U2VydmljZSkge1xuICAgICAgeWllbGQgeyB0eXBlOiBcImVycm9yXCIsIGVycm9yOiBcIlByb21wdCBzZXJ2aWNlIGlzIHVuYXZhaWxhYmxlLlwiLCBkb25lOiB0cnVlIH07XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY3VycmVudFNldHRpbmdzID0gdGhpcy5wbHVnaW4uc2V0dGluZ3M7XG4gICAgY29uc3QgbW9kZWxOYW1lID0gY2hhdC5tZXRhZGF0YS5tb2RlbE5hbWUgfHwgY3VycmVudFNldHRpbmdzLm1vZGVsTmFtZTtcbiAgICBjb25zdCB0ZW1wZXJhdHVyZSA9IGNoYXQubWV0YWRhdGEudGVtcGVyYXR1cmUgPz8gY3VycmVudFNldHRpbmdzLnRlbXBlcmF0dXJlO1xuXG4gICAgaWYgKCFtb2RlbE5hbWUpIHtcbiAgICAgIHlpZWxkIHsgdHlwZTogXCJlcnJvclwiLCBlcnJvcjogXCJObyBPbGxhbWEgbW9kZWwgc2VsZWN0ZWQuXCIsIGRvbmU6IHRydWUgfTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB1cmwgPSBgJHt0aGlzLnBsdWdpbi5zZXR0aW5ncy5vbGxhbWFTZXJ2ZXJVcmx9L2FwaS9nZW5lcmF0ZWA7XG4gICAgY29uc3QgaGVhZGVycyA9IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBoaXN0b3J5ID0gY2hhdC5nZXRNZXNzYWdlcygpO1xuICAgICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gYXdhaXQgdGhpcy5wcm9tcHRTZXJ2aWNlLmdldFN5c3RlbVByb21wdEZvckFQSShjaGF0Lm1ldGFkYXRhKTtcbiAgICAgIGNvbnN0IHByb21wdEJvZHkgPSBhd2FpdCB0aGlzLnByb21wdFNlcnZpY2UucHJlcGFyZVByb21wdEJvZHkoaGlzdG9yeSwgY2hhdC5tZXRhZGF0YSk7XG5cbiAgICAgIGlmIChwcm9tcHRCb2R5ID09PSBudWxsIHx8IHByb21wdEJvZHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB5aWVsZCB7IHR5cGU6IFwiZXJyb3JcIiwgZXJyb3I6IFwiQ291bGQgbm90IGdlbmVyYXRlIHByb21wdCBib2R5LlwiLCBkb25lOiB0cnVlIH07XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVxdWVzdEJvZHk6IGFueSA9IHtcbiAgICAgICAgbW9kZWw6IG1vZGVsTmFtZSxcbiAgICAgICAgcHJvbXB0OiBwcm9tcHRCb2R5LFxuICAgICAgICBzdHJlYW06IHRydWUsXG4gICAgICAgIHRlbXBlcmF0dXJlOiB0ZW1wZXJhdHVyZSxcbiAgICAgICAgb3B0aW9uczogeyBudW1fY3R4OiBjdXJyZW50U2V0dGluZ3MuY29udGV4dFdpbmRvdyB9LFxuICAgICAgICAuLi4oc3lzdGVtUHJvbXB0ICYmIHsgc3lzdGVtOiBzeXN0ZW1Qcm9tcHQgfSksXG4gICAgICB9O1xuXG4gICAgICBpZiAodGhpcy5wbHVnaW4uYWdlbnRNYW5hZ2VyICYmIHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVRvb2xVc2UpIHtcbiAgICAgICAgY29uc3QgYWdlbnRUb29sczogSVRvb2xGdW5jdGlvbltdID0gdGhpcy5wbHVnaW4uYWdlbnRNYW5hZ2VyLmdldEFsbFRvb2xEZWZpbml0aW9ucygpO1xuICAgICAgICBpZiAoYWdlbnRUb29scyAmJiBhZ2VudFRvb2xzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBjb25zdCBtb2RlbERldGFpbHMgPSBhd2FpdCB0aGlzLmdldE1vZGVsRGV0YWlscyhtb2RlbE5hbWUpO1xuICAgICAgICAgIGNvbnN0IHNlZW1zVG9TdXBwb3J0VG9vbHMgPVxuICAgICAgICAgICAgbW9kZWxEZXRhaWxzPy5kZXRhaWxzPy5mYW1pbHk/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoXCJsbGFtYTNcIikgfHxcbiAgICAgICAgICAgIG1vZGVsRGV0YWlscz8uZGV0YWlscz8uZmFtaWx5Py50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKFwibWlzdHJhbFwiKSB8fFxuICAgICAgICAgICAgKG1vZGVsRGV0YWlscz8uZGV0YWlscz8ucGFyYW1ldGVyX3NpemUgJiZcbiAgICAgICAgICAgICAgcGFyc2VGbG9hdChtb2RlbERldGFpbHMuZGV0YWlscy5wYXJhbWV0ZXJfc2l6ZS5yZXBsYWNlKFwiQlwiLCBcIlwiKSkgPj0gNyk7XG5cbiAgICAgICAgICBpZiAoc2VlbXNUb1N1cHBvcnRUb29scykge1xuICAgICAgICAgICAgcmVxdWVzdEJvZHkudG9vbHMgPSBhZ2VudFRvb2xzLm1hcCh0b29sID0+ICh7IHR5cGU6IFwiZnVuY3Rpb25cIiwgZnVuY3Rpb246IHRvb2wgfSkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XG4gICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICAgIGhlYWRlcnM6IGhlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlcXVlc3RCb2R5KSxcbiAgICAgICAgc2lnbmFsOiBzaWduYWwsXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICBsZXQgZXJyb3JUZXh0ID0gYE9sbGFtYSBBUEkgZXJyb3IhIFN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBlcnJvckpzb24gPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgICAgZXJyb3JUZXh0ICs9IGA6ICR7ZXJyb3JKc29uPy5lcnJvciB8fCByZXNwb25zZS5zdGF0dXNUZXh0IHx8IFwiTm8gZGV0YWlsc1wifWA7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBlcnJvclRleHQgKz0gYDogJHtyZXNwb25zZS5zdGF0dXNUZXh0IHx8IFwiQ291bGQgbm90IHBhcnNlIGVycm9yIGRldGFpbHNcIn1gO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZW1pdChcImNvbm5lY3Rpb24tZXJyb3JcIiwgbmV3IEVycm9yKGVycm9yVGV4dCkpO1xuICAgICAgICB5aWVsZCB7IHR5cGU6IFwiZXJyb3JcIiwgZXJyb3I6IGVycm9yVGV4dCwgZG9uZTogdHJ1ZSB9O1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICghcmVzcG9uc2UuYm9keSkge1xuICAgICAgICB5aWVsZCB7IHR5cGU6IFwiZXJyb3JcIiwgZXJyb3I6IFwiUmVzcG9uc2UgYm9keSBpcyBudWxsLlwiLCBkb25lOiB0cnVlIH07XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVhZGVyID0gcmVzcG9uc2UuYm9keS5nZXRSZWFkZXIoKTtcbiAgICAgIGNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTtcbiAgICAgIGxldCBidWZmZXIgPSBcIlwiO1xuICAgICAgbGV0IHJhd1Jlc3BvbnNlQWNjdW11bGF0b3IgPSBcIlwiO1xuICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgY29uc3QgeyBkb25lLCB2YWx1ZSB9ID0gYXdhaXQgcmVhZGVyLnJlYWQoKTtcblxuICAgICAgICBpZiAoc2lnbmFsPy5hYm9ydGVkKSB7XG4gICAgICAgICAgcmVhZGVyLmNhbmNlbChcIkFib3J0ZWQgYnkgdXNlclwiKTtcbiAgICAgICAgICB5aWVsZCB7IHR5cGU6IFwiZXJyb3JcIiwgZXJyb3I6IFwiR2VuZXJhdGlvbiBhYm9ydGVkIGJ5IHVzZXIuXCIsIGRvbmU6IHRydWUgfTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGVjb2RlZENodW5rID0gZGVjb2Rlci5kZWNvZGUodmFsdWUsIHsgc3RyZWFtOiAhZG9uZSB9KTtcblxuICAgICAgICByYXdSZXNwb25zZUFjY3VtdWxhdG9yICs9IGRlY29kZWRDaHVuaztcblxuICAgICAgICBpZiAoZG9uZSkge1xuICAgICAgICAgIGJ1ZmZlciArPSBkZWNvZGVkQ2h1bms7XG5cbiAgICAgICAgICBpZiAoYnVmZmVyLnRyaW0oKSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QganNvbkNodW5rID0gSlNPTi5wYXJzZShidWZmZXIudHJpbSgpKTtcblxuICAgICAgICAgICAgICBpZiAoanNvbkNodW5rLm1lc3NhZ2UgJiYganNvbkNodW5rLm1lc3NhZ2UudG9vbF9jYWxscyAmJiBqc29uQ2h1bmsubWVzc2FnZS50b29sX2NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB5aWVsZCB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiBcInRvb2xfY2FsbHNcIixcbiAgICAgICAgICAgICAgICAgIGNhbGxzOiBqc29uQ2h1bmsubWVzc2FnZS50b29sX2NhbGxzLFxuICAgICAgICAgICAgICAgICAgYXNzaXN0YW50X21lc3NhZ2Vfd2l0aF9jYWxsczoganNvbkNodW5rLm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICBtb2RlbDoganNvbkNodW5rLm1vZGVsLFxuICAgICAgICAgICAgICAgICAgY3JlYXRlZF9hdDoganNvbkNodW5rLmNyZWF0ZWRfYXQsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YganNvbkNodW5rLnJlc3BvbnNlID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgeWllbGQge1xuICAgICAgICAgICAgICAgICAgdHlwZTogXCJjb250ZW50XCIsXG4gICAgICAgICAgICAgICAgICByZXNwb25zZToganNvbkNodW5rLnJlc3BvbnNlLFxuICAgICAgICAgICAgICAgICAgZG9uZToganNvbkNodW5rLmRvbmUgfHwgZmFsc2UsXG4gICAgICAgICAgICAgICAgICBtb2RlbDoganNvbkNodW5rLm1vZGVsLFxuICAgICAgICAgICAgICAgICAgY3JlYXRlZF9hdDoganNvbkNodW5rLmNyZWF0ZWRfYXQsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChqc29uQ2h1bmsuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICB5aWVsZCB7IHR5cGU6IFwiZXJyb3JcIiwgZXJyb3I6IGpzb25DaHVuay5lcnJvciwgZG9uZTogdHJ1ZSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlOiBhbnkpIHt9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgYnVmZmVyICs9IGRlY29kZXIuZGVjb2RlKHZhbHVlLCB7IHN0cmVhbTogdHJ1ZSB9KTtcbiAgICAgICAgbGV0IGVvbEluZGV4O1xuXG4gICAgICAgIHdoaWxlICgoZW9sSW5kZXggPSBidWZmZXIuaW5kZXhPZihcIlxcblwiKSkgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGxpbmUgPSBidWZmZXIuc3Vic3RyaW5nKDAsIGVvbEluZGV4KS50cmltKCk7XG4gICAgICAgICAgYnVmZmVyID0gYnVmZmVyLnN1YnN0cmluZyhlb2xJbmRleCArIDEpO1xuXG4gICAgICAgICAgaWYgKGxpbmUgPT09IFwiXCIpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGpzb25DaHVuayA9IEpTT04ucGFyc2UobGluZSk7XG5cbiAgICAgICAgICAgIGlmIChqc29uQ2h1bmsuZXJyb3IpIHtcbiAgICAgICAgICAgICAgeWllbGQgeyB0eXBlOiBcImVycm9yXCIsIGVycm9yOiBqc29uQ2h1bmsuZXJyb3IsIGRvbmU6IHRydWUgfTtcbiAgICAgICAgICAgICAgcmVhZGVyLmNhbmNlbChcIkVycm9yIHJlY2VpdmVkIGZyb20gT2xsYW1hIHN0cmVhbVwiKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoanNvbkNodW5rLm1lc3NhZ2UgJiYganNvbkNodW5rLm1lc3NhZ2UudG9vbF9jYWxscyAmJiBqc29uQ2h1bmsubWVzc2FnZS50b29sX2NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgeWllbGQge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwidG9vbF9jYWxsc1wiLFxuICAgICAgICAgICAgICAgIGNhbGxzOiBqc29uQ2h1bmsubWVzc2FnZS50b29sX2NhbGxzLFxuICAgICAgICAgICAgICAgIGFzc2lzdGFudF9tZXNzYWdlX3dpdGhfY2FsbHM6IGpzb25DaHVuay5tZXNzYWdlIGFzIEFzc2lzdGFudE1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgbW9kZWw6IGpzb25DaHVuay5tb2RlbCxcbiAgICAgICAgICAgICAgICBjcmVhdGVkX2F0OiBqc29uQ2h1bmsuY3JlYXRlZF9hdCxcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBpZiAoanNvbkNodW5rLmRvbmUgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICB5aWVsZCB7XG4gICAgICAgICAgICAgICAgICB0eXBlOiBcImRvbmVcIixcbiAgICAgICAgICAgICAgICAgIG1vZGVsOiBqc29uQ2h1bmsubW9kZWwsXG4gICAgICAgICAgICAgICAgICBjcmVhdGVkX2F0OiBqc29uQ2h1bmsuY3JlYXRlZF9hdCxcbiAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IGpzb25DaHVuay5jb250ZXh0LFxuICAgICAgICAgICAgICAgICAgdG90YWxfZHVyYXRpb246IGpzb25DaHVuay50b3RhbF9kdXJhdGlvbixcbiAgICAgICAgICAgICAgICAgIGxvYWRfZHVyYXRpb246IGpzb25DaHVuay5sb2FkX2R1cmF0aW9uLFxuICAgICAgICAgICAgICAgICAgcHJvbXB0X2V2YWxfY291bnQ6IGpzb25DaHVuay5wcm9tcHRfZXZhbF9jb3VudCxcbiAgICAgICAgICAgICAgICAgIHByb21wdF9ldmFsX2R1cmF0aW9uOiBqc29uQ2h1bmsucHJvbXB0X2V2YWxfZHVyYXRpb24sXG4gICAgICAgICAgICAgICAgICBldmFsX2NvdW50OiBqc29uQ2h1bmsuZXZhbF9jb3VudCxcbiAgICAgICAgICAgICAgICAgIGV2YWxfZHVyYXRpb246IGpzb25DaHVuay5ldmFsX2R1cmF0aW9uLFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGpzb25DaHVuay5yZXNwb25zZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICB5aWVsZCB7XG4gICAgICAgICAgICAgICAgdHlwZTogXCJjb250ZW50XCIsXG4gICAgICAgICAgICAgICAgcmVzcG9uc2U6IGpzb25DaHVuay5yZXNwb25zZSxcbiAgICAgICAgICAgICAgICBkb25lOiBqc29uQ2h1bmsuZG9uZSB8fCBmYWxzZSxcbiAgICAgICAgICAgICAgICBtb2RlbDoganNvbkNodW5rLm1vZGVsLFxuICAgICAgICAgICAgICAgIGNyZWF0ZWRfYXQ6IGpzb25DaHVuay5jcmVhdGVkX2F0LFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBpZiAoanNvbkNodW5rLmRvbmUgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChqc29uQ2h1bmsuZG9uZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICB5aWVsZCB7XG4gICAgICAgICAgICAgICAgdHlwZTogXCJkb25lXCIsXG4gICAgICAgICAgICAgICAgbW9kZWw6IGpzb25DaHVuay5tb2RlbCxcbiAgICAgICAgICAgICAgICBjcmVhdGVkX2F0OiBqc29uQ2h1bmsuY3JlYXRlZF9hdCxcbiAgICAgICAgICAgICAgICBjb250ZXh0OiBqc29uQ2h1bmsuY29udGV4dCxcbiAgICAgICAgICAgICAgICB0b3RhbF9kdXJhdGlvbjoganNvbkNodW5rLnRvdGFsX2R1cmF0aW9uLFxuICAgICAgICAgICAgICAgIGxvYWRfZHVyYXRpb246IGpzb25DaHVuay5sb2FkX2R1cmF0aW9uLFxuICAgICAgICAgICAgICAgIHByb21wdF9ldmFsX2NvdW50OiBqc29uQ2h1bmsucHJvbXB0X2V2YWxfY291bnQsXG4gICAgICAgICAgICAgICAgcHJvbXB0X2V2YWxfZHVyYXRpb246IGpzb25DaHVuay5wcm9tcHRfZXZhbF9kdXJhdGlvbixcbiAgICAgICAgICAgICAgICBldmFsX2NvdW50OiBqc29uQ2h1bmsuZXZhbF9jb3VudCxcbiAgICAgICAgICAgICAgICBldmFsX2R1cmF0aW9uOiBqc29uQ2h1bmsuZXZhbF9kdXJhdGlvbixcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAganNvbkNodW5rLm1lc3NhZ2UgJiZcbiAgICAgICAgICAgICAgKGpzb25DaHVuay5tZXNzYWdlLmNvbnRlbnQgPT09IG51bGwgfHwganNvbkNodW5rLm1lc3NhZ2UuY29udGVudCA9PT0gXCJcIikgJiZcbiAgICAgICAgICAgICAgIWpzb25DaHVuay5tZXNzYWdlLnRvb2xfY2FsbHNcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGU6IGFueSkge31cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIGlmIChlcnJvci5uYW1lID09PSBcIkFib3J0RXJyb3JcIikge1xuICAgICAgICB5aWVsZCB7IHR5cGU6IFwiZXJyb3JcIiwgZXJyb3I6IFwiR2VuZXJhdGlvbiBhYm9ydGVkIGJ5IHVzZXIuXCIsIGRvbmU6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiVW5rbm93biBlcnJvciBnZW5lcmF0aW5nIHN0cmVhbS5cIjtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcyhcImNvbm5lY3RcIikgfHxcbiAgICAgICAgICBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoXCJmZXRjaFwiKSB8fFxuICAgICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcyhcIk5ldHdvcmtFcnJvclwiKSB8fFxuICAgICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcyhcIkZhaWxlZCB0byBmZXRjaFwiKVxuICAgICAgICApIHtcbiAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgQ29ubmVjdGlvbiBFcnJvcjogRmFpbGVkIHRvIHJlYWNoIE9sbGFtYSBhdCAke3RoaXMucGx1Z2luLnNldHRpbmdzLm9sbGFtYVNlcnZlclVybH0uIElzIGl0IHJ1bm5pbmc/YDtcbiAgICAgICAgICB0aGlzLmVtaXQoXCJjb25uZWN0aW9uLWVycm9yXCIsIG5ldyBFcnJvcihlcnJvck1lc3NhZ2UpKTtcbiAgICAgICAgfVxuICAgICAgICB5aWVsZCB7IHR5cGU6IFwiZXJyb3JcIiwgZXJyb3I6IGVycm9yTWVzc2FnZSwgZG9uZTogdHJ1ZSB9O1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZ2VuZXJhdGVSYXcocmVxdWVzdEJvZHk6IGFueSk6IFByb21pc2U8T2xsYW1hR2VuZXJhdGVSZXNwb25zZT4ge1xuICAgIGlmICghcmVxdWVzdEJvZHkubW9kZWwgfHwgIXJlcXVlc3RCb2R5LnByb21wdCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZ2VuZXJhdGVSYXcgcmVxdWlyZXMgJ21vZGVsJyBhbmQgJ3Byb21wdCcgaW4gcmVxdWVzdEJvZHlcIik7XG4gICAgfVxuICAgIHJlcXVlc3RCb2R5LnN0cmVhbSA9IGZhbHNlO1xuICAgIGlmICghcmVxdWVzdEJvZHkuc3lzdGVtKSB7XG4gICAgICBkZWxldGUgcmVxdWVzdEJvZHkuc3lzdGVtO1xuICAgIH1cblxuICAgIGNvbnN0IHVybCA9IGAke3RoaXMucGx1Z2luLnNldHRpbmdzLm9sbGFtYVNlcnZlclVybH0vYXBpL2dlbmVyYXRlYDtcbiAgICBjb25zdCBoZWFkZXJzID0geyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9O1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwge1xuICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICBoZWFkZXJzOiBoZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXF1ZXN0Qm9keSksXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICBsZXQgZXJyb3JUZXh0ID0gYE9sbGFtYSBBUEkgZXJyb3IgKGdlbmVyYXRlUmF3KSEgU3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGVycm9ySnNvbiA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICBlcnJvclRleHQgKz0gYDogJHtlcnJvckpzb24/LmVycm9yIHx8IHJlc3BvbnNlLnN0YXR1c1RleHQgfHwgXCJObyBkZXRhaWxzXCJ9YDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGVycm9yVGV4dCArPSBgOiAke3Jlc3BvbnNlLnN0YXR1c1RleHQgfHwgXCJDb3VsZCBub3QgcGFyc2UgZXJyb3IgZGV0YWlsc1wifWA7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lbWl0KFwiY29ubmVjdGlvbi1lcnJvclwiLCBuZXcgRXJyb3IoZXJyb3JUZXh0KSk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvclRleHQpO1xuICAgICAgfVxuICAgICAgaWYgKCFyZXNwb25zZS5ib2R5KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlJlc3BvbnNlIGJvZHkgaXMgbnVsbCAoZ2VuZXJhdGVSYXcpXCIpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIChhd2FpdCByZXNwb25zZS5qc29uKCkpIGFzIE9sbGFtYUdlbmVyYXRlUmVzcG9uc2U7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgY29uc3QgY29ubmVjdGlvbkVycm9yTXNnID0gYEZhaWxlZCB0byBjb25uZWN0L2NvbW11bmljYXRlIHdpdGggT2xsYW1hIHNlcnZlciBhdCAke3RoaXMucGx1Z2luLnNldHRpbmdzLm9sbGFtYVNlcnZlclVybH0uIElzIGl0IHJ1bm5pbmc/IChFbmRwb2ludDogL2FwaS9nZW5lcmF0ZSwgbm9uLXN0cmVhbWVkKWA7XG4gICAgICBpZiAoIWVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKFwiT2xsYW1hIEFQSSBlcnJvclwiKSkge1xuICAgICAgICB0aGlzLmVtaXQoXCJjb25uZWN0aW9uLWVycm9yXCIsIG5ldyBFcnJvcihjb25uZWN0aW9uRXJyb3JNc2cpKTtcbiAgICAgIH1cbiAgICAgIHRocm93IG5ldyBFcnJvcihlcnJvci5tZXNzYWdlIHx8IGNvbm5lY3Rpb25FcnJvck1zZyk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZ2VuZXJhdGVFbWJlZGRpbmdzKHByb21wdHM6IHN0cmluZ1tdLCBtb2RlbDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXJbXVtdIHwgbnVsbD4ge1xuICAgIGlmICghcHJvbXB0cyB8fCBwcm9tcHRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFtdO1xuICAgIGNvbnN0IGVuZHBvaW50ID0gXCIvYXBpL2VtYmVkZGluZ3NcIjtcbiAgICBjb25zdCB1cmwgPSBgJHt0aGlzLnBsdWdpbi5zZXR0aW5ncy5vbGxhbWFTZXJ2ZXJVcmx9JHtlbmRwb2ludH1gO1xuICAgIGNvbnN0IGhlYWRlcnMgPSB7IFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH07XG4gICAgY29uc3QgZW1iZWRkaW5nc0xpc3Q6IG51bWJlcltdW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICBmb3IgKGNvbnN0IHByb21wdCBvZiBwcm9tcHRzKSB7XG4gICAgICAgIGNvbnN0IHRyaW1tZWRQcm9tcHQgPSBwcm9tcHQudHJpbSgpO1xuICAgICAgICBpZiAoIXRyaW1tZWRQcm9tcHQpIGNvbnRpbnVlO1xuXG4gICAgICAgIGNvbnN0IHJlcXVlc3RCb2R5ID0gSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogbW9kZWwsIHByb21wdDogdHJpbW1lZFByb21wdCB9KTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCwgeyBtZXRob2Q6IFwiUE9TVFwiLCBoZWFkZXJzLCBib2R5OiByZXF1ZXN0Qm9keSB9KTtcbiAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICBsZXQgZXJyb3JUZXh0ID0gYE9sbGFtYSBFbWJlZGRpbmdzIEFQSSBlcnJvciEgU3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgZXJySnNvbiA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICAgICAgZXJyb3JUZXh0ICs9IGA6ICR7ZXJySnNvbj8uZXJyb3IgfHwgXCJEZXRhaWxzIHVuYXZhaWxhYmxlXCJ9YDtcbiAgICAgICAgICAgIH0gY2F0Y2gge31cblxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IGVtYmVkZGluZ1Jlc3BvbnNlID0gKGF3YWl0IHJlc3BvbnNlLmpzb24oKSkgYXMgT2xsYW1hRW1iZWRkaW5nc1Jlc3BvbnNlO1xuICAgICAgICAgIGlmIChlbWJlZGRpbmdSZXNwb25zZSAmJiBlbWJlZGRpbmdSZXNwb25zZS5lbWJlZGRpbmcpIHtcbiAgICAgICAgICAgIGVtYmVkZGluZ3NMaXN0LnB1c2goZW1iZWRkaW5nUmVzcG9uc2UuZW1iZWRkaW5nKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoc2luZ2xlRXJyb3I6IGFueSkge1xuICAgICAgICAgIHRoaXMuZW1pdChcImNvbm5lY3Rpb24tZXJyb3JcIiwgbmV3IEVycm9yKHNpbmdsZUVycm9yLm1lc3NhZ2UgfHwgXCJFbWJlZGRpbmcgZ2VuZXJhdGlvbiBmYWlsZWQgZm9yIGEgcHJvbXB0XCIpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGVtYmVkZGluZ3NMaXN0Lmxlbmd0aCA+IDAgPyBlbWJlZGRpbmdzTGlzdCA6IG51bGw7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgZ2V0TW9kZWxzKGZvcmNlUmVmcmVzaDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIGNvbnN0IGVuZHBvaW50ID0gXCIvYXBpL3RhZ3NcIjtcbiAgICBjb25zdCB1cmwgPSBgJHt0aGlzLnBsdWdpbi5zZXR0aW5ncy5vbGxhbWFTZXJ2ZXJVcmx9JHtlbmRwb2ludH1gO1xuICAgIGxldCBtb2RlbExpc3RSZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHsgbWV0aG9kOiBcIkdFVFwiIH0pO1xuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICBsZXQgZXJyb3JUZXh0ID0gYE9sbGFtYSBUYWdzIEFQSSBlcnJvciEgU3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGVyckpzb24gPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgICAgZXJyb3JUZXh0ICs9IGA6ICR7ZXJySnNvbj8uZXJyb3IgfHwgXCJEZXRhaWxzIHVuYXZhaWxhYmxlXCJ9YDtcbiAgICAgICAgfSBjYXRjaCB7fVxuICAgICAgICB0aGlzLmVtaXQoXCJjb25uZWN0aW9uLWVycm9yXCIsIG5ldyBFcnJvcihlcnJvclRleHQpKTtcblxuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBjb25zdCBkYXRhID0gKGF3YWl0IHJlc3BvbnNlLmpzb24oKSkgYXMge1xuICAgICAgICBtb2RlbHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBtb2RpZmllZF9hdDogc3RyaW5nOyBzaXplOiBudW1iZXI7IGRpZ2VzdDogc3RyaW5nOyBkZXRhaWxzOiBvYmplY3QgfT47XG4gICAgICB9O1xuICAgICAgaWYgKGRhdGEgJiYgQXJyYXkuaXNBcnJheShkYXRhLm1vZGVscykpIHtcbiAgICAgICAgbW9kZWxMaXN0UmVzdWx0ID0gZGF0YS5tb2RlbHNcbiAgICAgICAgICAubWFwKG0gPT4gbT8ubmFtZSlcbiAgICAgICAgICAuZmlsdGVyKChuYW1lKTogbmFtZSBpcyBzdHJpbmcgPT4gdHlwZW9mIG5hbWUgPT09IFwic3RyaW5nXCIgJiYgbmFtZS5sZW5ndGggPiAwKVxuICAgICAgICAgIC5zb3J0KCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgY29uc3QgY29ubmVjdGlvbkVycm9yTXNnID0gYEZhaWxlZCB0byBjb25uZWN0IG9yIGZldGNoIG1vZGVscyBmcm9tIE9sbGFtYSBzZXJ2ZXIgYXQgJHt0aGlzLnBsdWdpbi5zZXR0aW5ncy5vbGxhbWFTZXJ2ZXJVcmx9LiAoRW5kcG9pbnQ6IC9hcGkvdGFncylgO1xuICAgICAgaWYgKCFlLm1lc3NhZ2U/LmluY2x1ZGVzKFwiQVBJIGVycm9yXCIpKSB7XG4gICAgICAgIHRoaXMuZW1pdChcImNvbm5lY3Rpb24tZXJyb3JcIiwgbmV3IEVycm9yKGUubWVzc2FnZSB8fCBjb25uZWN0aW9uRXJyb3JNc2cpKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgICByZXR1cm4gbW9kZWxMaXN0UmVzdWx0O1xuICB9XG5cbiAgYXN5bmMgZ2V0TW9kZWxEZXRhaWxzKG1vZGVsTmFtZTogc3RyaW5nKTogUHJvbWlzZTxPbGxhbWFTaG93UmVzcG9uc2UgfCBudWxsPiB7XG4gICAgY29uc3QgZW5kcG9pbnQgPSBcIi9hcGkvc2hvd1wiO1xuICAgIGNvbnN0IHVybCA9IGAke3RoaXMucGx1Z2luLnNldHRpbmdzLm9sbGFtYVNlcnZlclVybH0ke2VuZHBvaW50fWA7XG4gICAgY29uc3QgaGVhZGVycyA9IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHsgbWV0aG9kOiBcIlBPU1RcIiwgaGVhZGVycywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiBtb2RlbE5hbWUgfSkgfSk7XG4gICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgIGxldCBlcnJvclRleHQgPSBgT2xsYW1hIFNob3cgQVBJIGVycm9yIGZvciBtb2RlbCAke21vZGVsTmFtZX0hIFN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBlcnJKc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgICAgICAgIGVycm9yVGV4dCArPSBgOiAke2Vyckpzb24/LmVycm9yIHx8IFwiRGV0YWlscyB1bmF2YWlsYWJsZVwifWA7XG4gICAgICAgIH0gY2F0Y2gge31cbiAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gNDA0KSB7XG4gICAgICAgICAgdGhpcy5lbWl0KFwiY29ubmVjdGlvbi1lcnJvclwiLCBuZXcgRXJyb3IoZXJyb3JUZXh0KSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBjb25zdCBkYXRhID0gKGF3YWl0IHJlc3BvbnNlLmpzb24oKSkgYXMgT2xsYW1hU2hvd1Jlc3BvbnNlO1xuICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfSBjYXRjaCAoZTogYW55KSB7XG4gICAgICBjb25zdCBjb25uZWN0aW9uRXJyb3JNc2cgPSBgRmFpbGVkIHRvIGNvbm5lY3Qgb3IgZ2V0IGRldGFpbHMgZm9yIG1vZGVsICR7bW9kZWxOYW1lfSBmcm9tIE9sbGFtYSBzZXJ2ZXIgYXQgJHt0aGlzLnBsdWdpbi5zZXR0aW5ncy5vbGxhbWFTZXJ2ZXJVcmx9LiAoRW5kcG9pbnQ6IC9hcGkvc2hvdylgO1xuICAgICAgaWYgKCFlLm1lc3NhZ2U/LmluY2x1ZGVzKFwiQVBJIGVycm9yXCIpKSB7XG4gICAgICAgIHRoaXMuZW1pdChcImNvbm5lY3Rpb24tZXJyb3JcIiwgbmV3IEVycm9yKGUubWVzc2FnZSB8fCBjb25uZWN0aW9uRXJyb3JNc2cpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxufVxuIl19