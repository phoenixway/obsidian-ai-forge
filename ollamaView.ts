import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer } from "obsidian";
import OllamaPlugin from "./main";

import fetch from 'node-fetch';
import * as fs from 'fs/promises';
import * as faiss from 'faiss-node';
import { marked } from 'marked'; // Виправлений імпорт
import pdf from 'pdf-parse'; // Декларації типів повинні бути додані


export const VIEW_TYPE_OLLAMA = "ollama-chat-view";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface OllamaEmbeddingsResponse {
  embedding: number[];
}

interface OllamaGenerateResponse {
  response: string;
}

interface OllamaResponse {
  model: string;
  response: string;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

function isOllamaEmbeddingsResponse(obj: any): obj is OllamaEmbeddingsResponse {
  return typeof obj === 'object' && obj !== null &&
      Array.isArray(obj.embedding) && obj.embedding.every((item: number) => typeof item === 'number'); // Додаємо анотацію типу
}

function isOllamaGenerateResponse(obj: any): obj is OllamaGenerateResponse {
  return typeof obj === 'object' && obj !== null && typeof obj.response === 'string';
}

export class OllamaView extends ItemView {
  private plugin: OllamaPlugin;
  private chatContainerEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private chatContainer: HTMLElement;
  private messages: Message[] = [];
  private isProcessing: boolean = false;
  private historyLoaded: boolean = false;
  private scrollTimeout: NodeJS.Timeout | null = null;
  static instance: OllamaView | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: OllamaPlugin) {
    super(leaf);
    this.plugin = plugin;
    // Force singleton pattern
    if (OllamaView.instance) {
      return OllamaView.instance;
    }
    OllamaView.instance = this;
  }

  private index: faiss.IndexFlatL2 | undefined;
  private documents: string[] = [];

  async loadFiles(files: string[]): Promise<void> {
      this.documents = [];
      for (const file of files) {
          const text = await this.readFileContent(file);
          this.documents.push(text);
      }
  }

  private async readFileContent(filePath: string): Promise<string> {
      if (filePath.endsWith('.md')) {
          return this.readMdFile(filePath);
      } else if (filePath.endsWith('.pdf')) {
          return this.readPdfFile(filePath);
      } else {
          return fs.readFile(filePath, 'utf-8');
      }
  }

  private async readMdFile(filePath: string): Promise<string> {
    const mdContent = await fs.readFile(filePath, 'utf-8');
    const textContent = await marked.parse(mdContent); // Використовуємо await
    return textContent.replace(/<[^>]*>?/gm, '');
}

  private async readPdfFile(filePath: string): Promise<string> {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
  }


  
  private async createEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (const text of texts) {
        const response = await fetch('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama2',
                prompt: text
            })
        });
        const data = await response.json();

        if (isOllamaEmbeddingsResponse(data)) {
            embeddings.push(data.embedding);
        } else {
            console.error('Invalid Ollama embeddings response:', data);
            throw new Error('Invalid Ollama embeddings response');
        }
    }
    return embeddings;
}

private async createIndex(embeddings: number[][]): Promise<void> {
  const dimension = embeddings[0].length;
  this.index = new faiss.IndexFlatL2(dimension);
  this.index.add(embeddings.flat()); // Використовуємо flat()
}
private async findRelevantDocuments(questionEmbedding: number[][], k: number = 2): Promise<string[]> {
  if (!this.index) {
      throw new Error('Index not initialized. Call createIndex first.');
  }

  const searchResult = this.index.search(questionEmbedding.flat(), k);
  console.log("Search labels:", searchResult.labels);

  // Перевіряємо, чи labels є масивом, і конвертуємо його в масив, якщо потрібно
  const indices = Array.isArray(searchResult.labels[0]) ? searchResult.labels[0] : [searchResult.labels[0]];

  return indices.map(i => this.documents[i]);
}

