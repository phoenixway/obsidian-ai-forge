import { __awaiter } from "tslib";
// src/ragService.ts
import { normalizePath, TFolder } from "obsidian"; // Додано DataAdapter, MetadataCache
import { DEFAULT_SETTINGS } from "./settings";
export class RagService {
    constructor(plugin) {
        this.chunkEmbeddings = [];
        this.isIndexing = false;
        this.embeddingModelName = "nomic-embed-text";
        this.plugin = plugin;
        this.adapter = plugin.app.vault.adapter;
        this.vault = plugin.app.vault;
        this.metadataCache = plugin.app.metadataCache;
        this.embeddingModelName = this.plugin.settings.ragEmbeddingModel || DEFAULT_SETTINGS.ragEmbeddingModel;
    }
    // src/ragService.ts -> splitIntoChunks (Версія 3 - Розділення за Заголовками)
    splitIntoChunks(text, chunkSize) {
        if (!text)
            return [];
        this.plugin.logger.debug(`[RagService Chunking v3] Input text length: ${text.length}`);
        const lines = text.split('\n');
        const chunks = [];
        let currentChunkLines = []; // Збираємо рядки поточного чанка
        const minChunkLength = 15; // Мінімальна довжина (символів)
        for (const line of lines) {
            const trimmedLine = line.trim();
            // Перевіряємо, чи це заголовок Markdown (починається з '# ')
            const isHeading = trimmedLine.startsWith('# ');
            // Якщо це заголовок АБО додавання цього рядка перевищить ліміт
            // АБО поточний чанк вже існує і ми зустріли заголовок -> завершуємо поточний чанк
            if (currentChunkLines.length > 0 && (isHeading || (currentChunkLines.join('\n').length + trimmedLine.length + 1) > chunkSize)) {
                const chunkText = currentChunkLines.join('\n').trim();
                if (chunkText.length >= minChunkLength) {
                    chunks.push(chunkText);
                    // this.plugin.logger.debug(`[RagService Chunking v3] Added chunk (length ${chunkText.length}): "${chunkText.substring(0, 70)}..."`);
                }
                else {
                    this.plugin.logger.debug(`[RagService Chunking v3] Skipping short chunk (length ${chunkText.length}): "${chunkText.substring(0, 70)}..."`);
                }
                currentChunkLines = []; // Починаємо збирати новий чанк
            }
            // Додаємо непустий рядок до поточного чанка, якщо він не призведе до негайного перевищення ліміту
            // (Це обробляє випадок, коли сам рядок довший за chunkSize)
            if (trimmedLine.length > 0) {
                if (trimmedLine.length <= chunkSize) {
                    currentChunkLines.push(trimmedLine);
                }
                else {
                    // Рядок сам по собі занадто великий, розбиваємо його
                    this.plugin.logger.debug(`[RagService Chunking v3] Line too long (${trimmedLine.length}), splitting...`);
                    for (let i = 0; i < trimmedLine.length; i += chunkSize) {
                        const subChunk = trimmedLine.substring(i, i + chunkSize);
                        if (subChunk.length >= minChunkLength) {
                            chunks.push(subChunk); // Додаємо розбитий під-чанк одразу
                            //  this.plugin.logger.debug(`[RagService Chunking v3] Added split sub-chunk (length ${subChunk.length}): "${subChunk.substring(0, 70)}..."`);
                        }
                    }
                    // Поточний чанк залишається порожнім, бо ми обробили цей довгий рядок
                    currentChunkLines = [];
                }
            }
        }
        // Додаємо останній зібраний чанк, якщо він не порожній і достатньо довгий
        if (currentChunkLines.length > 0) {
            const chunkText = currentChunkLines.join('\n').trim();
            if (chunkText.length >= minChunkLength) {
                chunks.push(chunkText);
                // this.plugin.logger.debug(`[RagService Chunking v3] Added final chunk (length ${chunkText.length}): "${chunkText.substring(0, 70)}..."`);
            }
            else {
                this.plugin.logger.debug(`[RagService Chunking v3] Skipping final short chunk (length ${chunkText.length}): "${chunkText.substring(0, 70)}..."`);
            }
        }
        this.plugin.logger.debug(`[RagService Chunking v3] Produced ${chunks.length} chunks after filtering (>=${minChunkLength} chars).`);
        // Log перших декількох чанків для перевірки
        // chunks.slice(0, 5).forEach((c, i) => this.plugin.logger.debug(`Chunk ${i+1}: "${c.substring(0,100)}..."`));
        return chunks;
    }
    /**
     * ОНОВЛЕНО: Індексує markdown файли, розпізнаючи тег 'personal-focus'.
     */
    indexDocuments() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!this.plugin.settings.ragEnabled || !this.plugin.settings.ragEnableSemanticSearch) {
                this.plugin.logger.debug("[RagService] RAG semantic indexing skipped (disabled in settings).");
                this.chunkEmbeddings = [];
                return;
            }
            if (this.isIndexing) {
                this.plugin.logger.warn("[RagService] Indexing already in progress.");
                return;
            }
            this.isIndexing = true;
            this.plugin.logger.info("[RagService] Starting semantic indexing..."); // Змінено на info для важливості
            const startTime = Date.now();
            this.embeddingModelName = this.plugin.settings.ragEmbeddingModel || DEFAULT_SETTINGS.ragEmbeddingModel;
            const chunkSize = this.plugin.settings.ragChunkSize || DEFAULT_SETTINGS.ragChunkSize;
            const personalFocusTag = "personal-focus"; // Назва YAML тегу
            this.plugin.logger.debug(`[RagService] Using embedding model: ${this.embeddingModelName}, Chunk size: ${chunkSize}, Personal Focus Tag: '${personalFocusTag}'`);
            const newEmbeddings = [];
            try {
                const folderPath = this.plugin.settings.ragFolderPath;
                const files = yield this.getMarkdownFiles(this.vault, folderPath);
                this.plugin.logger.debug(`[RagService] Found ${files.length} markdown files in "${folderPath}".`);
                let processedFiles = 0;
                let personalFocusFiles = 0;
                for (const file of files) {
                    // this.plugin.logger.debug(`[RagService] Processing file: ${file.path}`); // Можна закоментувати для менш детального логування
                    try {
                        const content = yield this.vault.read(file);
                        const fileCache = this.metadataCache.getFileCache(file);
                        const frontmatter = (fileCache === null || fileCache === void 0 ? void 0 : fileCache.frontmatter) || {};
                        // --- Розпізнавання тегу 'personal-focus' ---
                        const isPersonal = frontmatter[personalFocusTag] === true;
                        if (isPersonal) {
                            personalFocusFiles++;
                            this.plugin.logger.debug(`[RagService] File ${file.path} marked as personal focus.`);
                        }
                        // ------------------------------------------
                        let bodyContent = content;
                        if (fileCache === null || fileCache === void 0 ? void 0 : fileCache.frontmatterPosition) {
                            bodyContent = content.substring(fileCache.frontmatterPosition.end.offset).trim();
                        }
                        const chunks = this.splitIntoChunks(bodyContent, chunkSize);
                        if (!chunks || chunks.length === 0) {
                            // this.plugin.logger.debug(`[RagService] No valid chunks found in ${file.path}, skipping.`);
                            continue;
                        }
                        // this.plugin.logger.debug(`[RagService] Generating ${chunks.length} embeddings for ${file.path} using ${this.embeddingModelName}...`);
                        const vectors = yield this.plugin.ollamaService.generateEmbeddings(chunks, this.embeddingModelName);
                        if (vectors && vectors.length === chunks.length) {
                            // --- ОНОВЛЕНО: Додаємо isPersonalFocus в метадані ---
                            const metadata = Object.assign(Object.assign({}, frontmatter), { path: file.path, filename: file.name, created: (_a = file.stat) === null || _a === void 0 ? void 0 : _a.ctime, modified: (_b = file.stat) === null || _b === void 0 ? void 0 : _b.mtime, isPersonalFocus: isPersonal // <-- Зберігаємо прапорець
                             });
                            // ----------------------------------------------------
                            for (let i = 0; i < chunks.length; i++) {
                                newEmbeddings.push({
                                    text: chunks[i],
                                    vector: vectors[i],
                                    metadata: metadata // Всі чанки файлу мають однакові метадані
                                });
                            }
                            // this.plugin.logger.debug(`[RagService] Successfully embedded ${vectors.length} chunks from ${file.path}`);
                            processedFiles++;
                        }
                        else {
                            this.plugin.logger.warn(`[RagService] Mismatch or error generating embeddings for ${file.path}. Expected ${chunks.length}, got ${vectors === null || vectors === void 0 ? void 0 : vectors.length}`);
                        }
                    }
                    catch (error) {
                        this.plugin.logger.error(`[RagService] Error processing file ${file.path}:`, error);
                    }
                } // end for loop
                this.chunkEmbeddings = newEmbeddings;
                const duration = (Date.now() - startTime) / 1000;
                this.plugin.logger.info(`[RagService] Semantic indexing complete in ${duration.toFixed(2)}s. Indexed ${this.chunkEmbeddings.length} chunks from ${processedFiles} files (${personalFocusFiles} personal focus files).`);
            }
            catch (error) {
                this.plugin.logger.error("[RagService] Error during indexing process:", error);
            }
            finally {
                this.isIndexing = false;
            }
        });
    }
    getMarkdownFiles(vault, folderPath) {
        return __awaiter(this, void 0, void 0, function* () {
            // ... (без змін) ...
            const files = [];
            if (!folderPath) {
                this.plugin.logger.warn("[RagService] RAG folder path is not set.");
                return files;
            }
            const folder = vault.getAbstractFileByPath(normalizePath(folderPath));
            if (!(folder instanceof TFolder)) {
                this.plugin.logger.warn(`[RagService] RAG folder path "${folderPath}" not found or is not a folder.`);
                return files;
            }
            const allFiles = vault.getMarkdownFiles(); // Оптимізація: отримуємо лише markdown
            for (const file of allFiles) {
                if (file.path.startsWith(folder.path + '/')) { // Перевіряємо, чи файл у піддереві папки
                    files.push(file);
                }
            }
            return files;
        });
    }
    calculateCosineSimilarity(vecA, vecB) {
        // ... (без змін) ...
        if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
            // console.warn("[RagService] Invalid vectors for cosine similarity.", vecA?.length, vecB?.length); // Debug log
            return 0;
        }
        let dotProduct = 0.0;
        let normA = 0.0;
        let normB = 0.0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        // Перевірка ділення на нуль (якщо один з векторів нульовий)
        if (normA === 0 || normB === 0)
            return 0;
        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        if (magnitude === 0)
            return 0;
        return dotProduct / magnitude;
    }
    /**
     * Знаходить релевантні ЧАНКИ документів за допомогою семантичної подібності.
     * Повертає чанки з метаданими, включаючи прапорець isPersonalFocus.
     */
    findRelevantDocuments(query, limit) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // ... (логіка пошуку та сортування без змін, оскільки isPersonalFocus вже в метаданих) ...
            if (!this.plugin.settings.ragEnableSemanticSearch) {
                this.plugin.logger.debug("[RagService] Semantic search disabled, skipping retrieval.");
                return []; // Повертаємо порожньо, якщо семантичний пошук вимкнено
            }
            if (!this.chunkEmbeddings || this.chunkEmbeddings.length === 0 || !query) {
                if (((_a = this.chunkEmbeddings) === null || _a === void 0 ? void 0 : _a.length) === 0)
                    this.plugin.logger.warn("[RagService] No chunk embeddings available for search. Index might be empty or disabled.");
                return [];
            }
            this.plugin.logger.debug(`[RagService] Performing semantic search for query: "${query}"`);
            const startTime = Date.now();
            try {
                // --- 1. Отримуємо Embedding для Запиту ---
                const queryEmbeddings = yield this.plugin.ollamaService.generateEmbeddings([query], this.embeddingModelName);
                if (!queryEmbeddings || queryEmbeddings.length === 0 || !queryEmbeddings[0]) {
                    this.plugin.logger.error("[RagService] Failed to generate embedding for the query.");
                    return []; // Не можемо шукати без вектора запиту
                }
                const queryVector = queryEmbeddings[0];
                // --- 2. Обчислюємо Подібність з Усіма Чанками ---
                const scoredChunks = this.chunkEmbeddings.map(chunk => {
                    const similarity = this.calculateCosineSimilarity(queryVector, chunk.vector);
                    return Object.assign(Object.assign({}, chunk), { score: similarity }); // Повертаємо чанк з оцінкою
                });
                // --- 3. Фільтруємо за Порогом Подібності ---
                const similarityThreshold = this.plugin.settings.ragSimilarityThreshold || DEFAULT_SETTINGS.ragSimilarityThreshold;
                const relevantChunks = scoredChunks.filter(chunk => chunk.score >= similarityThreshold);
                // --- 4. Сортуємо за Оцінкою (від більшої до меншої) ---
                relevantChunks.sort((a, b) => b.score - a.score);
                const duration = Date.now() - startTime;
                this.plugin.logger.debug(`[RagService] Semantic search completed in ${duration}ms. Found ${relevantChunks.length} chunks above threshold ${similarityThreshold}.`);
                // --- 5. Повертаємо Топ K результатів ---
                return relevantChunks.slice(0, limit);
            }
            catch (error) {
                this.plugin.logger.error("[RagService] Error during semantic search:", error);
                return [];
            }
        });
    }
    /**
     * ОНОВЛЕНО: Готує контекст для LLM, розділяючи "особистий фокус" та "загальний" контекст.
     * @param query Запит користувача для пошуку релевантних чанків.
     * @returns Рядок з форматованим контекстом або порожній рядок.
     */
    prepareContext(query) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.plugin.settings.ragEnabled || !this.plugin.settings.ragEnableSemanticSearch) {
                this.plugin.logger.debug("[RagService] Context preparation skipped (RAG or semantic search disabled).");
                return "";
            }
            const topK = this.plugin.settings.ragTopK || DEFAULT_SETTINGS.ragTopK;
            // Спочатку знаходимо ВСІ релевантні чанки
            const relevantChunks = yield this.findRelevantDocuments(query, topK);
            if (relevantChunks.length === 0) {
                this.plugin.logger.debug("[RagService] No relevant documents found for context.");
                return "";
            }
            this.plugin.logger.debug(`[RagService] Preparing context from ${relevantChunks.length} top chunks.`);
            // Розділяємо чанки на дві групи
            const personalFocusChunks = [];
            const generalContextChunks = [];
            relevantChunks.forEach(chunk => {
                if (chunk.metadata.isPersonalFocus) {
                    personalFocusChunks.push(chunk);
                }
                else {
                    generalContextChunks.push(chunk);
                }
            });
            let finalContext = "";
            // Форматуємо секцію "Personal Focus"
            if (personalFocusChunks.length > 0) {
                finalContext += "### Personal Focus Context (User's Life State & Goals):\n";
                finalContext += "IMPORTANT: This section contains key information about the user's current situation, priorities, and desired actions. Use it for strategic planning, progress tracking, and aligning suggestions with their core objectives.\n\n";
                personalFocusChunks.forEach((chunk, index) => {
                    var _a, _b, _c;
                    // Змінено заголовок для ясності
                    let header = `--- Chunk ${index + 1} from Personal Focus Note: ${((_a = chunk.metadata) === null || _a === void 0 ? void 0 : _a.filename) || chunk.metadata.path}`;
                    header += ` (Score: ${(_c = (_b = chunk.score) === null || _b === void 0 ? void 0 : _b.toFixed(3)) !== null && _c !== void 0 ? _c : 'N/A'}) ---\n`;
                    finalContext += header;
                    finalContext += chunk.text.trim() + "\n\n";
                });
                this.plugin.logger.debug(`[RagService] Added ${personalFocusChunks.length} personal focus chunks to context.`);
            }
            else {
                this.plugin.logger.debug(`[RagService] No personal focus chunks found among relevant results.`);
            }
            // Форматуємо секцію "General Context"
            if (generalContextChunks.length > 0) {
                // Додаємо роздільник, якщо обидві секції існують
                if (finalContext) {
                    finalContext += "---\n\n";
                }
                finalContext += "### General Context from User Notes:\n";
                finalContext += "This section contains potentially relevant background information from the user's general notes.\n\n";
                generalContextChunks.forEach((chunk, index) => {
                    var _a, _b, _c, _d;
                    // Змінено заголовок для ясності
                    let header = `--- Chunk ${index + 1} from: ${((_a = chunk.metadata) === null || _a === void 0 ? void 0 : _a.filename) || chunk.metadata.path}`;
                    // Залишаємо тег [Type: Personal Log], якщо він був у YAML, навіть якщо це не 'personal-focus' файл
                    if (((_b = chunk.metadata) === null || _b === void 0 ? void 0 : _b['personal-logs']) === true)
                        header += ` [Type: Personal Log]`;
                    header += ` (Score: ${(_d = (_c = chunk.score) === null || _c === void 0 ? void 0 : _c.toFixed(3)) !== null && _d !== void 0 ? _d : 'N/A'}) ---\n`;
                    finalContext += header;
                    finalContext += chunk.text.trim() + "\n\n";
                });
                this.plugin.logger.debug(`[RagService] Added ${generalContextChunks.length} general context chunks to context.`);
            }
            else {
                this.plugin.logger.debug(`[RagService] No general context chunks found among relevant results.`);
            }
            if (finalContext) {
                finalContext += "### End of Context\n"; // Завершальний маркер
            }
            return finalContext.trim();
        });
    }
} // Кінець класу RagService
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFnU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJhZ1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLG9CQUFvQjtBQUNwQixPQUFPLEVBQWdCLGFBQWEsRUFBZSxPQUFPLEVBQWlCLE1BQU0sVUFBVSxDQUFDLENBQUMsb0NBQW9DO0FBRWpJLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQW9COUMsTUFBTSxPQUFPLFVBQVU7SUFTckIsWUFBWSxNQUFvQjtRQUp4QixvQkFBZSxHQUFrQixFQUFFLENBQUM7UUFDcEMsZUFBVSxHQUFZLEtBQUssQ0FBQztRQUM1Qix1QkFBa0IsR0FBVyxrQkFBa0IsQ0FBQztRQUd0RCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQztRQUN4QyxJQUFJLENBQUMsS0FBSyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO1FBQzlCLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUM7UUFDOUMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGlCQUFpQixJQUFJLGdCQUFnQixDQUFDLGlCQUFpQixDQUFDO0lBQ3pHLENBQUM7SUFFSCw4RUFBOEU7SUFFdEUsZUFBZSxDQUFDLElBQVksRUFBRSxTQUFpQjtRQUNyRCxJQUFJLENBQUMsSUFBSTtZQUFFLE9BQU8sRUFBRSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFdkYsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQixNQUFN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QUNwSCxDQUFDO2lCQUFNLENBQUM7Z0JBQ0gsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHNFQUFzRSxDQUFDLENBQUM7WUFDdEcsQ0FBQztZQUdELElBQUcsWUFBWSxFQUFFLENBQUM7Z0JBQ2QsWUFBWSxJQUFJLHNCQUFzQixDQUFDLENBQUMsc0JBQXNCO1lBQ2xFLENBQUM7WUFFRCxPQUFPLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUM3QixDQUFDO0tBQUE7Q0FFRixDQUFDLDBCQUEwQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIHNyYy9yYWdTZXJ2aWNlLnRzXG5pbXBvcnQgeyBURmlsZSwgVmF1bHQsIG5vcm1hbGl6ZVBhdGgsIERhdGFBZGFwdGVyLCBURm9sZGVyLCBNZXRhZGF0YUNhY2hlIH0gZnJvbSBcIm9ic2lkaWFuXCI7IC8vINCU0L7QtNCw0L3QviBEYXRhQWRhcHRlciwgTWV0YWRhdGFDYWNoZVxuaW1wb3J0IE9sbGFtYVBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5pbXBvcnQgeyBERUZBVUxUX1NFVFRJTkdTIH0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcblxuLy8gLS0tINCe0J3QntCS0JvQldCd0J46INCG0L3RgtC10YDRhNC10LnRgSDQvNC10YLQsNC00LDQvdC40YUg0LTQvtC60YPQvNC10L3RgtCwIC0tLVxuaW50ZXJmYWNlIERvY3VtZW50TWV0YWRhdGEge1xuICAgIHBhdGg6IHN0cmluZztcbiAgICBmaWxlbmFtZT86IHN0cmluZztcbiAgICBjcmVhdGVkPzogbnVtYmVyO1xuICAgIG1vZGlmaWVkPzogbnVtYmVyO1xuICAgIGlzUGVyc29uYWxGb2N1cz86IGJvb2xlYW47IC8vIDwtLSDQndCe0JLQmNCZINCf0KDQkNCf0J7QoNCV0KbQrFxuICAgIFtrZXk6IHN0cmluZ106IGFueTsgLy8gWUFNTCBmcm9udG1hdHRlclxufVxuXG4vLyAtLS0g0J7QndCe0JLQm9CV0J3Qnjog0IbQvdGC0LXRgNGE0LXQudGBINC00LvRjyDRh9Cw0L3QutCwINC3INCy0LXQutGC0L7RgNC+0LwgLS0tXG5pbnRlcmZhY2UgQ2h1bmtWZWN0b3Ige1xuICB0ZXh0OiBzdHJpbmc7XG4gIHZlY3RvcjogbnVtYmVyW107XG4gIG1ldGFkYXRhOiBEb2N1bWVudE1ldGFkYXRhOyAvLyDQnNC10YLQsNC00LDQvdGWINGC0LXQv9C10YAg0LLQutC70Y7Rh9Cw0Y7RgtGMIGlzUGVyc29uYWxGb2N1c1xuICBzY29yZT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFJhZ1NlcnZpY2Uge1xuICBwcml2YXRlIHBsdWdpbjogT2xsYW1hUGx1Z2luO1xuICBwcml2YXRlIGFkYXB0ZXI6IERhdGFBZGFwdGVyO1xuICBwcml2YXRlIHZhdWx0OiBWYXVsdDtcbiAgcHJpdmF0ZSBtZXRhZGF0YUNhY2hlOiBNZXRhZGF0YUNhY2hlO1xuICBwcml2YXRlIGNodW5rRW1iZWRkaW5nczogQ2h1bmtWZWN0b3JbXSA9IFtdO1xuICBwcml2YXRlIGlzSW5kZXhpbmc6IGJvb2xlYW4gPSBmYWxzZTtcbiAgcHJpdmF0ZSBlbWJlZGRpbmdNb2RlbE5hbWU6IHN0cmluZyA9IFwibm9taWMtZW1iZWQtdGV4dFwiO1xuXG4gIGNvbnN0cnVjdG9yKHBsdWdpbjogT2xsYW1hUGx1Z2luKSB7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gICAgdGhpcy5hZGFwdGVyID0gcGx1Z2luLmFwcC52YXVsdC5hZGFwdGVyO1xuICAgIHRoaXMudmF1bHQgPSBwbHVnaW4uYXBwLnZhdWx0O1xuICAgIHRoaXMubWV0YWRhdGFDYWNoZSA9IHBsdWdpbi5hcHAubWV0YWRhdGFDYWNoZTtcbiAgICB0aGlzLmVtYmVkZGluZ01vZGVsTmFtZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0VtYmVkZGluZ01vZGVsIHx8IERFRkFVTFRfU0VUVElOR1MucmFnRW1iZWRkaW5nTW9kZWw7XG4gIH1cblxuLy8gc3JjL3JhZ1NlcnZpY2UudHMgLT4gc3BsaXRJbnRvQ2h1bmtzICjQktC10YDRgdGW0Y8gMyAtINCg0L7Qt9C00ZbQu9C10L3QvdGPINC30LAg0JfQsNCz0L7Qu9C+0LLQutCw0LzQuClcblxucHJpdmF0ZSBzcGxpdEludG9DaHVua3ModGV4dDogc3RyaW5nLCBjaHVua1NpemU6IG51bWJlcik6IHN0cmluZ1tdIHtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gW107XG4gIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JhZ1NlcnZpY2UgQ2h1bmtpbmcgdjNdIElucHV0IHRleHQgbGVuZ3RoOiAke3RleHQubGVuZ3RofWApO1xuXG4gIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG4gIGNvbnN0IGNodW5rczogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGN1cnJlbnRDaHVua0xpbmVzOiBzdHJpbmdbXSA9IFtdOyAvLyDQl9Cx0LjRgNCw0ZTQvNC+INGA0Y/QtNC60Lgg0L/QvtGC0L7Rh9C90L7Qs9C+INGH0LDQvdC60LBcbiAgY29uc3QgbWluQ2h1bmtMZW5ndGggPSAxNTsgLy8g0JzRltC90ZbQvNCw0LvRjNC90LAg0LTQvtCy0LbQuNC90LAgKNGB0LjQvNCy0L7Qu9GW0LIpXG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgY29uc3QgdHJpbW1lZExpbmUgPSBsaW5lLnRyaW0oKTtcblxuICAgIC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0YbQtSDQt9Cw0LPQvtC70L7QstC+0LogTWFya2Rvd24gKNC/0L7Rh9C40L3QsNGU0YLRjNGB0Y8g0LcgJyMgJylcbiAgICBjb25zdCBpc0hlYWRpbmcgPSB0cmltbWVkTGluZS5zdGFydHNXaXRoKCcjICcpO1xuXG4gICAgLy8g0K/QutGJ0L4g0YbQtSDQt9Cw0LPQvtC70L7QstC+0Log0JDQkdCeINC00L7QtNCw0LLQsNC90L3RjyDRhtGM0L7Qs9C+INGA0Y/QtNC60LAg0L/QtdGA0LXQstC40YnQuNGC0Ywg0LvRltC80ZbRglxuICAgIC8vINCQ0JHQniDQv9C+0YLQvtGH0L3QuNC5INGH0LDQvdC6INCy0LbQtSDRltGB0L3Rg9GUINGWINC80Lgg0LfRg9GB0YLRgNGW0LvQuCDQt9Cw0LPQvtC70L7QstC+0LogLT4g0LfQsNCy0LXRgNGI0YPRlNC80L4g0L/QvtGC0L7Rh9C90LjQuSDRh9Cw0L3QulxuICAgIGlmIChjdXJyZW50Q2h1bmtMaW5lcy5sZW5ndGggPiAwICYmIChpc0hlYWRpbmcgfHwgKGN1cnJlbnRDaHVua0xpbmVzLmpvaW4oJ1xcbicpLmxlbmd0aCArIHRyaW1tZWRMaW5lLmxlbmd0aCArIDEpID4gY2h1bmtTaXplKSkge1xuICAgICAgY29uc3QgY2h1bmtUZXh0ID0gY3VycmVudENodW5rTGluZXMuam9pbignXFxuJykudHJpbSgpO1xuICAgICAgaWYgKGNodW5rVGV4dC5sZW5ndGggPj0gbWluQ2h1bmtMZW5ndGgpIHtcbiAgICAgICAgICAgY2h1bmtzLnB1c2goY2h1bmtUZXh0KTtcbiAgICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSYWdTZXJ2aWNlIENodW5raW5nIHYzXSBBZGRlZCBjaHVuayAobGVuZ3RoICR7Y2h1bmtUZXh0Lmxlbmd0aH0pOiBcIiR7Y2h1bmtUZXh0LnN1YnN0cmluZygwLCA3MCl9Li4uXCJgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JhZ1NlcnZpY2UgQ2h1bmtpbmcgdjNdIFNraXBwaW5nIHNob3J0IGNodW5rIChsZW5ndGggJHtjaHVua1RleHQubGVuZ3RofSk6IFwiJHtjaHVua1RleHQuc3Vic3RyaW5nKDAsIDcwKX0uLi5cImApO1xuICAgICAgfVxuICAgICAgY3VycmVudENodW5rTGluZXMgPSBbXTsgLy8g0J/QvtGH0LjQvdCw0ZTQvNC+INC30LHQuNGA0LDRgtC4INC90L7QstC40Lkg0YfQsNC90LpcbiAgICB9XG5cbiAgICAvLyDQlNC+0LTQsNGU0LzQviDQvdC10L/Rg9GB0YLQuNC5INGA0Y/QtNC+0Log0LTQviDQv9C+0YLQvtGH0L3QvtCz0L4g0YfQsNC90LrQsCwg0Y/QutGJ0L4g0LLRltC9INC90LUg0L/RgNC40LfQstC10LTQtSDQtNC+INC90LXQs9Cw0LnQvdC+0LPQviDQv9C10YDQtdCy0LjRidC10L3QvdGPINC70ZbQvNGW0YLRg1xuICAgIC8vICjQptC1INC+0LHRgNC+0LHQu9GP0ZQg0LLQuNC/0LDQtNC+0LosINC60L7Qu9C4INGB0LDQvCDRgNGP0LTQvtC6INC00L7QstGI0LjQuSDQt9CwIGNodW5rU2l6ZSlcbiAgICBpZiAodHJpbW1lZExpbmUubGVuZ3RoID4gMCkge1xuICAgICAgICBpZiAodHJpbW1lZExpbmUubGVuZ3RoIDw9IGNodW5rU2l6ZSkge1xuICAgICAgICAgIGN1cnJlbnRDaHVua0xpbmVzLnB1c2godHJpbW1lZExpbmUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAvLyDQoNGP0LTQvtC6INGB0LDQvCDQv9C+INGB0L7QsdGWINC30LDQvdCw0LTRgtC+INCy0LXQu9C40LrQuNC5LCDRgNC+0LfQsdC40LLQsNGU0LzQviDQudC+0LPQvlxuICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSYWdTZXJ2aWNlIENodW5raW5nIHYzXSBMaW5lIHRvbyBsb25nICgke3RyaW1tZWRMaW5lLmxlbmd0aH0pLCBzcGxpdHRpbmcuLi5gKTtcbiAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cmltbWVkTGluZS5sZW5ndGg7IGkgKz0gY2h1bmtTaXplKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHN1YkNodW5rID0gdHJpbW1lZExpbmUuc3Vic3RyaW5nKGksIGkgKyBjaHVua1NpemUpO1xuICAgICAgICAgICAgICAgaWYgKHN1YkNodW5rLmxlbmd0aCA+PSBtaW5DaHVua0xlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgIGNodW5rcy5wdXNoKHN1YkNodW5rKTsgLy8g0JTQvtC00LDRlNC80L4g0YDQvtC30LHQuNGC0LjQuSDQv9GW0LQt0YfQsNC90Log0L7QtNGA0LDQt9GDXG4gICAgICAgICAgICAgICAgICAvLyAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmFnU2VydmljZSBDaHVua2luZyB2M10gQWRkZWQgc3BsaXQgc3ViLWNodW5rIChsZW5ndGggJHtzdWJDaHVuay5sZW5ndGh9KTogXCIke3N1YkNodW5rLnN1YnN0cmluZygwLCA3MCl9Li4uXCJgKTtcbiAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgfVxuICAgICAgICAgICAvLyDQn9C+0YLQvtGH0L3QuNC5INGH0LDQvdC6INC30LDQu9C40YjQsNGU0YLRjNGB0Y8g0L/QvtGA0L7QttC90ZbQvCwg0LHQviDQvNC4INC+0LHRgNC+0LHQuNC70Lgg0YbQtdC5INC00L7QstCz0LjQuSDRgNGP0LTQvtC6XG4gICAgICAgICAgIGN1cnJlbnRDaHVua0xpbmVzID0gW107XG4gICAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyDQlNC+0LTQsNGU0LzQviDQvtGB0YLQsNC90L3RltC5INC30ZbQsdGA0LDQvdC40Lkg0YfQsNC90LosINGP0LrRidC+INCy0ZbQvSDQvdC1INC/0L7RgNC+0LbQvdGW0Lkg0ZYg0LTQvtGB0YLQsNGC0L3RjNC+INC00L7QstCz0LjQuVxuICBpZiAoY3VycmVudENodW5rTGluZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNodW5rVGV4dCA9IGN1cnJlbnRDaHVua0xpbmVzLmpvaW4oJ1xcbicpLnRyaW0oKTtcbiAgICBpZiAoY2h1bmtUZXh0Lmxlbmd0aCA+PSBtaW5DaHVua0xlbmd0aCkge1xuICAgICAgY2h1bmtzLnB1c2goY2h1bmtUZXh0KTtcbiAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JhZ1NlcnZpY2UgQ2h1bmtpbmcgdjNdIEFkZGVkIGZpbmFsIGNodW5rIChsZW5ndGggJHtjaHVua1RleHQubGVuZ3RofSk6IFwiJHtjaHVua1RleHQuc3Vic3RyaW5nKDAsIDcwKX0uLi5cImApO1xuICAgIH0gZWxzZSB7XG4gICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSYWdTZXJ2aWNlIENodW5raW5nIHYzXSBTa2lwcGluZyBmaW5hbCBzaG9ydCBjaHVuayAobGVuZ3RoICR7Y2h1bmtUZXh0Lmxlbmd0aH0pOiBcIiR7Y2h1bmtUZXh0LnN1YnN0cmluZygwLCA3MCl9Li4uXCJgKTtcbiAgICB9XG4gIH1cblxuICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSYWdTZXJ2aWNlIENodW5raW5nIHYzXSBQcm9kdWNlZCAke2NodW5rcy5sZW5ndGh9IGNodW5rcyBhZnRlciBmaWx0ZXJpbmcgKD49JHttaW5DaHVua0xlbmd0aH0gY2hhcnMpLmApO1xuICAvLyBMb2cg0L/QtdGA0YjQuNGFINC00LXQutGW0LvRjNC60L7RhSDRh9Cw0L3QutGW0LIg0LTQu9GPINC/0LXRgNC10LLRltGA0LrQuFxuICAvLyBjaHVua3Muc2xpY2UoMCwgNSkuZm9yRWFjaCgoYywgaSkgPT4gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBDaHVuayAke2krMX06IFwiJHtjLnN1YnN0cmluZygwLDEwMCl9Li4uXCJgKSk7XG5cbiAgcmV0dXJuIGNodW5rcztcbn1cbiAgLyoqXG4gICAqINCe0J3QntCS0JvQldCd0J46INCG0L3QtNC10LrRgdGD0ZQgbWFya2Rvd24g0YTQsNC50LvQuCwg0YDQvtC30L/RltC30L3QsNGO0YfQuCDRgtC10LMgJ3BlcnNvbmFsLWZvY3VzJy5cbiAgICovXG4gIGFzeW5jIGluZGV4RG9jdW1lbnRzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlZCB8fCAhdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlU2VtYW50aWNTZWFyY2gpIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltSYWdTZXJ2aWNlXSBSQUcgc2VtYW50aWMgaW5kZXhpbmcgc2tpcHBlZCAoZGlzYWJsZWQgaW4gc2V0dGluZ3MpLlwiKTtcbiAgICAgIHRoaXMuY2h1bmtFbWJlZGRpbmdzID0gW107XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaXNJbmRleGluZykge1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLndhcm4oXCJbUmFnU2VydmljZV0gSW5kZXhpbmcgYWxyZWFkeSBpbiBwcm9ncmVzcy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuaXNJbmRleGluZyA9IHRydWU7XG4gICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmluZm8oXCJbUmFnU2VydmljZV0gU3RhcnRpbmcgc2VtYW50aWMgaW5kZXhpbmcuLi5cIik7IC8vINCX0LzRltC90LXQvdC+INC90LAgaW5mbyDQtNC70Y8g0LLQsNC20LvQuNCy0L7RgdGC0ZZcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgdGhpcy5lbWJlZGRpbmdNb2RlbE5hbWUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdFbWJlZGRpbmdNb2RlbCB8fCBERUZBVUxUX1NFVFRJTkdTLnJhZ0VtYmVkZGluZ01vZGVsO1xuICAgIGNvbnN0IGNodW5rU2l6ZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0NodW5rU2l6ZSB8fCBERUZBVUxUX1NFVFRJTkdTLnJhZ0NodW5rU2l6ZTtcbiAgICBjb25zdCBwZXJzb25hbEZvY3VzVGFnID0gXCJwZXJzb25hbC1mb2N1c1wiOyAvLyDQndCw0LfQstCwIFlBTUwg0YLQtdCz0YNcblxuICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JhZ1NlcnZpY2VdIFVzaW5nIGVtYmVkZGluZyBtb2RlbDogJHt0aGlzLmVtYmVkZGluZ01vZGVsTmFtZX0sIENodW5rIHNpemU6ICR7Y2h1bmtTaXplfSwgUGVyc29uYWwgRm9jdXMgVGFnOiAnJHtwZXJzb25hbEZvY3VzVGFnfSdgKTtcblxuICAgIGNvbnN0IG5ld0VtYmVkZGluZ3M6IENodW5rVmVjdG9yW10gPSBbXTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZm9sZGVyUGF0aCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ0ZvbGRlclBhdGg7XG4gICAgICBjb25zdCBmaWxlcyA9IGF3YWl0IHRoaXMuZ2V0TWFya2Rvd25GaWxlcyh0aGlzLnZhdWx0LCBmb2xkZXJQYXRoKTtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JhZ1NlcnZpY2VdIEZvdW5kICR7ZmlsZXMubGVuZ3RofSBtYXJrZG93biBmaWxlcyBpbiBcIiR7Zm9sZGVyUGF0aH1cIi5gKTtcblxuICAgICAgbGV0IHByb2Nlc3NlZEZpbGVzID0gMDtcbiAgICAgIGxldCBwZXJzb25hbEZvY3VzRmlsZXMgPSAwO1xuXG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmFnU2VydmljZV0gUHJvY2Vzc2luZyBmaWxlOiAke2ZpbGUucGF0aH1gKTsgLy8g0JzQvtC20L3QsCDQt9Cw0LrQvtC80LXQvdGC0YPQstCw0YLQuCDQtNC70Y8g0LzQtdC90Ygg0LTQtdGC0LDQu9GM0L3QvtCz0L4g0LvQvtCz0YPQstCw0L3QvdGPXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgICBjb25zdCBmaWxlQ2FjaGUgPSB0aGlzLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpO1xuICAgICAgICAgIGNvbnN0IGZyb250bWF0dGVyID0gZmlsZUNhY2hlPy5mcm9udG1hdHRlciB8fCB7fTtcblxuICAgICAgICAgIC8vIC0tLSDQoNC+0LfQv9GW0LfQvdCw0LLQsNC90L3RjyDRgtC10LPRgyAncGVyc29uYWwtZm9jdXMnIC0tLVxuICAgICAgICAgIGNvbnN0IGlzUGVyc29uYWwgPSBmcm9udG1hdHRlcltwZXJzb25hbEZvY3VzVGFnXSA9PT0gdHJ1ZTtcbiAgICAgICAgICBpZiAoaXNQZXJzb25hbCkge1xuICAgICAgICAgICAgICBwZXJzb25hbEZvY3VzRmlsZXMrKztcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmFnU2VydmljZV0gRmlsZSAke2ZpbGUucGF0aH0gbWFya2VkIGFzIHBlcnNvbmFsIGZvY3VzLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgICAgICAgIGxldCBib2R5Q29udGVudCA9IGNvbnRlbnQ7XG4gICAgICAgICAgaWYgKGZpbGVDYWNoZT8uZnJvbnRtYXR0ZXJQb3NpdGlvbikge1xuICAgICAgICAgICAgYm9keUNvbnRlbnQgPSBjb250ZW50LnN1YnN0cmluZyhmaWxlQ2FjaGUuZnJvbnRtYXR0ZXJQb3NpdGlvbi5lbmQub2Zmc2V0KS50cmltKCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgY2h1bmtzID0gdGhpcy5zcGxpdEludG9DaHVua3MoYm9keUNvbnRlbnQsIGNodW5rU2l6ZSk7XG4gICAgICAgICAgaWYgKCFjaHVua3MgfHwgY2h1bmtzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgIC8vIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JhZ1NlcnZpY2VdIE5vIHZhbGlkIGNodW5rcyBmb3VuZCBpbiAke2ZpbGUucGF0aH0sIHNraXBwaW5nLmApO1xuICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgLy8gdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmFnU2VydmljZV0gR2VuZXJhdGluZyAke2NodW5rcy5sZW5ndGh9IGVtYmVkZGluZ3MgZm9yICR7ZmlsZS5wYXRofSB1c2luZyAke3RoaXMuZW1iZWRkaW5nTW9kZWxOYW1lfS4uLmApO1xuICAgICAgICAgIGNvbnN0IHZlY3RvcnMgPSBhd2FpdCB0aGlzLnBsdWdpbi5vbGxhbWFTZXJ2aWNlLmdlbmVyYXRlRW1iZWRkaW5ncyhjaHVua3MsIHRoaXMuZW1iZWRkaW5nTW9kZWxOYW1lKTtcblxuICAgICAgICAgIGlmICh2ZWN0b3JzICYmIHZlY3RvcnMubGVuZ3RoID09PSBjaHVua3MubGVuZ3RoKSB7XG4gICAgICAgICAgICAvLyAtLS0g0J7QndCe0JLQm9CV0J3Qnjog0JTQvtC00LDRlNC80L4gaXNQZXJzb25hbEZvY3VzINCyINC80LXRgtCw0LTQsNC90ZYgLS0tXG4gICAgICAgICAgICBjb25zdCBtZXRhZGF0YTogRG9jdW1lbnRNZXRhZGF0YSA9IHtcbiAgICAgICAgICAgICAgLi4uZnJvbnRtYXR0ZXIsIC8vINCa0L7Qv9GW0Y7RlNC80L4g0LLQtdGB0YwgZnJvbnRtYXR0ZXJcbiAgICAgICAgICAgICAgcGF0aDogZmlsZS5wYXRoLFxuICAgICAgICAgICAgICBmaWxlbmFtZTogZmlsZS5uYW1lLFxuICAgICAgICAgICAgICBjcmVhdGVkOiBmaWxlLnN0YXQ/LmN0aW1lLFxuICAgICAgICAgICAgICBtb2RpZmllZDogZmlsZS5zdGF0Py5tdGltZSxcbiAgICAgICAgICAgICAgaXNQZXJzb25hbEZvY3VzOiBpc1BlcnNvbmFsIC8vIDwtLSDQl9Cx0LXRgNGW0LPQsNGU0LzQviDQv9GA0LDQv9C+0YDQtdGG0YxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNodW5rcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICBuZXdFbWJlZGRpbmdzLnB1c2goe1xuICAgICAgICAgICAgICAgIHRleHQ6IGNodW5rc1tpXSxcbiAgICAgICAgICAgICAgICB2ZWN0b3I6IHZlY3RvcnNbaV0sXG4gICAgICAgICAgICAgICAgbWV0YWRhdGE6IG1ldGFkYXRhIC8vINCS0YHRliDRh9Cw0L3QutC4INGE0LDQudC70YMg0LzQsNGO0YLRjCDQvtC00L3QsNC60L7QstGWINC80LXRgtCw0LTQsNC90ZZcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSYWdTZXJ2aWNlXSBTdWNjZXNzZnVsbHkgZW1iZWRkZWQgJHt2ZWN0b3JzLmxlbmd0aH0gY2h1bmtzIGZyb20gJHtmaWxlLnBhdGh9YCk7XG4gICAgICAgICAgICBwcm9jZXNzZWRGaWxlcysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihgW1JhZ1NlcnZpY2VdIE1pc21hdGNoIG9yIGVycm9yIGdlbmVyYXRpbmcgZW1iZWRkaW5ncyBmb3IgJHtmaWxlLnBhdGh9LiBFeHBlY3RlZCAke2NodW5rcy5sZW5ndGh9LCBnb3QgJHt2ZWN0b3JzPy5sZW5ndGh9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihgW1JhZ1NlcnZpY2VdIEVycm9yIHByb2Nlc3NpbmcgZmlsZSAke2ZpbGUucGF0aH06YCwgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9IC8vIGVuZCBmb3IgbG9vcFxuXG4gICAgICB0aGlzLmNodW5rRW1iZWRkaW5ncyA9IG5ld0VtYmVkZGluZ3M7XG4gICAgICBjb25zdCBkdXJhdGlvbiA9IChEYXRlLm5vdygpIC0gc3RhcnRUaW1lKSAvIDEwMDA7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuaW5mbyhgW1JhZ1NlcnZpY2VdIFNlbWFudGljIGluZGV4aW5nIGNvbXBsZXRlIGluICR7ZHVyYXRpb24udG9GaXhlZCgyKX1zLiBJbmRleGVkICR7dGhpcy5jaHVua0VtYmVkZGluZ3MubGVuZ3RofSBjaHVua3MgZnJvbSAke3Byb2Nlc3NlZEZpbGVzfSBmaWxlcyAoJHtwZXJzb25hbEZvY3VzRmlsZXN9IHBlcnNvbmFsIGZvY3VzIGZpbGVzKS5gKTtcblxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZXJyb3IoXCJbUmFnU2VydmljZV0gRXJyb3IgZHVyaW5nIGluZGV4aW5nIHByb2Nlc3M6XCIsIGVycm9yKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5pc0luZGV4aW5nID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZXRNYXJrZG93bkZpbGVzKHZhdWx0OiBWYXVsdCwgZm9sZGVyUGF0aDogc3RyaW5nKTogUHJvbWlzZTxURmlsZVtdPiB7XG4gICAgICAvLyAuLi4gKNCx0LXQtyDQt9C80ZbQvSkgLi4uXG4gICAgICAgY29uc3QgZmlsZXM6IFRGaWxlW10gPSBbXTtcbiAgICAgIGlmICghZm9sZGVyUGF0aCkge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKFwiW1JhZ1NlcnZpY2VdIFJBRyBmb2xkZXIgcGF0aCBpcyBub3Qgc2V0LlwiKTtcbiAgICAgICAgICByZXR1cm4gZmlsZXM7XG4gICAgICB9XG4gICAgICBjb25zdCBmb2xkZXIgPSB2YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobm9ybWFsaXplUGF0aChmb2xkZXJQYXRoKSk7XG4gICAgICBpZiAoIShmb2xkZXIgaW5zdGFuY2VvZiBURm9sZGVyKSkge1xuICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci53YXJuKGBbUmFnU2VydmljZV0gUkFHIGZvbGRlciBwYXRoIFwiJHtmb2xkZXJQYXRofVwiIG5vdCBmb3VuZCBvciBpcyBub3QgYSBmb2xkZXIuYCk7XG4gICAgICAgICAgcmV0dXJuIGZpbGVzO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhbGxGaWxlcyA9IHZhdWx0LmdldE1hcmtkb3duRmlsZXMoKTsgLy8g0J7Qv9GC0LjQvNGW0LfQsNGG0ZbRjzog0L7RgtGA0LjQvNGD0ZTQvNC+INC70LjRiNC1IG1hcmtkb3duXG4gICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgYWxsRmlsZXMpIHtcbiAgICAgICAgICBpZiAoZmlsZS5wYXRoLnN0YXJ0c1dpdGgoZm9sZGVyLnBhdGggKyAnLycpKSB7IC8vINCf0LXRgNC10LLRltGA0Y/RlNC80L4sINGH0Lgg0YTQsNC50Lsg0YMg0L/RltC00LTQtdGA0LXQstGWINC/0LDQv9C60LhcbiAgICAgICAgICAgICAgZmlsZXMucHVzaChmaWxlKTtcbiAgICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gZmlsZXM7XG4gIH1cblxuICBwcml2YXRlIGNhbGN1bGF0ZUNvc2luZVNpbWlsYXJpdHkodmVjQTogbnVtYmVyW10sIHZlY0I6IG51bWJlcltdKTogbnVtYmVyIHtcbiAgICAvLyAuLi4gKNCx0LXQtyDQt9C80ZbQvSkgLi4uXG4gICAgIGlmICghdmVjQSB8fCAhdmVjQiB8fCB2ZWNBLmxlbmd0aCAhPT0gdmVjQi5sZW5ndGggfHwgdmVjQS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgLy8gY29uc29sZS53YXJuKFwiW1JhZ1NlcnZpY2VdIEludmFsaWQgdmVjdG9ycyBmb3IgY29zaW5lIHNpbWlsYXJpdHkuXCIsIHZlY0E/Lmxlbmd0aCwgdmVjQj8ubGVuZ3RoKTsgLy8gRGVidWcgbG9nXG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgICBsZXQgZG90UHJvZHVjdCA9IDAuMDtcbiAgICBsZXQgbm9ybUEgPSAwLjA7XG4gICAgbGV0IG5vcm1CID0gMC4wO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdmVjQS5sZW5ndGg7IGkrKykge1xuICAgICAgICBkb3RQcm9kdWN0ICs9IHZlY0FbaV0gKiB2ZWNCW2ldO1xuICAgICAgICBub3JtQSArPSB2ZWNBW2ldICogdmVjQVtpXTtcbiAgICAgICAgbm9ybUIgKz0gdmVjQltpXSAqIHZlY0JbaV07XG4gICAgfVxuICAgIC8vINCf0LXRgNC10LLRltGA0LrQsCDQtNGW0LvQtdC90L3RjyDQvdCwINC90YPQu9GMICjRj9C60YnQviDQvtC00LjQvSDQtyDQstC10LrRgtC+0YDRltCyINC90YPQu9GM0L7QstC40LkpXG4gICAgaWYgKG5vcm1BID09PSAwIHx8IG5vcm1CID09PSAwKSByZXR1cm4gMDtcblxuICAgIGNvbnN0IG1hZ25pdHVkZSA9IE1hdGguc3FydChub3JtQSkgKiBNYXRoLnNxcnQobm9ybUIpO1xuICAgIGlmIChtYWduaXR1ZGUgPT09IDApIHJldHVybiAwO1xuXG4gICAgcmV0dXJuIGRvdFByb2R1Y3QgLyBtYWduaXR1ZGU7XG4gIH1cblxuICAvKipcbiAgICog0JfQvdCw0YXQvtC00LjRgtGMINGA0LXQu9C10LLQsNC90YLQvdGWINCn0JDQndCa0Jgg0LTQvtC60YPQvNC10L3RgtGW0LIg0LfQsCDQtNC+0L/QvtC80L7Qs9C+0Y4g0YHQtdC80LDQvdGC0LjRh9C90L7RlyDQv9C+0LTRltCx0L3QvtGB0YLRli5cbiAgICog0J/QvtCy0LXRgNGC0LDRlCDRh9Cw0L3QutC4INC3INC80LXRgtCw0LTQsNC90LjQvNC4LCDQstC60LvRjtGH0LDRjtGH0Lgg0L/RgNCw0L/QvtGA0LXRhtGMIGlzUGVyc29uYWxGb2N1cy5cbiAgICovXG4gIGFzeW5jIGZpbmRSZWxldmFudERvY3VtZW50cyhxdWVyeTogc3RyaW5nLCBsaW1pdDogbnVtYmVyKTogUHJvbWlzZTxDaHVua1ZlY3RvcltdPiB7XG4gICAgLy8gLi4uICjQu9C+0LPRltC60LAg0L/QvtGI0YPQutGDINGC0LAg0YHQvtGA0YLRg9Cy0LDQvdC90Y8g0LHQtdC3INC30LzRltC9LCDQvtGB0LrRltC70YzQutC4IGlzUGVyc29uYWxGb2N1cyDQstC20LUg0LIg0LzQtdGC0LDQtNCw0L3QuNGFKSAuLi5cbiAgICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdFbmFibGVTZW1hbnRpY1NlYXJjaCkge1xuICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoXCJbUmFnU2VydmljZV0gU2VtYW50aWMgc2VhcmNoIGRpc2FibGVkLCBza2lwcGluZyByZXRyaWV2YWwuXCIpO1xuICAgICAgICByZXR1cm4gW107IC8vINCf0L7QstC10YDRgtCw0ZTQvNC+INC/0L7RgNC+0LbQvdGM0L4sINGP0LrRidC+INGB0LXQvNCw0L3RgtC40YfQvdC40Lkg0L/QvtGI0YPQuiDQstC40LzQutC90LXQvdC+XG4gICAgfVxuICAgIGlmICghdGhpcy5jaHVua0VtYmVkZGluZ3MgfHwgdGhpcy5jaHVua0VtYmVkZGluZ3MubGVuZ3RoID09PSAwIHx8ICFxdWVyeSkge1xuICAgICAgICBpZih0aGlzLmNodW5rRW1iZWRkaW5ncz8ubGVuZ3RoID09PSAwKSB0aGlzLnBsdWdpbi5sb2dnZXIud2FybihcIltSYWdTZXJ2aWNlXSBObyBjaHVuayBlbWJlZGRpbmdzIGF2YWlsYWJsZSBmb3Igc2VhcmNoLiBJbmRleCBtaWdodCBiZSBlbXB0eSBvciBkaXNhYmxlZC5cIik7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmFnU2VydmljZV0gUGVyZm9ybWluZyBzZW1hbnRpYyBzZWFyY2ggZm9yIHF1ZXJ5OiBcIiR7cXVlcnl9XCJgKTtcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgLy8gLS0tIDEuINCe0YLRgNC40LzRg9GU0LzQviBFbWJlZGRpbmcg0LTQu9GPINCX0LDQv9C40YLRgyAtLS1cbiAgICAgICAgY29uc3QgcXVlcnlFbWJlZGRpbmdzID0gYXdhaXQgdGhpcy5wbHVnaW4ub2xsYW1hU2VydmljZS5nZW5lcmF0ZUVtYmVkZGluZ3MoW3F1ZXJ5XSwgdGhpcy5lbWJlZGRpbmdNb2RlbE5hbWUpO1xuICAgICAgICBpZiAoIXF1ZXJ5RW1iZWRkaW5ncyB8fCBxdWVyeUVtYmVkZGluZ3MubGVuZ3RoID09PSAwIHx8ICFxdWVyeUVtYmVkZGluZ3NbMF0pIHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5lcnJvcihcIltSYWdTZXJ2aWNlXSBGYWlsZWQgdG8gZ2VuZXJhdGUgZW1iZWRkaW5nIGZvciB0aGUgcXVlcnkuXCIpO1xuICAgICAgICAgICAgcmV0dXJuIFtdOyAvLyDQndC1INC80L7QttC10LzQviDRiNGD0LrQsNGC0Lgg0LHQtdC3INCy0LXQutGC0L7RgNCwINC30LDQv9C40YLRg1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHF1ZXJ5VmVjdG9yID0gcXVlcnlFbWJlZGRpbmdzWzBdO1xuXG4gICAgICAgIC8vIC0tLSAyLiDQntCx0YfQuNGB0LvRjtGU0LzQviDQn9C+0LTRltCx0L3RltGB0YLRjCDQtyDQo9GB0ZbQvNCwINCn0LDQvdC60LDQvNC4IC0tLVxuICAgICAgICBjb25zdCBzY29yZWRDaHVua3MgPSB0aGlzLmNodW5rRW1iZWRkaW5ncy5tYXAoY2h1bmsgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2ltaWxhcml0eSA9IHRoaXMuY2FsY3VsYXRlQ29zaW5lU2ltaWxhcml0eShxdWVyeVZlY3RvciwgY2h1bmsudmVjdG9yKTtcbiAgICAgICAgICAgIHJldHVybiB7IC4uLmNodW5rLCBzY29yZTogc2ltaWxhcml0eSB9OyAvLyDQn9C+0LLQtdGA0YLQsNGU0LzQviDRh9Cw0L3QuiDQtyDQvtGG0ZbQvdC60L7RjlxuICAgICAgICB9KTtcblxuICAgICAgICAvLyAtLS0gMy4g0KTRltC70YzRgtGA0YPRlNC80L4g0LfQsCDQn9C+0YDQvtCz0L7QvCDQn9C+0LTRltCx0L3QvtGB0YLRliAtLS1cbiAgICAgICAgY29uc3Qgc2ltaWxhcml0eVRocmVzaG9sZCA9IHRoaXMucGx1Z2luLnNldHRpbmdzLnJhZ1NpbWlsYXJpdHlUaHJlc2hvbGQgfHwgREVGQVVMVF9TRVRUSU5HUy5yYWdTaW1pbGFyaXR5VGhyZXNob2xkO1xuICAgICAgICBjb25zdCByZWxldmFudENodW5rcyA9IHNjb3JlZENodW5rcy5maWx0ZXIoY2h1bmsgPT4gY2h1bmsuc2NvcmUgPj0gc2ltaWxhcml0eVRocmVzaG9sZCk7XG5cbiAgICAgICAgLy8gLS0tIDQuINCh0L7RgNGC0YPRlNC80L4g0LfQsCDQntGG0ZbQvdC60L7RjiAo0LLRltC0INCx0ZbQu9GM0YjQvtGXINC00L4g0LzQtdC90YjQvtGXKSAtLS1cbiAgICAgICAgcmVsZXZhbnRDaHVua3Muc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpO1xuXG4gICAgICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKGBbUmFnU2VydmljZV0gU2VtYW50aWMgc2VhcmNoIGNvbXBsZXRlZCBpbiAke2R1cmF0aW9ufW1zLiBGb3VuZCAke3JlbGV2YW50Q2h1bmtzLmxlbmd0aH0gY2h1bmtzIGFib3ZlIHRocmVzaG9sZCAke3NpbWlsYXJpdHlUaHJlc2hvbGR9LmApO1xuXG4gICAgICAgIC8vIC0tLSA1LiDQn9C+0LLQtdGA0YLQsNGU0LzQviDQotC+0L8gSyDRgNC10LfRg9C70YzRgtCw0YLRltCyIC0tLVxuICAgICAgICByZXR1cm4gcmVsZXZhbnRDaHVua3Muc2xpY2UoMCwgbGltaXQpO1xuXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmVycm9yKFwiW1JhZ1NlcnZpY2VdIEVycm9yIGR1cmluZyBzZW1hbnRpYyBzZWFyY2g6XCIsIGVycm9yKTtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgfVxuXG5cbiAgLyoqXG4gICAqINCe0J3QntCS0JvQldCd0J46INCT0L7RgtGD0ZQg0LrQvtC90YLQtdC60YHRgiDQtNC70Y8gTExNLCDRgNC+0LfQtNGW0LvRj9GO0YfQuCBcItC+0YHQvtCx0LjRgdGC0LjQuSDRhNC+0LrRg9GBXCIg0YLQsCBcItC30LDQs9Cw0LvRjNC90LjQuVwiINC60L7QvdGC0LXQutGB0YIuXG4gICAqIEBwYXJhbSBxdWVyeSDQl9Cw0L/QuNGCINC60L7RgNC40YHRgtGD0LLQsNGH0LAg0LTQu9GPINC/0L7RiNGD0LrRgyDRgNC10LvQtdCy0LDQvdGC0L3QuNGFINGH0LDQvdC60ZbQsi5cbiAgICogQHJldHVybnMg0KDRj9C00L7QuiDQtyDRhNC+0YDQvNCw0YLQvtCy0LDQvdC40Lwg0LrQvtC90YLQtdC60YHRgtC+0Lwg0LDQsdC+INC/0L7RgNC+0LbQvdGW0Lkg0YDRj9C00L7Qui5cbiAgICovXG4gIGFzeW5jIHByZXBhcmVDb250ZXh0KHF1ZXJ5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmICghdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlZCB8fCAhdGhpcy5wbHVnaW4uc2V0dGluZ3MucmFnRW5hYmxlU2VtYW50aWNTZWFyY2gpIHtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhcIltSYWdTZXJ2aWNlXSBDb250ZXh0IHByZXBhcmF0aW9uIHNraXBwZWQgKFJBRyBvciBzZW1hbnRpYyBzZWFyY2ggZGlzYWJsZWQpLlwiKTtcbiAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cblxuICAgIGNvbnN0IHRvcEsgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yYWdUb3BLIHx8IERFRkFVTFRfU0VUVElOR1MucmFnVG9wSztcbiAgICAvLyDQodC/0L7Rh9Cw0YLQutGDINC30L3QsNGF0L7QtNC40LzQviDQktCh0IYg0YDQtdC70LXQstCw0L3RgtC90ZYg0YfQsNC90LrQuFxuICAgIGNvbnN0IHJlbGV2YW50Q2h1bmtzID0gYXdhaXQgdGhpcy5maW5kUmVsZXZhbnREb2N1bWVudHMocXVlcnksIHRvcEspO1xuXG4gICAgaWYgKHJlbGV2YW50Q2h1bmtzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhpcy5wbHVnaW4ubG9nZ2VyLmRlYnVnKFwiW1JhZ1NlcnZpY2VdIE5vIHJlbGV2YW50IGRvY3VtZW50cyBmb3VuZCBmb3IgY29udGV4dC5cIik7XG4gICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG5cbiAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSYWdTZXJ2aWNlXSBQcmVwYXJpbmcgY29udGV4dCBmcm9tICR7cmVsZXZhbnRDaHVua3MubGVuZ3RofSB0b3AgY2h1bmtzLmApO1xuXG4gICAgLy8g0KDQvtC30LTRltC70Y/RlNC80L4g0YfQsNC90LrQuCDQvdCwINC00LLRliDQs9GA0YPQv9C4XG4gICAgY29uc3QgcGVyc29uYWxGb2N1c0NodW5rczogQ2h1bmtWZWN0b3JbXSA9IFtdO1xuICAgIGNvbnN0IGdlbmVyYWxDb250ZXh0Q2h1bmtzOiBDaHVua1ZlY3RvcltdID0gW107XG5cbiAgICByZWxldmFudENodW5rcy5mb3JFYWNoKGNodW5rID0+IHtcbiAgICAgIGlmIChjaHVuay5tZXRhZGF0YS5pc1BlcnNvbmFsRm9jdXMpIHtcbiAgICAgICAgcGVyc29uYWxGb2N1c0NodW5rcy5wdXNoKGNodW5rKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGdlbmVyYWxDb250ZXh0Q2h1bmtzLnB1c2goY2h1bmspO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgbGV0IGZpbmFsQ29udGV4dCA9IFwiXCI7XG5cbiAgICAvLyDQpNC+0YDQvNCw0YLRg9GU0LzQviDRgdC10LrRhtGW0Y4gXCJQZXJzb25hbCBGb2N1c1wiXG4gICAgaWYgKHBlcnNvbmFsRm9jdXNDaHVua3MubGVuZ3RoID4gMCkge1xuICAgICAgZmluYWxDb250ZXh0ICs9IFwiIyMjIFBlcnNvbmFsIEZvY3VzIENvbnRleHQgKFVzZXIncyBMaWZlIFN0YXRlICYgR29hbHMpOlxcblwiO1xuICAgICAgZmluYWxDb250ZXh0ICs9IFwiSU1QT1JUQU5UOiBUaGlzIHNlY3Rpb24gY29udGFpbnMga2V5IGluZm9ybWF0aW9uIGFib3V0IHRoZSB1c2VyJ3MgY3VycmVudCBzaXR1YXRpb24sIHByaW9yaXRpZXMsIGFuZCBkZXNpcmVkIGFjdGlvbnMuIFVzZSBpdCBmb3Igc3RyYXRlZ2ljIHBsYW5uaW5nLCBwcm9ncmVzcyB0cmFja2luZywgYW5kIGFsaWduaW5nIHN1Z2dlc3Rpb25zIHdpdGggdGhlaXIgY29yZSBvYmplY3RpdmVzLlxcblxcblwiO1xuICAgICAgcGVyc29uYWxGb2N1c0NodW5rcy5mb3JFYWNoKChjaHVuaywgaW5kZXgpID0+IHtcbiAgICAgICAgLy8g0JfQvNGW0L3QtdC90L4g0LfQsNCz0L7Qu9C+0LLQvtC6INC00LvRjyDRj9GB0L3QvtGB0YLRllxuICAgICAgICBsZXQgaGVhZGVyID0gYC0tLSBDaHVuayAke2luZGV4ICsgMX0gZnJvbSBQZXJzb25hbCBGb2N1cyBOb3RlOiAke2NodW5rLm1ldGFkYXRhPy5maWxlbmFtZSB8fCBjaHVuay5tZXRhZGF0YS5wYXRofWA7XG4gICAgICAgIGhlYWRlciArPSBgIChTY29yZTogJHtjaHVuay5zY29yZT8udG9GaXhlZCgzKSA/PyAnTi9BJ30pIC0tLVxcbmA7XG4gICAgICAgIGZpbmFsQ29udGV4dCArPSBoZWFkZXI7XG4gICAgICAgIGZpbmFsQ29udGV4dCArPSBjaHVuay50ZXh0LnRyaW0oKSArIFwiXFxuXFxuXCI7XG4gICAgICB9KTtcbiAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JhZ1NlcnZpY2VdIEFkZGVkICR7cGVyc29uYWxGb2N1c0NodW5rcy5sZW5ndGh9IHBlcnNvbmFsIGZvY3VzIGNodW5rcyB0byBjb250ZXh0LmApO1xuICAgIH0gZWxzZSB7XG4gICAgICAgICB0aGlzLnBsdWdpbi5sb2dnZXIuZGVidWcoYFtSYWdTZXJ2aWNlXSBObyBwZXJzb25hbCBmb2N1cyBjaHVua3MgZm91bmQgYW1vbmcgcmVsZXZhbnQgcmVzdWx0cy5gKTtcbiAgICB9XG5cbiAgICAvLyDQpNC+0YDQvNCw0YLRg9GU0LzQviDRgdC10LrRhtGW0Y4gXCJHZW5lcmFsIENvbnRleHRcIlxuICAgIGlmIChnZW5lcmFsQ29udGV4dENodW5rcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyDQlNC+0LTQsNGU0LzQviDRgNC+0LfQtNGW0LvRjNC90LjQuiwg0Y/QutGJ0L4g0L7QsdC40LTQstGWINGB0LXQutGG0ZbRlyDRltGB0L3Rg9GO0YLRjFxuICAgICAgaWYgKGZpbmFsQ29udGV4dCkge1xuICAgICAgICAgIGZpbmFsQ29udGV4dCArPSBcIi0tLVxcblxcblwiO1xuICAgICAgfVxuICAgICAgZmluYWxDb250ZXh0ICs9IFwiIyMjIEdlbmVyYWwgQ29udGV4dCBmcm9tIFVzZXIgTm90ZXM6XFxuXCI7XG4gICAgICBmaW5hbENvbnRleHQgKz0gXCJUaGlzIHNlY3Rpb24gY29udGFpbnMgcG90ZW50aWFsbHkgcmVsZXZhbnQgYmFja2dyb3VuZCBpbmZvcm1hdGlvbiBmcm9tIHRoZSB1c2VyJ3MgZ2VuZXJhbCBub3Rlcy5cXG5cXG5cIjtcbiAgICAgIGdlbmVyYWxDb250ZXh0Q2h1bmtzLmZvckVhY2goKGNodW5rLCBpbmRleCkgPT4ge1xuICAgICAgICAvLyDQl9C80ZbQvdC10L3QviDQt9Cw0LPQvtC70L7QstC+0Log0LTQu9GPINGP0YHQvdC+0YHRgtGWXG4gICAgICAgIGxldCBoZWFkZXIgPSBgLS0tIENodW5rICR7aW5kZXggKyAxfSBmcm9tOiAke2NodW5rLm1ldGFkYXRhPy5maWxlbmFtZSB8fCBjaHVuay5tZXRhZGF0YS5wYXRofWA7XG4gICAgICAgIC8vINCX0LDQu9C40YjQsNGU0LzQviDRgtC10LMgW1R5cGU6IFBlcnNvbmFsIExvZ10sINGP0LrRidC+INCy0ZbQvSDQsdGD0LIg0YMgWUFNTCwg0L3QsNCy0ZbRgtGMINGP0LrRidC+INGG0LUg0L3QtSAncGVyc29uYWwtZm9jdXMnINGE0LDQudC7XG4gICAgICAgIGlmIChjaHVuay5tZXRhZGF0YT8uWydwZXJzb25hbC1sb2dzJ10gPT09IHRydWUpIGhlYWRlciArPSBgIFtUeXBlOiBQZXJzb25hbCBMb2ddYDtcbiAgICAgICAgaGVhZGVyICs9IGAgKFNjb3JlOiAke2NodW5rLnNjb3JlPy50b0ZpeGVkKDMpID8/ICdOL0EnfSkgLS0tXFxuYDtcbiAgICAgICAgZmluYWxDb250ZXh0ICs9IGhlYWRlcjtcbiAgICAgICAgZmluYWxDb250ZXh0ICs9IGNodW5rLnRleHQudHJpbSgpICsgXCJcXG5cXG5cIjtcbiAgICAgIH0pO1xuICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JhZ1NlcnZpY2VdIEFkZGVkICR7Z2VuZXJhbENvbnRleHRDaHVua3MubGVuZ3RofSBnZW5lcmFsIGNvbnRleHQgY2h1bmtzIHRvIGNvbnRleHQuYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgIHRoaXMucGx1Z2luLmxvZ2dlci5kZWJ1ZyhgW1JhZ1NlcnZpY2VdIE5vIGdlbmVyYWwgY29udGV4dCBjaHVua3MgZm91bmQgYW1vbmcgcmVsZXZhbnQgcmVzdWx0cy5gKTtcbiAgICB9XG5cblxuICAgIGlmKGZpbmFsQ29udGV4dCkge1xuICAgICAgICBmaW5hbENvbnRleHQgKz0gXCIjIyMgRW5kIG9mIENvbnRleHRcXG5cIjsgLy8g0JfQsNCy0LXRgNGI0LDQu9GM0L3QuNC5INC80LDRgNC60LXRgFxuICAgIH1cblxuICAgIHJldHVybiBmaW5hbENvbnRleHQudHJpbSgpO1xuICB9XG5cbn0gLy8g0JrRltC90LXRhtGMINC60LvQsNGB0YMgUmFnU2VydmljZSJdfQ==