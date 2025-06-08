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

// export interface Message {
//     role: MessageRole;
//     content: string;
//     timestamp: Date;
//     type?: 'warning' | 'error' | 'info'; // Це поле вже є у вас

//     // ---> ДОДАЙТЕ/ОНОВІТЬ ЦІ ОПЦІОНАЛЬНІ ПОЛЯ <---
//     images?: string[];      // Якщо ви підтримуєте зображення (з вашого коду OllamaView)
//     tool_call_id?: string;  // Для відповідей від інструментів, зв'язує з ToolCall.id
//     name?: string;          // Для відповідей від інструментів (ім'я інструменту, що був викликаний)
//     tool_calls?: ToolCall[];// Для повідомлень асистента, що містять виклики інструментів
// }

export type MessageRole = "user" | "assistant" | "system" | "error" | "tool"; // "tool" було додано для відповідей інструментів
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

// ---> ДОДАЙТЕ ІНТЕРФЕЙС AssistantMessage <---
export interface AssistantMessage extends Message {
    role: "assistant";
    tool_calls?: ToolCall[];
  }

// --- Settings ---
export type AvatarType = 'initials' | 'icon';

// --- Інтерфейси Відповідей API Ollama ---
export interface OllamaGenerateResponse {
    model: string;
    created_at: string;
    response?: string; // Може бути відсутнім, якщо є tool_calls
    done: boolean;
    context?: number[];
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
    message?: AssistantMessage; // <--- ДОДАЙТЕ/ПЕРЕКОНАЙТЕСЬ, ЩО ЦЕЙ ТИП ОНОВЛЕНО
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

export interface OllamaDoneChunk {
    type: "done"; // Додаємо поле type
    model: string;
    created_at: string;
    // Інші поля, які можуть бути в цьому типі чанка, згідно з помилкою:
    context?: number[];
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
    // Важливо: цей тип НЕ МАЄ `done: boolean`, оскільки його `type: "done"` вже сигналізує про завершення.
    // Або, якщо він все ж має `done: true`, то можна додати `done: true;`
}

export interface OllamaErrorChunk {
    error: string;
}export interface OllamaToolCallsChunk {
    type: "tool_calls"; // Додаємо поле type для розрізнення
    calls: ToolCall[];
    // assistant_message_with_calls: AssistantMessage; // Це поле було в помилці, але може бути зайвим, якщо ми формуємо його самі
    model: string;
    created_at: string;
    done?: boolean; // <--- ЗРОБИМО `done` ОПЦІОНАЛЬНИМ ТУТ, або додамо, якщо він має бути
}

export interface OllamaGenerateChunk {
    model: string;
    created_at: string;
    response?: string; 
    done: boolean;    // <--- Якщо кожен GenerateChunk має це поле, залишаємо обов'язковим.
                      // Якщо `done` може бути відсутнім у проміжних, то `done?: boolean;`
                      // Але помилка вказує, що проблема з `tool_calls` чанком.
    context?: number[]; 
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

export type OllamaStreamChunk = 
    OllamaGenerateChunk | 
    OllamaErrorChunk | 
    OllamaToolCallsChunk |
    OllamaDoneChunk;

export interface ToolCallFunction {
    name: string;
    arguments: string; // JSON рядок аргументів
  }
  
  export interface ToolCall {
    type: "function"; // Наразі Ollama підтримує тільки 'function'
    id?: string;     // ID для зіставлення з відповіддю інструмента (не завжди є в Ollama)
    function: ToolCallFunction;
  }

  export type DocumentPreviewType = 'text' | 'markdown' | 'generic_file'; // Поки що три типи для простоти

export interface AttachedDocumentInfo {
  name: string;
  type: string; // MIME type or file extension (e.g., "text/plain", "application/pdf", "md")
  content: string | null; // Текстовий вміст (може бути null для бінарних файлів, де ми не витягуємо текст)
  previewType: DocumentPreviewType;
  size: number; // Розмір файлу в байтах
  // rawFile?: File; // Опціонально, якщо хочемо зберігати оригінал для майбутнього
}

export interface Message {
    role: MessageRole;
    content: string; // Основний текст повідомлення користувача
    timestamp: Date;
    type?: 'warning' | 'error' | 'info';

    images?: string[];
    tool_call_id?: string;
    name?: string;
    tool_calls?: ToolCall[];
    attachedDocuments?: AttachedDocumentInfo[];
}
