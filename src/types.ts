// src/types.ts

// --- Logging ---
export enum LogLevel {
    DEBUG = 1, INFO = 2, WARN = 3, ERROR = 4, NONE = 5
}
export interface LoggerSettings {
    consoleLogLevel: keyof typeof LogLevel;
    fileLoggingEnabled: boolean;
    fileLogLevel: keyof typeof LogLevel;
    logCallerInfo: boolean;
    logFilePath?: string;
    logFileMaxSizeMB?: number;
}

// --- RAG ---
export interface DocumentMetadata {
    path: string;
    filename?: string;
    created?: number;
    modified?: number;
    'personal-logs'?: boolean;
    [key: string]: any; // YAML frontmatter
}
export interface ChunkVector {
  text: string;
  vector: number[];
  metadata: DocumentMetadata;
  score?: number;
}

// --- Roles ---
export interface RoleDefinition {
    systemPrompt: string | null;
    isProductivityPersona: boolean;
}
export interface RoleInfo {
    name: string;
    path: string;
    isCustom: boolean;
}

// --- Chat ---
export interface Message {
    role: MessageRole;
    content: string;
    timestamp: Date;
}
export type MessageRole = "user" | "assistant" | "system" | "error";

export interface ChatMetadata {
    id: string;
    name: string;
    modelName: string; // Added based on usage
    selectedRolePath: string | null | undefined; // Allow null/undefined
    temperature: number; // Added based on usage
    createdAt: string; // ISO Date string
    lastModified: string; // ISO Date string
}
export interface ChatData {
    metadata: ChatMetadata;
    messages: Message[];
}
export type ChatConstructorSettings = Pick<import("./settings").OllamaPluginSettings, 'temperature' | 'modelName' | 'contextWindow'>; // Example


// --- Settings ---
export type AvatarType = 'initials' | 'icon';

// --- Інтерфейси Відповідей API Ollama (можна винести в types.ts) ---
export interface OllamaGenerateResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    context?: number[];
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

export interface OllamaShowResponse {
    license?: string;
    modelfile?: string;
    parameters?: string;
    template?: string;
    details?: { [key: string]: any; };
    [key: string]: any; // Для інших можливих полів
}

export interface OllamaEmbeddingsResponse { // Інтерфейс для відповіді /api/embeddings
    embedding: number[];
}

// У файл з типами (наприклад, types.ts або подібний) або на початок OllamaService.ts

/** Структура відповіді Ollama при /api/generate з stream: true */
export interface OllamaGenerateChunk {
    model: string;
    created_at: string;
    response?: string; // Текстова частина відповіді (може бути відсутня в першому/останньому чанку)
    done: boolean;    // Чи це останній чанк?

    // Додаткові поля, що можуть повертатися
    context?: number[]; // Опціонально: контекст для наступного запиту
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

/** Структура відповіді Ollama при помилці потоку */
export interface OllamaErrorChunk {
    error: string;
}

/** Тип, що об'єднує успішний чанк та помилку */
export type OllamaStreamChunk = OllamaGenerateChunk | OllamaErrorChunk;