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
exports.__esModule = true;
exports.RagService = void 0;
var RagService = /** @class */ (function () {
    function RagService(plugin) {
        this.documents = [];
        this.isIndexing = false;
        this.plugin = plugin;
    }
    /**
     * Index all markdown files in the specified folder path
     */
    RagService.prototype.indexDocuments = function () {
        var _a, _b;
        return __awaiter(this, void 0, Promise, function () {
            var folderPath, vault, allFiles, files, _i, files_1, file, content, error_1, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (this.isIndexing)
                            return [2 /*return*/];
                        this.isIndexing = true;
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 9, 10, 11]);
                        folderPath = this.plugin.settings.ragFolderPath;
                        vault = this.plugin.app.vault;
                        // Оновлюємо повідомлення для логування
                        console.log("AI Assistant path: \"" + folderPath + "\" (RAG documents will be loaded from here)");
                        allFiles = vault.getFiles();
                        console.log("Total files in vault: " + allFiles.length);
                        return [4 /*yield*/, this.getMarkdownFiles(vault, folderPath)];
                    case 2:
                        files = _c.sent();
                        console.log("Found " + files.length + " markdown files from \"" + folderPath + "\"");
                        console.log("Indexing " + files.length + " markdown files from " + folderPath);
                        this.documents = [];
                        _i = 0, files_1 = files;
                        _c.label = 3;
                    case 3:
                        if (!(_i < files_1.length)) return [3 /*break*/, 8];
                        file = files_1[_i];
                        _c.label = 4;
                    case 4:
                        _c.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, vault.read(file)];
                    case 5:
                        content = _c.sent();
                        this.documents.push({
                            path: file.path,
                            content: content,
                            metadata: {
                                filename: file.name,
                                created: (_a = file.stat) === null || _a === void 0 ? void 0 : _a.ctime,
                                modified: (_b = file.stat) === null || _b === void 0 ? void 0 : _b.mtime
                            }
                        });
                        return [3 /*break*/, 7];
                    case 6:
                        error_1 = _c.sent();
                        console.error("Error reading file " + file.path + ":", error_1);
                        return [3 /*break*/, 7];
                    case 7:
                        _i++;
                        return [3 /*break*/, 3];
                    case 8:
                        console.log("Indexed " + this.documents.length + " documents for RAG");
                        return [3 /*break*/, 11];
                    case 9:
                        error_2 = _c.sent();
                        console.error("Error indexing documents:", error_2);
                        return [3 /*break*/, 11];
                    case 10:
                        this.isIndexing = false;
                        return [7 /*endfinally*/];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get all markdown files in the specified folder path
     */
    RagService.prototype.getMarkdownFiles = function (vault, folderPath) {
        return __awaiter(this, void 0, Promise, function () {
            var files, normalizedFolderPath, dataFolderPath, allFiles, _i, allFiles_1, file;
            return __generator(this, function (_a) {
                files = [];
                // Перевіряємо, чи не порожній шлях
                if (!folderPath) {
                    return [2 /*return*/, files];
                }
                normalizedFolderPath = folderPath;
                if (!normalizedFolderPath.endsWith('/')) {
                    normalizedFolderPath += '/';
                }
                dataFolderPath = normalizedFolderPath;
                console.log("Looking for markdown files in: \"" + dataFolderPath + "\"");
                allFiles = vault.getFiles();
                // Filter for markdown files in the data subfolder
                for (_i = 0, allFiles_1 = allFiles; _i < allFiles_1.length; _i++) {
                    file = allFiles_1[_i];
                    if (file.extension === "md" && file.path.startsWith(dataFolderPath)) {
                        console.log("Adding file: " + file.path);
                        files.push(file);
                    }
                }
                return [2 /*return*/, files];
            });
        });
    };
    /**
     * Simple search implementation to find relevant documents for a query
     * Later this could be replaced with a more sophisticated vector search
     */
    RagService.prototype.findRelevantDocuments = function (query, limit) {
        if (limit === void 0) { limit = 5; }
        if (!this.documents.length) {
            return [];
        }
        // Very basic relevance scoring - count term occurrences
        // This is a placeholder for a proper vector search implementation
        var scoredDocs = this.documents.map(function (doc) {
            var lowerContent = doc.content.toLowerCase();
            var lowerQuery = query.toLowerCase();
            // Split query into terms and count occurrences
            var terms = lowerQuery.split(/\s+/);
            var score = 0;
            for (var _i = 0, terms_1 = terms; _i < terms_1.length; _i++) {
                var term = terms_1[_i];
                if (term.length > 2) { // Ignore very short terms
                    var regex = new RegExp(term, 'gi');
                    var matches = lowerContent.match(regex);
                    if (matches) {
                        score += matches.length;
                    }
                }
            }
            return { doc: doc, score: score };
        });
        // Sort by score descending and take top 'limit' results
        return scoredDocs
            .sort(function (a, b) { return b.score - a.score; })
            .slice(0, limit)
            .map(function (item) { return item.doc; });
    };
    /**
     * Prepare context from relevant documents
     */
    RagService.prototype.prepareContext = function (query) {
        if (!this.plugin.settings.ragEnabled || this.documents.length === 0) {
            return "";
        }
        var limit = this.plugin.settings.contextWindow;
        var relevantDocs = this.findRelevantDocuments(query, limit);
        if (relevantDocs.length === 0) {
            return "";
        }
        // Format the context
        var context = "### Context:\n\n";
        relevantDocs.forEach(function (doc, index) {
            var _a;
            context += "Document " + (index + 1) + " (" + ((_a = doc.metadata) === null || _a === void 0 ? void 0 : _a.filename) + "):\n";
            // Truncate documents if they're too long to avoid token limits
            var maxChars = 1500;
            var content = doc.content.length > maxChars
                ? doc.content.substring(0, maxChars) + "..."
                : doc.content;
            context += content + "\n\n";
        });
        context += "### End of context\n\n";
        return context;
    };
    return RagService;
}());
exports.RagService = RagService;