async generateAnswer(question: string): Promise<string> {
  const questionEmbeddingResponse = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          model: 'llama2',
          prompt: question
      })
  });
  const questionEmbeddingData = await questionEmbeddingResponse.json();

  if (isOllamaEmbeddingsResponse(questionEmbeddingData)) {
      const questionEmbedding = [questionEmbeddingData.embedding];

      const relevantDocuments = await this.findRelevantDocuments(questionEmbedding);
      const context = relevantDocuments.join('\n');

      const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'llama2',
            prompt: `Контекст: ${context}\nПитання: ${question}`,
            stream: false
        })
    });
    const ollamaData = await ollamaResponse.json();

    if (isOllamaGenerateResponse(ollamaData)) {
        return ollamaData.response;
    } else {
        console.error('Invalid Ollama generate response:', ollamaData);
        throw new Error('Invalid Ollama generate response');
    }

  } else {
      console.error('Invalid Ollama embeddings response:', questionEmbeddingData);
      throw new Error('Invalid Ollama embeddings response');
  }
}


  async initialize(files: string[]): Promise<void> {
      await this.loadFiles(files);
      const embeddings = await this.createEmbeddings(this.documents);
      await this.createIndex(embeddings);
  }


  getViewType(): string {
    return VIEW_TYPE_OLLAMA;
  }

  getDisplayText(): string {
    return "Ollama Chat";
  }

  getIcon(): string {
    return "message-square"; // Та сама іконка, що використовується в рібоні
  }

  async onOpen(): Promise<void> {
    // Create main container
    this.chatContainerEl = this.contentEl.createDiv({ cls: "ollama-container" });

    // Create chat messages container
    this.chatContainer = this.chatContainerEl.createDiv({ cls: "ollama-chat-container" });

    // Create input container
    const inputContainer = this.chatContainerEl.createDiv({ cls: "chat-input-container" });

    // Create textarea for input
    this.inputEl = inputContainer.createEl("textarea", {
      attr: {
        placeholder: "Type a message...",
      },
    });
    // Create send button (moved before settings button)
    const sendButton = inputContainer.createEl("button", {
      cls: "send-button",
    });
    setIcon(sendButton, "send");
    // Create settings button (now after send button)
    const settingsButton = inputContainer.createEl("button", {
      cls: "settings-button",
    });
    setIcon(settingsButton, "settings");
    // Handle enter key to send message
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    // Handle settings button click
    settingsButton.addEventListener("click", () => {
      const setting = (this.app as any).setting;
      // setting.open();
      // setting.openTabById('obsidian-ollama-duet');
      setting.open('obsidian-ollama-duet');

    });

    // Handle send button click
    sendButton.addEventListener("click", () => {
      this.sendMessage();
    });

    // Load message history
    await this.loadMessageHistory();
  }

  async loadMessageHistory() {
    if (this.historyLoaded) return;

    try {
      const history = await this.plugin.loadMessageHistory();

      if (Array.isArray(history) && history.length > 0) {
        // Clear existing messages
        this.messages = [];
        this.chatContainer.empty();
        // Add each message from history
        for (const msg of history) {
          // Convert string timestamp to Date object
          const message = {
            ...msg,
            timestamp: new Date(msg.timestamp)
          };

          this.messages.push(message);
          this.renderMessage(message);
        }

        // Scroll to bottom after loading history
        this.guaranteedScrollToBottom();
      }

      this.historyLoaded = true;
    } catch (error) {
      console.error("Error loading message history:", error);
    }
  }

  async saveMessageHistory() {
    if (this.messages.length === 0) return;

    try {
      // Convert messages to a serializable format
      const serializedMessages = this.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString()
      }));
      await this.plugin.saveMessageHistory(JSON.stringify(serializedMessages));
    } catch (error) {
      console.error("Error saving message history:", error);
    }
  }

  guaranteedScrollToBottom(): void {
    // Clear any pending scroll operation
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    // Use requestAnimationFrame to ensure scroll happens after rendering
    requestAnimationFrame(() => {
      if (!this.chatContainer) return;

      // Log scroll values for debugging
      console.log("Scroll Top:", this.chatContainer.scrollTop);
      console.log("Scroll Height:", this.chatContainer.scrollHeight);

      // Scroll to bottom
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    });
  }

  async sendMessage(): Promise<void> {
    if (this.isProcessing) return;

    const content = this.inputEl.value.trim();
    if (!content) return;

    // Add user message to chat
    this.addMessage("user", content);

    // Clear input
    this.inputEl.value = "";

    // Process with Ollama API
    await this.processWithOllama(content);
  }



  addMessage(role: "user" | "assistant", content: string): void {
    const message: Message = {
      role,
      content,
      timestamp: new Date()
    };

    this.messages.push(message);
    this.renderMessage(message);

    // Save updated message history
    this.saveMessageHistory();

    // Guaranteed scroll to bottom after rendering
    setTimeout(() => {
      this.guaranteedScrollToBottom();
    }, 100); // Adjust timeout if necessary
  }

  renderMessage(message: Message): void {
    const isUser = message.role === "user";
    const isFirstInGroup = this.isFirstMessageInGroup(message);
    const isLastInGroup = this.isLastMessageInGroup(message);

    // Check if we need to create a new message group
    let messageGroup: HTMLElement;
    const lastGroup = this.chatContainer.lastElementChild;

    if (isFirstInGroup) {
      // Create a new message group
      messageGroup = this.chatContainer.createDiv({
        cls: `message-group ${isUser ? "user-message-group" : "ollama-message-group"}`
      });
    } else {
      // Use the last group
      messageGroup = lastGroup as HTMLElement;
    }

    // Create message element
    const messageEl = messageGroup.createDiv({
      cls: `message ${isUser ? "user-message bubble user-bubble" : "ollama-message bubble ollama-bubble"} ${isLastInGroup ? (isUser ? "user-message-tail" : "ollama-message-tail") : ""}`
    });

    // Create message content container
    const contentContainer = messageEl.createDiv({ cls: "message-content-container" });

    // Add message content
    const contentEl = contentContainer.createDiv({
      cls: "message-content"
    });

    // Render markdown for assistant messages, plain text for user
    if (message.role === "assistant") {
      // Parse and render markdown
      MarkdownRenderer.renderMarkdown(
        message.content,
        contentEl,
        '',
        this as any
      );
    } else {
      // For user messages, use plain text with line breaks
      message.content.split('\n').forEach((line, index, array) => {
        contentEl.createSpan({ text: line });
        if (index < array.length - 1) {
          contentEl.createEl('br');
        }
      });
    }

    // Add copy button
    const copyButton = contentContainer.createEl("button", {
      cls: "copy-button",
      attr: { title: "Скопіювати" }
    });
    setIcon(copyButton, "copy");

    // Add copy functionality
    copyButton.addEventListener("click", () => {
      navigator.clipboard.writeText(message.content);

      // Show feedback
      copyButton.setText("Copied!");
      setTimeout(() => {
        copyButton.empty();
        setIcon(copyButton, "copy");
      }, 2000);
    });

    // Add timestamp if last in group
    if (isLastInGroup) {
      messageEl.createDiv({
        cls: "message-timestamp",
        text: this.formatTime(message.timestamp)
      });
    }
  }

  isFirstMessageInGroup(message: Message): boolean {
    const index = this.messages.indexOf(message);
    if (index === 0) return true;
    const prevMessage = this.messages[index - 1];
    return prevMessage.role !== message.role;
  }

  isLastMessageInGroup(message: Message): boolean {
    const index = this.messages.indexOf(message);
    if (index === this.messages.length - 1) return true;
    const nextMessage = this.messages[index + 1];
    return nextMessage.role !== message.role;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async processWithOllama(content: string): Promise<void> {
    this.isProcessing = true;

    // Add a temporary "loading" message
    const loadingMessageEl = this.addLoadingMessage();

    // Execute the request
    setTimeout(async () => {
        try {
            // Get context from RAG if enabled
            let prompt = content;
            
            if (this.plugin.settings.ragEnabled) {
                // Make sure documents are indexed
                if (this.plugin.ragService.findRelevantDocuments("test").length === 0) {
                    await this.plugin.ragService.indexDocuments();
                }
                
                // Get context based on the query
                const ragContext = this.plugin.ragService.prepareContext(content);
                
                if (ragContext) {
                    // Combine context with prompt
                    prompt = `${ragContext}\n\nUser Query: ${content}\n\nPlease respond to the user's query based on the provided context. If the context doesn't contain relevant information, please state that and answer based on your general knowledge.`;
                }
            }
            
            // Use the API service instead of direct fetch
            const data = await this.plugin.apiService.generateResponse(
                this.plugin.settings.modelName, 
                prompt
            );

            // Update the UI
            if (loadingMessageEl && loadingMessageEl.parentNode) {
                loadingMessageEl.parentNode.removeChild(loadingMessageEl);
            }
            
            this.addMessage("assistant", data.response);
        } catch (error) {
            console.error("Error processing request with Ollama:", error);

            if (loadingMessageEl && loadingMessageEl.parentNode) {
                loadingMessageEl.parentNode.removeChild(loadingMessageEl);
            }
            
            this.addMessage(
                "assistant",
                "Connection error with Ollama. Please check the settings and ensure the server is running."
            );
        } finally {
            this.isProcessing = false;
        }
    }, 0);
}


    addLoadingMessage(): HTMLElement {
    const messageGroup = this.chatContainer.createDiv({
      cls: "message-group ollama-message-group"
    });

    const messageEl = messageGroup.createDiv({
      cls: "message ollama-message ollama-message-tail"
    });

    const dotsContainer = messageEl.createDiv({
      cls: "thinking-dots"
    });

    // Створюємо три точки
    for (let i = 0; i < 3; i++) {
      dotsContainer.createDiv({
        cls: "thinking-dot"
      });
    }

    // Scroll to bottom after adding loading indicator
    this.guaranteedScrollToBottom();

    return messageGroup;
  }

  async clearChatMessages() {
    this.messages = [];
    this.chatContainer.empty();
    this.historyLoaded = false;
  }
}