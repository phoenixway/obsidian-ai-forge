// ragService.ts
import { TFile, Vault, FrontMatterCache, parseYaml } from "obsidian"; // Додано FrontMatterCache, parseYaml
import OllamaPlugin from "./main";

interface DocumentMetadata {
    path: string; // Додаємо шлях для можливого використання
    filename?: string;
    created?: number;
    modified?: number;
    'personal-logs'?: boolean; // Додаємо поле для логів
    [key: string]: any; // Дозволяє додавати будь-які поля з YAML
}


interface DocumentVector {
  path: string;
  content: string; // Повний контент файлу
  body?: string;   // Тіло файлу (без YAML) - опціонально, може бути корисним
  metadata?: DocumentMetadata; // Розширені метадані
  score?: number;
}

export class RagService {
  private plugin: OllamaPlugin;
  private documents: DocumentVector[] = [];
  private isIndexing: boolean = false;

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
  }

  /**
   * Index all markdown files in the specified folder path, parsing YAML
   */
  async indexDocuments(): Promise<void> {
    if (this.isIndexing) return;
    this.isIndexing = true;

    try {
      const folderPath = this.plugin.settings.ragFolderPath;
      const vault = this.plugin.app.vault;
      const metadataCache = this.plugin.app.metadataCache; // Отримуємо доступ до кешу метаданих

      console.log(`AI Assistant path: "${folderPath}" (RAG documents will be loaded from here)`);
      const allFiles = vault.getFiles();
      console.log(`Total files in vault: ${allFiles.length}`);
      const files = await this.getMarkdownFiles(vault, folderPath); // Використовуємо існуючу логіку

      console.log(`Found ${files.length} markdown files from "${folderPath}"`);
      console.log(`Indexing ${files.length} markdown files from ${folderPath}`);
      this.documents = [];

      for (const file of files) {
        try {
          const content = await vault.read(file);
          const fileCache = metadataCache.getFileCache(file);
          const frontmatter = fileCache?.frontmatter || {}; // Безпечно отримуємо frontmatter

          // --- Опціонально: Отримуємо тіло файлу (без YAML) ---
          let bodyContent = content;
          if (fileCache?.frontmatterPosition) {
              bodyContent = content.substring(fileCache.frontmatterPosition.end.offset).trim();
          }
          // ----------------------------------------------------

          // Формуємо метадані
          const metadata: DocumentMetadata = {
            ...frontmatter, // Додаємо все з YAML
            path: file.path, // Зберігаємо шлях
            filename: file.name,
            created: file.stat?.ctime,
            modified: file.stat?.mtime,
            'personal-logs': frontmatter['personal-logs'] === true // Явно перевіряємо на true
          };

          this.documents.push({
            path: file.path,
            content: content, // Зберігаємо повний контент
            body: bodyContent, // Зберігаємо тіло (опціонально)
            metadata: metadata
          });
        } catch (error) {
          console.error(`Error reading or processing file ${file.path}:`, error);
        }
      }

      console.log(`Indexed ${this.documents.length} documents for RAG`);
    } catch (error) {
      console.error("Error indexing documents:", error);
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Get all markdown files in the specified folder path
   * (Залишаємо без змін, але переконуємось, що вона працює коректно)
   */
  private async getMarkdownFiles(vault: Vault, folderPath: string): Promise<TFile[]> {
      const files: TFile[] = [];
      if (!folderPath) {
          console.warn("[RagService] RAG folder path is not set.");
          return files;
      }

      // Нормалізація шляху не потрібна, якщо vault.getFiles() використовується коректно
      // const normalizedFolderPath = folderPath.endsWith('/') ? folderPath : folderPath + '/';
      // console.log(`Looking for markdown files starting with: "${normalizedFolderPath}"`);

      const allFiles = vault.getFiles();

      for (const file of allFiles) {
          // Перевіряємо, чи файл є markdown І чи він знаходиться УСЕРЕДИНІ вказаної папки
          if (file.extension === "md" && file.path.startsWith(folderPath + (folderPath.endsWith('/') ? '' : '/'))) {
              // console.log(`[RagService] Adding file: ${file.path}`);
              files.push(file);
          }
      }
      // console.log(`[RagService] Found ${files.length} markdown files in ${folderPath}`);
      return files;
  }

  // --- Хелпер для підрахунку очок релевантності (винесено для перевикористання) ---
  private calculateRelevanceScore(doc: DocumentVector, queryTerms: string): number {
    // Використовуємо тільки тіло документа для підрахунку, щоб YAML не впливав сильно
    const contentToScore = doc.body || doc.content;
    const lowerContent = contentToScore.toLowerCase();
    const lowerQuery = queryTerms.toLowerCase();

    const terms = lowerQuery.split(/\s+/).filter(term => term.length > 2); // Розділяємо запит на слова > 2 символів
    let score = 0;

    for (const term of terms) {
      try {
          // Використовуємо безпечніший RegExp
          const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Екранування спецсимволів
          const regex = new RegExp(escapedTerm, 'gi');
          const matches = lowerContent.match(regex);
          if (matches) {
            score += matches.length; // Збільшуємо рахунок на кількість збігів
          }
      } catch(e) {
          console.warn(`[RagService] Invalid regex term: ${term}`, e);
      }
    }

    // Додамо невеликий бонус за збіг у назві файлу
    if (doc.metadata?.filename && doc.metadata.filename.toLowerCase().includes(lowerQuery)) {
        score += 5; // Довільний бонус
    }

    return score;
  }
  // ----------------------------------------------------------------------------

  /**
   * Modified search to handle filename queries and use relevance scoring.
   */
  findRelevantDocuments(query: string, limit: number = 5): DocumentVector[] {
    if (!this.documents.length) {
      return [];
    }

    // 1. Перевірка на запит за іменем файлу
    // Простіший regex, шукає щось схоже на "filename.md" або "filename" в лапках/одинарних лапках
    const filenameQueryMatch = query.match(/[`'"]?([\w\-\s]+\.md)[`'"]?/i) || query.match(/file:([\w\-\s]+\.md)/i);
    let targetFilename: string | null = null;

    if (filenameQueryMatch) {
        targetFilename = filenameQueryMatch[1].trim().toLowerCase();
        console.log(`[RagService] Detected filename query for: ${targetFilename}`);
        // Очищуємо запит від імені файлу для подальшого пошуку релевантності
        query = query.replace(filenameQueryMatch[0], '').trim();
    }

    let results: DocumentVector[] = [];

    // Якщо знайдено ім'я файлу, спробуємо знайти цей документ
    if (targetFilename) {
        const foundDoc = this.documents.find(doc => doc.metadata?.filename?.toLowerCase() === targetFilename);
        if (foundDoc) {
            // Додаємо знайдений документ першим
            results.push({ ...foundDoc, score: 1000 }); // Даємо високий пріоритет
            console.log(`[RagService] Prioritized document found by filename: ${targetFilename}`);
        } else {
            console.log(`[RagService] Document specified by filename not found: ${targetFilename}`);
            // Можна повернути порожній масив або продовжити звичайний пошук
        }
    }

    // 2. Якщо запит не лише ім'я файлу (або файл не знайдено), або результатів менше ліміту,
    //    проводимо пошук релевантності за рештою запиту серед УСІХ документів (крім вже доданого)
    const remainingLimit = limit - results.length;
    if (remainingLimit > 0 && query.trim().length > 0) {
         // Фільтруємо документи, які вже є в результатах (якщо був знайдений за іменем)
        const documentsToSearch = targetFilename
            ? this.documents.filter(doc => doc.metadata?.filename?.toLowerCase() !== targetFilename)
            : this.documents;

        const scoredDocs = documentsToSearch
          .map(doc => ({ doc, score: this.calculateRelevanceScore(doc, query) }))
          .filter(item => item.score > 0); // Відкидаємо документи з нульовим рахунком

        // Сортуємо за рахунком
        scoredDocs.sort((a, b) => b.score - a.score);

        // Додаємо до результатів, не перевищуючи ліміт
        results.push(...scoredDocs.slice(0, remainingLimit).map(item => ({...item.doc, score: item.score}))); // Додаємо score до результату
    } else if (remainingLimit > 0 && query.trim().length === 0 && results.length > 0) {
        // Якщо запит був ТІЛЬКИ ім'я файлу, і ми його знайшли,
        // можемо додати ще кілька документів для контексту (наприклад, ті, що часто змінювались разом)
        // Це складніша логіка, поки що пропустимо.
        console.log("[RagService] Query contained only filename, returning only that file.");
    }


    console.log(`[RagService] Found ${results.length} relevant documents for query.`);
    // Повертаємо унікальні документи (на випадок, якщо один і той же файл міг потрапити двічі)
    const uniqueResults = Array.from(new Map(results.map(doc => [doc.path, doc])).values());
    return uniqueResults; //.map(item => ({ ...item.doc, score: item.score })); // Повертаємо документи зі score
}


  /**
   * Prepare context from relevant documents, adding metadata markers
   */
  prepareContext(query: string): string {
    if (!this.plugin.settings.ragEnabled || this.documents.length === 0) {
      return "";
    }

    // Ліміт беремо з налаштувань, але можна передати інший при потребі
    const limit = this.plugin.settings.contextWindow || 5; // Значення за замовчуванням
    const relevantDocs = this.findRelevantDocuments(query, limit);

    if (relevantDocs.length === 0) {
      console.log("[RagService] No relevant documents found for context.");
      return "";
    }

    console.log(`[RagService] Preparing context from ${relevantDocs.length} documents.`);
    // Форматуємо контекст
    let context = "### Context from User Notes:\n\n"; // Більш описовий заголовок

    relevantDocs.forEach((doc, index) => {
      // Формуємо заголовок документа з метаданими
      let header = `--- Document ${index + 1}: ${doc.metadata?.filename || doc.path}`; // Показуємо шлях, якщо немає імені
      if (doc.metadata?.['personal-logs'] === true) {
          header += ` [Type: Personal Log]`;
      }
      // Можна додати інші метадані, наприклад, дату модифікації?
      // header += ` (Modified: ${new Date(doc.metadata?.modified || 0).toLocaleDateString()})`;
      header += ` ---\n`;

      context += header;

      // Використовуємо тіло документа, якщо воно є, або обрізаний повний контент
      const contentToUse = doc.body || doc.content;
      // Обрізаємо документи, якщо вони занадто довгі, щоб уникнути лімітів токенів
      // Ліміт можна винести в налаштування
      const maxCharsPerDoc = this.plugin.settings.maxCharsPerDoc || 1500;
      const truncatedContent = contentToUse.length > maxCharsPerDoc
        ? contentToUse.substring(0, maxCharsPerDoc) + "...\n[Content Truncated]"
        : contentToUse;

      context += truncatedContent + "\n\n";
    });

    context += "### End of Context\n\n";
    return context;
  }
}