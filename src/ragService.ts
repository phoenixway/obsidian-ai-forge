// src/ragService.ts
import { TFile, Vault, normalizePath, DataAdapter, TFolder, MetadataCache } from "obsidian"; // Додано DataAdapter, MetadataCache
import OllamaPlugin from "./main";
import { DEFAULT_SETTINGS } from "./settings";

// --- ОНОВЛЕНО: Інтерфейс метаданих документа ---
interface DocumentMetadata {
    path: string;
    filename?: string;
    created?: number;
    modified?: number;
    isPersonalFocus?: boolean; // <-- НОВИЙ ПРАПОРЕЦЬ
    [key: string]: any; // YAML frontmatter
}

// --- ОНОВЛЕНО: Інтерфейс для чанка з вектором ---
interface ChunkVector {
  text: string;
  vector: number[];
  metadata: DocumentMetadata; // Метадані тепер включають isPersonalFocus
  score?: number;
}

export class RagService {
  private plugin: OllamaPlugin;
  private adapter: DataAdapter;
  private vault: Vault;
  private metadataCache: MetadataCache;
  private chunkEmbeddings: ChunkVector[] = [];
  private isIndexing: boolean = false;
  private embeddingModelName: string = "nomic-embed-text";

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
    this.adapter = plugin.app.vault.adapter;
    this.vault = plugin.app.vault;
    this.metadataCache = plugin.app.metadataCache;
    this.embeddingModelName = this.plugin.settings.ragEmbeddingModel || DEFAULT_SETTINGS.ragEmbeddingModel;
  }

  private splitIntoChunks(text: string, chunkSize: number): string[] {
    if (!text) return [];
    this.plugin.logger.debug(`[RagService Chunking] Input text length: ${text.length}`); // Log input length
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    this.plugin.logger.debug(`[RagService Chunking] Found ${paragraphs.length} paragraphs.`); // Log paragraph count

    for (const p of paragraphs) {
        const trimmedP = p.trim();
        if (trimmedP.length === 0) continue;

        if (trimmedP.length > chunkSize) {
             this.plugin.logger.debug(`[RagService Chunking] Paragraph too long (${trimmedP.length}), splitting...`); // Log splitting
            for (let i = 0; i < trimmedP.length; i += chunkSize) {
                const subChunk = trimmedP.substring(i, i + chunkSize);
                // this.plugin.logger.debug(`[RagService Chunking] Raw sub-chunk: "${subChunk.substring(0,50)}..."`); // Log raw sub-chunk
                chunks.push(subChunk);
            }
        } else {
            // this.plugin.logger.debug(`[RagService Chunking] Adding paragraph as chunk: "${trimmedP.substring(0,50)}..."`); // Log added paragraph
            chunks.push(trimmedP);
        }
    }
    const filteredChunks = chunks.filter(chunk => chunk.length > 20); // Apply filter
    this.plugin.logger.debug(`[RagService Chunking] Produced ${chunks.length} raw chunks, ${filteredChunks.length} chunks after filtering (>20 chars).`); // Log counts
    return filteredChunks;
}

  /**
   * ОНОВЛЕНО: Індексує markdown файли, розпізнаючи тег 'personal-focus'.
   */
  async indexDocuments(): Promise<void> {
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

    const newEmbeddings: ChunkVector[] = [];
    try {
      const folderPath = this.plugin.settings.ragFolderPath;
      const files = await this.getMarkdownFiles(this.vault, folderPath);
      this.plugin.logger.debug(`[RagService] Found ${files.length} markdown files in "${folderPath}".`);

      let processedFiles = 0;
      let personalFocusFiles = 0;

      for (const file of files) {
        // this.plugin.logger.debug(`[RagService] Processing file: ${file.path}`); // Можна закоментувати для менш детального логування
        try {
          const content = await this.vault.read(file);
          const fileCache = this.metadataCache.getFileCache(file);
          const frontmatter = fileCache?.frontmatter || {};

          // --- Розпізнавання тегу 'personal-focus' ---
          const isPersonal = frontmatter[personalFocusTag] === true;
          if (isPersonal) {
              personalFocusFiles++;
              this.plugin.logger.debug(`[RagService] File ${file.path} marked as personal focus.`);
          }
          // ------------------------------------------

          let bodyContent = content;
          if (fileCache?.frontmatterPosition) {
            bodyContent = content.substring(fileCache.frontmatterPosition.end.offset).trim();
          }

          const chunks = this.splitIntoChunks(bodyContent, chunkSize);
          if (!chunks || chunks.length === 0) {
             // this.plugin.logger.debug(`[RagService] No valid chunks found in ${file.path}, skipping.`);
             continue;
          }

         // this.plugin.logger.debug(`[RagService] Generating ${chunks.length} embeddings for ${file.path} using ${this.embeddingModelName}...`);
          const vectors = await this.plugin.ollamaService.generateEmbeddings(chunks, this.embeddingModelName);

          if (vectors && vectors.length === chunks.length) {
            // --- ОНОВЛЕНО: Додаємо isPersonalFocus в метадані ---
            const metadata: DocumentMetadata = {
              ...frontmatter, // Копіюємо весь frontmatter
              path: file.path,
              filename: file.name,
              created: file.stat?.ctime,
              modified: file.stat?.mtime,
              isPersonalFocus: isPersonal // <-- Зберігаємо прапорець
            };
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
          } else {
            this.plugin.logger.warn(`[RagService] Mismatch or error generating embeddings for ${file.path}. Expected ${chunks.length}, got ${vectors?.length}`);
          }
        } catch (error) {
          this.plugin.logger.error(`[RagService] Error processing file ${file.path}:`, error);
        }
      } // end for loop

      this.chunkEmbeddings = newEmbeddings;
      const duration = (Date.now() - startTime) / 1000;
      this.plugin.logger.info(`[RagService] Semantic indexing complete in ${duration.toFixed(2)}s. Indexed ${this.chunkEmbeddings.length} chunks from ${processedFiles} files (${personalFocusFiles} personal focus files).`);

    } catch (error) {
      this.plugin.logger.error("[RagService] Error during indexing process:", error);
    } finally {
      this.isIndexing = false;
    }
  }

  private async getMarkdownFiles(vault: Vault, folderPath: string): Promise<TFile[]> {
      // ... (без змін) ...
       const files: TFile[] = [];
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
  }

  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
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
    if (normA === 0 || normB === 0) return 0;

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Знаходить релевантні ЧАНКИ документів за допомогою семантичної подібності.
   * Повертає чанки з метаданими, включаючи прапорець isPersonalFocus.
   */
  async findRelevantDocuments(query: string, limit: number): Promise<ChunkVector[]> {
    // ... (логіка пошуку та сортування без змін, оскільки isPersonalFocus вже в метаданих) ...
     if (!this.plugin.settings.ragEnableSemanticSearch) {
        this.plugin.logger.debug("[RagService] Semantic search disabled, skipping retrieval.");
        return []; // Повертаємо порожньо, якщо семантичний пошук вимкнено
    }
    if (!this.chunkEmbeddings || this.chunkEmbeddings.length === 0 || !query) {
        if(this.chunkEmbeddings?.length === 0) this.plugin.logger.warn("[RagService] No chunk embeddings available for search. Index might be empty or disabled.");
        return [];
    }
    this.plugin.logger.debug(`[RagService] Performing semantic search for query: "${query}"`);
    const startTime = Date.now();

    try {
        // --- 1. Отримуємо Embedding для Запиту ---
        const queryEmbeddings = await this.plugin.ollamaService.generateEmbeddings([query], this.embeddingModelName);
        if (!queryEmbeddings || queryEmbeddings.length === 0 || !queryEmbeddings[0]) {
            this.plugin.logger.error("[RagService] Failed to generate embedding for the query.");
            return []; // Не можемо шукати без вектора запиту
        }
        const queryVector = queryEmbeddings[0];

        // --- 2. Обчислюємо Подібність з Усіма Чанками ---
        const scoredChunks = this.chunkEmbeddings.map(chunk => {
            const similarity = this.calculateCosineSimilarity(queryVector, chunk.vector);
            return { ...chunk, score: similarity }; // Повертаємо чанк з оцінкою
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

    } catch (error) {
        this.plugin.logger.error("[RagService] Error during semantic search:", error);
        return [];
    }
  }


  /**
   * ОНОВЛЕНО: Готує контекст для LLM, розділяючи "особистий фокус" та "загальний" контекст.
   * @param query Запит користувача для пошуку релевантних чанків.
   * @returns Рядок з форматованим контекстом або порожній рядок.
   */
  async prepareContext(query: string): Promise<string> {
    if (!this.plugin.settings.ragEnabled || !this.plugin.settings.ragEnableSemanticSearch) {
      this.plugin.logger.debug("[RagService] Context preparation skipped (RAG or semantic search disabled).");
      return "";
    }

    const topK = this.plugin.settings.ragTopK || DEFAULT_SETTINGS.ragTopK;
    // Спочатку знаходимо ВСІ релевантні чанки
    const relevantChunks = await this.findRelevantDocuments(query, topK);

    if (relevantChunks.length === 0) {
      this.plugin.logger.debug("[RagService] No relevant documents found for context.");
      return "";
    }

    this.plugin.logger.debug(`[RagService] Preparing context from ${relevantChunks.length} top chunks.`);

    // Розділяємо чанки на дві групи
    const personalFocusChunks: ChunkVector[] = [];
    const generalContextChunks: ChunkVector[] = [];

    relevantChunks.forEach(chunk => {
      if (chunk.metadata.isPersonalFocus) {
        personalFocusChunks.push(chunk);
      } else {
        generalContextChunks.push(chunk);
      }
    });

    let finalContext = "";

    // Форматуємо секцію "Personal Focus"
    if (personalFocusChunks.length > 0) {
      finalContext += "### Personal Focus Context (User's Life State & Goals):\n";
      finalContext += "IMPORTANT: This section contains key information about the user's current situation, priorities, and desired actions. Use it for strategic planning, progress tracking, and aligning suggestions with their core objectives.\n\n";
      personalFocusChunks.forEach((chunk, index) => {
        // Змінено заголовок для ясності
        let header = `--- Chunk ${index + 1} from Personal Focus Note: ${chunk.metadata?.filename || chunk.metadata.path}`;
        header += ` (Score: ${chunk.score?.toFixed(3) ?? 'N/A'}) ---\n`;
        finalContext += header;
        finalContext += chunk.text.trim() + "\n\n";
      });
      this.plugin.logger.debug(`[RagService] Added ${personalFocusChunks.length} personal focus chunks to context.`);
    } else {
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
        // Змінено заголовок для ясності
        let header = `--- Chunk ${index + 1} from: ${chunk.metadata?.filename || chunk.metadata.path}`;
        // Залишаємо тег [Type: Personal Log], якщо він був у YAML, навіть якщо це не 'personal-focus' файл
        if (chunk.metadata?.['personal-logs'] === true) header += ` [Type: Personal Log]`;
        header += ` (Score: ${chunk.score?.toFixed(3) ?? 'N/A'}) ---\n`;
        finalContext += header;
        finalContext += chunk.text.trim() + "\n\n";
      });
       this.plugin.logger.debug(`[RagService] Added ${generalContextChunks.length} general context chunks to context.`);
    } else {
         this.plugin.logger.debug(`[RagService] No general context chunks found among relevant results.`);
    }


    if(finalContext) {
        finalContext += "### End of Context\n"; // Завершальний маркер
    }

    return finalContext.trim();
  }

} // Кінець класу RagService