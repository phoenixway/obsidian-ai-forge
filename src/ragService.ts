// src/ragService.ts
import { TFile, Vault, normalizePath, DataAdapter, TFolder } from "obsidian"; // Додано DataAdapter
import OllamaPlugin from "./main";
import { DEFAULT_SETTINGS } from "./settings";

// Метадані документа (зберігаємо для кожного ЧАНКА)
interface DocumentMetadata {
    path: string;
    filename?: string;
    created?: number;
    modified?: number;
    'personal-logs'?: boolean;
    [key: string]: any; // YAML frontmatter
}

// Інтерфейс для чанка з вектором
interface ChunkVector {
  text: string;        // Текст самого чанка
  vector: number[];    // Векторне представлення (embedding)
  metadata: DocumentMetadata; // Метадані ОРИГІНАЛЬНОГО документа
  score?: number;       // Оцінка подібності при пошуку (додається динамічно)
}

export class RagService {
  private plugin: OllamaPlugin;
  private adapter: DataAdapter;
  // --- ЗМІНЕНО: Зберігаємо ембединги чанків ---
  private chunkEmbeddings: ChunkVector[] = [];
  // ------------------------------------------
  private isIndexing: boolean = false;
  private embeddingModelName: string = "nomic-embed-text"; // Модель за замовчуванням

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
    this.adapter = plugin.app.vault.adapter;
    // Отримуємо назву моделі з налаштувань при старті
    this.embeddingModelName = this.plugin.settings.ragEmbeddingModel || DEFAULT_SETTINGS.ragEmbeddingModel;
  }

  /**
   * Розбиває текст на чанки (проста версія - за абзацами).
   * @param text Вхідний текст документа (бажано без YAML).Я
   * @param chunkSize Максимальна довжина чанка в символах (з налаштувань).
   * @returns Масив текстових чанків.
   */
  private splitIntoChunks(text: string, chunkSize: number): string[] {
    if (!text) return [];
    const paragraphs = text.split(/\n\s*\n/); // Розділяємо на абзаци
    const chunks: string[] = [];

    for (const p of paragraphs) {
        const trimmedP = p.trim();
        if (trimmedP.length === 0) continue;

        // Якщо абзац вже занадто великий, розбиваємо його далі
        if (trimmedP.length > chunkSize) {
            // Проста розбивка за реченнями або фіксованою довжиною (можна покращити)
            for (let i = 0; i < trimmedP.length; i += chunkSize) {
                chunks.push(trimmedP.substring(i, i + chunkSize));
            }
        } else {
            chunks.push(trimmedP);
        }
    }
    // Фільтруємо дуже короткі чанки, які могли утворитися
    return chunks.filter(chunk => chunk.length > 20); // Мінімальна довжина чанка (налаштовується)
  }


  /**
   * Індексує markdown файли: розбиває на чанки, генерує embeddings, зберігає в пам'яті.
   */
  async indexDocuments(): Promise<void> {
    if (!this.plugin.settings.ragEnabled) {
      this.plugin.logger.debug("[RagService] RAG indexing skipped (disabled in settings).");
      this.chunkEmbeddings = []; // Очищаємо індекс, якщо RAG вимкнено
      return;
    }
     // Перевіряємо, чи увімкнено семантичний пошук
     if (!this.plugin.settings.ragEnableSemanticSearch) {
        this.plugin.logger.debug("[RagService] Semantic Search indexing skipped (disabled in settings).");
        // Можна або очистити chunkEmbeddings, або залишити старий keyword-індекс (this.documents)
        this.chunkEmbeddings = []; // Очищаємо, бо цей сервіс тепер для семантики
        // Тут могла б бути логіка для старого індексування, якщо потрібно
        return;
     }

    if (this.isIndexing) {
        this.plugin.logger.warn("[RagService] Indexing already in progress.");
        return;
    }
    this.isIndexing = true;
    this.plugin.logger.debug("[RagService] Starting semantic indexing...");
    const startTime = Date.now();

    // Оновлюємо назву моделі з налаштувань
    this.embeddingModelName = this.plugin.settings.ragEmbeddingModel || DEFAULT_SETTINGS.ragEmbeddingModel;
    const chunkSize = this.plugin.settings.ragChunkSize || DEFAULT_SETTINGS.ragChunkSize;
    this.plugin.logger.debug(`[RagService] Using embedding model: ${this.embeddingModelName}, Chunk size: ${chunkSize}`);


    const newEmbeddings: ChunkVector[] = [];
    try {
      const folderPath = this.plugin.settings.ragFolderPath;
      const vault = this.plugin.app.vault;
      const metadataCache = this.plugin.app.metadataCache;

      this.plugin.logger.debug(`[RagService] RAG folder path: "${folderPath}"`);
      const files = await this.getMarkdownFiles(vault, folderPath);
      this.plugin.logger.debug(`[RagService] Found ${files.length} markdown files in "${folderPath}".`);

      let processedFiles = 0;
      for (const file of files) {
        this.plugin.logger.debug(`[RagService] Processing file: ${file.path}`);
        try {
          const content = await vault.read(file);
          const fileCache = metadataCache.getFileCache(file);
          const frontmatter = fileCache?.frontmatter || {};

          let bodyContent = content;
          if (fileCache?.frontmatterPosition) {
              bodyContent = content.substring(fileCache.frontmatterPosition.end.offset).trim();
          }

          // --- 1. Chunking ---
          const chunks = this.splitIntoChunks(bodyContent, chunkSize);
          if (!chunks || chunks.length === 0) {
             this.plugin.logger.debug(`[RagService] No valid chunks found in ${file.path}, skipping.`);
             continue; // Переходимо до наступного файлу
          }

          // --- 2. Embedding Generation ---
          // TODO: Розглянути можливість батчингу запитів до Ollama, якщо API підтримує
          this.plugin.logger.debug(`[RagService] Generating ${chunks.length} embeddings for ${file.path} using ${this.embeddingModelName}...`);
          const vectors = await this.plugin.ollamaService.generateEmbeddings(chunks, this.embeddingModelName);

          if (vectors && vectors.length === chunks.length) {
              const metadata: DocumentMetadata = {
                ...frontmatter,
                path: file.path,
                filename: file.name,
                created: file.stat?.ctime,
                modified: file.stat?.mtime,
                'personal-logs': frontmatter['personal-logs'] === true
              };
              for (let i = 0; i < chunks.length; i++) {
                  newEmbeddings.push({
                      text: chunks[i],
                      vector: vectors[i],
                      metadata: metadata // Додаємо однакові метадані до всіх чанків файлу
                  });
              }
               this.plugin.logger.debug(`[RagService] Successfully embedded ${vectors.length} chunks from ${file.path}`);
               processedFiles++;
          } else {
               this.plugin.logger.warn(`[RagService] Mismatch or error generating embeddings for ${file.path}. Expected ${chunks.length}, got ${vectors?.length}`);
          }
        } catch (error) {
           this.plugin.logger.error(`[RagService] Error processing file ${file.path}:`, error);
        }
      } // end for loop

      this.chunkEmbeddings = newEmbeddings; // Оновлюємо індекс
      const duration = (Date.now() - startTime) / 1000;
      this.plugin.logger.debug(`[RagService] Semantic indexing complete in ${duration.toFixed(2)}s. Indexed ${this.chunkEmbeddings.length} chunks from ${processedFiles} files.`);
      // new Notice(`RAG index updated: ${this.chunkEmbeddings.length} chunks indexed.`);

    } catch (error) {
      this.plugin.logger.error("[RagService] Error during indexing process:", error);
      // new Notice("RAG indexing failed. See console for details.");
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Get all markdown files in the specified folder path
   */
  private async getMarkdownFiles(vault: Vault, folderPath: string): Promise<TFile[]> {
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


  // --- Обчислення Косинусної Подібності ---
  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
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
  // ----------------------------------------------------------------------------

  /**
   * Знаходить релевантні ЧАНКИ документів за допомогою семантичної подібності.
   * @param query Запит користувача.
   * @param limit Максимальна кількість чанків для повернення (з налаштувань topK).
   * @returns Масив об'єктів ChunkVector, відсортований за подібністю.
   */
  async findRelevantDocuments(query: string, limit: number): Promise<ChunkVector[]> {
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
   * Готує контекст для LLM з найбільш релевантних чанків документів.
   * @param query Запит користувача для пошуку релевантних чанків.
   * @returns Рядок з форматованим контекстом або порожній рядок.
   */
  async prepareContext(query: string): Promise<string> { // Зроблено async
       if (!this.plugin.settings.ragEnabled) {
           return "";
       }
       // Використовуємо семантичний пошук, якщо він увімкнений
       if (this.plugin.settings.ragEnableSemanticSearch) {
           const topK = this.plugin.settings.ragTopK || DEFAULT_SETTINGS.ragTopK;
           const relevantChunks = await this.findRelevantDocuments(query, topK);

           if (relevantChunks.length === 0) {
               this.plugin.logger.debug("[RagService] No relevant documents found via semantic search for context.");
               return "";
           }

           this.plugin.logger.debug(`[RagService] Preparing context from ${relevantChunks.length} top chunks.`);
           let context = "### Context from User Notes (Semantic Search):\n\n";
           relevantChunks.forEach((chunk, index) => {
               let header = `--- Chunk ${index + 1} from: ${chunk.metadata?.filename || chunk.metadata.path}`;
               if (chunk.metadata?.['personal-logs'] === true) header += ` [Type: Personal Log]`;
               // Додаємо оцінку подібності до заголовка
               header += ` (Score: ${chunk.score?.toFixed(3) ?? 'N/A'}) ---\n`;
               context += header;
               context += chunk.text.trim() + "\n\n"; // Додаємо текст чанка
           });
           context += "### End of Context\n\n";
           return context.trim();

       } else {
           // --- Залишок Логіки для Старого Пошуку (Якщо Потрібно) ---
           // Якщо семантичний пошук вимкнено, можна повернутись до старої логіки
           // findRelevantDocuments (з пошуком за ключовими словами)
           // Або просто повернути порожній рядок, якщо старий пошук не підтримується
           this.plugin.logger.debug("[RagService] Semantic search disabled. Using legacy keyword search (if implemented) or skipping RAG.");
           // Приклад виклику старої функції (якщо вона існує)
           // const keywordLimit = 3; // Або інше значення
           // const keywordDocs = this.findRelevantDocuments_Keyword(query, keywordLimit); // Перейменуйте стару функцію
           // if(keywordDocs.length > 0) { return this.formatKeywordContext(keywordDocs); } else { return "";}
           return ""; // Повертаємо порожньо, якщо семантика вимкнена
       }
    }

    // Додатково: Функції для старого пошуку, якщо ви їх залишаєте
    /*
    private findRelevantDocuments_Keyword(query: string, limit: number): DocumentVector[] {
        // ... ваша стара логіка пошуку за ключовими словами ...
        const scoredDocs = this.documents
          .map(doc => ({ doc, score: this.calculateRelevanceScore(doc, query) }))
          .filter(item => item.score > 0);
        scoredDocs.sort((a, b) => b.score - a.score);
        return scoredDocs.slice(0, limit).map(item => ({...item.doc, score: item.score}));
    }

    private formatKeywordContext(docs: DocumentVector[]): string {
         let context = "### Context from User Notes (Keyword Search):\n\n";
         docs.forEach((doc, index) => {
             let header = `--- Document ${index + 1}: ${doc.metadata?.filename || doc.path} (Score: ${doc.score?.toFixed(0)}) ---\n`;
             // ... решта форматування ...
             const contentToUse = doc.body || doc.content;
             const maxCharsPerDoc = this.plugin.settings.maxCharsPerDoc || 1500;
             const truncatedContent = contentToUse.length > maxCharsPerDoc
               ? contentToUse.substring(0, maxCharsPerDoc) + "...\n[Content Truncated]"
               : contentToUse;
             context += header + truncatedContent + "\n\n";
         });
         context += "### End of Context\n\n";
         return context.trim();
    }
    */

} // Кінець класу RagService