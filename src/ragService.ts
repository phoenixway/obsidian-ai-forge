// ragService.ts
import { TFile, Vault } from "obsidian";
import OllamaPlugin from "./main";

interface DocumentVector {
  path: string;
  content: string;
  metadata?: Record<string, any>;
}

export class RagService {
  private plugin: OllamaPlugin;
  private documents: DocumentVector[] = [];
  private isIndexing: boolean = false;

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
  }

  /**
   * Index all markdown files in the specified folder path
   */

  async indexDocuments(): Promise<void> {
    if (this.isIndexing) return;
    this.isIndexing = true;

    try {
      const folderPath = this.plugin.settings.ragFolderPath;
      const vault = this.plugin.app.vault;

      // Оновлюємо повідомлення для логування
      console.log(`AI Assistant path: "${folderPath}" (RAG documents will be loaded from here)`);
      const allFiles = vault.getFiles();
      console.log(`Total files in vault: ${allFiles.length}`);
      const files = await this.getMarkdownFiles(vault, folderPath);

      console.log(`Found ${files.length} markdown files from "${folderPath}"`);
      console.log(`Indexing ${files.length} markdown files from ${folderPath}`);
      this.documents = [];

      for (const file of files) {
        try {
          const content = await vault.read(file);
          this.documents.push({
            path: file.path,
            content,
            metadata: {
              filename: file.name,
              created: file.stat?.ctime,
              modified: file.stat?.mtime
            }
          });
        } catch (error) {
          console.error(`Error reading file ${file.path}:`, error);
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
   */
  private async getMarkdownFiles(vault: Vault, folderPath: string): Promise<TFile[]> {
    const files: TFile[] = [];

    // Перевіряємо, чи не порожній шлях
    if (!folderPath) {
      return files;
    }

    // Нормалізуємо шлях для порівняння
    let normalizedFolderPath = folderPath;
    if (!normalizedFolderPath.endsWith('/')) {
      normalizedFolderPath += '/';
    }

    // Завжди шукаємо тільки в підпапці "data" заданого шляху
    const dataFolderPath = normalizedFolderPath;

    console.log(`Looking for markdown files in: "${dataFolderPath}"`);

    // Get all files in the vault
    const allFiles = vault.getFiles();

    // Filter for markdown files in the data subfolder
    for (const file of allFiles) {
      if (file.extension === "md" && file.path.startsWith(dataFolderPath)) {
        console.log(`Adding file: ${file.path}`);
        files.push(file);
      }
    }

    return files;
  }

  /**
   * Simple search implementation to find relevant documents for a query
   * Later this could be replaced with a more sophisticated vector search
   */
  findRelevantDocuments(query: string, limit: number = 5): DocumentVector[] {
    if (!this.documents.length) {
      return [];
    }

    // Very basic relevance scoring - count term occurrences
    // This is a placeholder for a proper vector search implementation
    const scoredDocs = this.documents.map(doc => {
      const lowerContent = doc.content.toLowerCase();
      const lowerQuery = query.toLowerCase();

      // Split query into terms and count occurrences
      const terms = lowerQuery.split(/\s+/);
      let score = 0;

      for (const term of terms) {
        if (term.length > 2) { // Ignore very short terms
          const regex = new RegExp(term, 'gi');
          const matches = lowerContent.match(regex);
          if (matches) {
            score += matches.length;
          }
        }
      }

      return { doc, score };
    });

    // Sort by score descending and take top 'limit' results
    return scoredDocs
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.doc);
  }

  /**
   * Prepare context from relevant documents
   */
  prepareContext(query: string): string {
    if (!this.plugin.settings.ragEnabled || this.documents.length === 0) {
      return "";
    }

    const limit = this.plugin.settings.contextWindow;
    const relevantDocs = this.findRelevantDocuments(query, limit);

    if (relevantDocs.length === 0) {
      return "";
    }

    // Format the context
    let context = "### Context:\n\n";

    relevantDocs.forEach((doc, index) => {
      context += `Document ${index + 1} (${doc.metadata?.filename}):\n`;
      // Truncate documents if they're too long to avoid token limits
      const maxChars = 1500;
      const content = doc.content.length > maxChars
        ? doc.content.substring(0, maxChars) + "..."
        : doc.content;
      context += content + "\n\n";
    });

    context += "### End of context\n\n";
    return context;
  }
}