// src/utils/toolParser.ts

// Припускаємо, що у вас є або буде тип Logger
// Якщо ні, можете тимчасово використовувати any або визначити простий інтерфейс тут
interface Logger {
    debug: (message?: any, ...optionalParams: any[]) => void;
    info: (message?: any, ...optionalParams: any[]) => void;
    warn: (message?: any, ...optionalParams: any[]) => void;
    error: (message?: any, ...optionalParams: any[]) => void;
  }
  
  export interface ParsedToolCall {
    name: string;
    arguments: any; // Можна уточнити тип, якщо відома структура аргументів
  }
  
  /**
   * Parses a text string to find and extract all valid textual tool_call blocks.
   * Each tool_call block is expected to be wrapped in <tool_call>...</tool_call> tags
   * and contain a valid JSON object with "name" and "arguments" properties.
   *
   * @param text The input string to parse.
   * @param logger A logger instance for logging errors or warnings.
   * @returns An array of parsed tool calls. Returns an empty array if no valid calls are found.
   */
  export function parseAllTextualToolCalls(text: string, logger: Logger): ParsedToolCall[] {
    const calls: ParsedToolCall[] = [];
    if (!text || typeof text !== 'string') {
            return calls;
    }
  
    const openTag = "<tool_call>";
    const closeTag = "</tool_call>";
    let currentIndex = 0;
  
      
    while (currentIndex < text.length) {
      const openTagIndex = text.indexOf(openTag, currentIndex);
      if (openTagIndex === -1) {
                break; // Більше немає відкриваючих тегів
      }
  
      // Шукаємо закриваючий тег ПІСЛЯ поточного відкриваючого
      const closeTagIndex = text.indexOf(closeTag, openTagIndex + openTag.length);
      if (closeTagIndex === -1) {
                break; 
      }
  
      const jsonString = text.substring(openTagIndex + openTag.length, closeTagIndex).trim();
            
      if (!jsonString) {
                    currentIndex = closeTagIndex + closeTag.length;
          continue;
      }
  
      try {
        const parsedJson = JSON.parse(jsonString);
        if (parsedJson && 
            typeof parsedJson.name === 'string' && 
            (typeof parsedJson.arguments === 'object' || parsedJson.arguments === undefined || parsedJson.arguments === null)
           ) {
          calls.push({ name: parsedJson.name, arguments: parsedJson.arguments || {} });
                  } else {
          logger.error("[toolParser] Parsed JSON does not match expected structure (name: string, arguments: object/undefined/null).", {jsonString, parsedJson});
        }
      } catch (e: any) {
        logger.error(`[toolParser] Failed to parse JSON from tool_call content. JSON string was: "${jsonString}". Error: ${e.message}`);
        // Не додаємо цей виклик, якщо JSON невалідний, і продовжуємо пошук наступних
      }
      currentIndex = closeTagIndex + closeTag.length; // Переходимо до наступного пошуку
    }
  
    if (calls.length > 0) {
          } else if (text.includes(openTag)) {
      // Цей лог може бути корисним, якщо теги є, але жоден не містив валідного JSON
          }
    return calls;
  }