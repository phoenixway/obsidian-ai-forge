import OllamaPlugin from "@/main";

// src/agents/IAgent.ts
export interface IToolParameter {
    type: "string" | "number" | "boolean" | "object" | "array";
    description: string;
    enum?: string[];
    required?: boolean;
    properties?: Record<string, IToolParameter>; // Для об'єктів
    items?: IToolParameter; // Для масивів
  }
  
  export interface IToolFunction {
    name: string; // Унікальне ім'я інструменту в системі
    description: string; // Опис для LLM
    parameters: {
      type: "object";
      properties: Record<string, IToolParameter>;
      required?: string[];
    };
  }
  
  export interface IAgent {
    id: string; // Унікальний ID агента (напр., "file-system-agent")
    name: string; // Людочитабельна назва (напр., "File System Agent")
    description: string; // Опис агента (може бути корисним для вибору агента)
  
    /**
     * Повертає список інструментів, які надає цей агент.
     */
    getTools(): IToolFunction[];
  
    /**
     * Виконує вказаний інструмент з наданими аргументами.
     * @param toolName Назва інструменту, що викликається.
     * @param args Аргументи для інструменту.
     * @param plugin Посилання на екземпляр плагіна для доступу до сервісів.
     * @returns Проміс, що повертає рядок-результат виконання інструменту.
     */
    executeTool(toolName: string, args: any, plugin: OllamaPlugin): Promise<string>;
  }