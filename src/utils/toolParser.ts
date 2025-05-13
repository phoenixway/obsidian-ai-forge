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
      logger.warn("[toolParser] Input text is null, undefined, or not a string. Returning empty array.");
      return calls;
    }
  
    const openTag = "<tool_call>";
    const closeTag = "</tool_call>";
    let currentIndex = 0;
  
    logger.debug(`[toolParser] Starting to parse text for tool calls. Text length: ${text.length}`);
  
    while (currentIndex < text.length) {
      const openTagIndex = text.indexOf(openTag, currentIndex);
      if (openTagIndex === -1) {
        logger.debug("[toolParser] No more open <tool_call> tags found.");
        break; // Більше немає відкриваючих тегів
      }
  
      // Шукаємо закриваючий тег ПІСЛЯ поточного відкриваючого
      const closeTagIndex = text.indexOf(closeTag, openTagIndex + openTag.length);
      if (closeTagIndex === -1) {
        logger.warn(`[toolParser] Found an open <tool_call> tag at index ${openTagIndex} without a subsequent closing tag. Content preview: "${text.substring(openTagIndex, openTagIndex + 50)}..."`);
        break; 
      }
  
      const jsonString = text.substring(openTagIndex + openTag.length, closeTagIndex).trim();
      logger.debug(`[toolParser] Attempting to parse potential JSON string: "${jsonString.substring(0,100)}..."`);
      
      if (!jsonString) {
          logger.warn(`[toolParser] Empty content found between <tool_call> tags at index ${openTagIndex}. Skipping.`);
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
          logger.debug(`[toolParser] Successfully parsed tool call: ${parsedJson.name}`);
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
      logger.info(`[toolParser] Successfully parsed ${calls.length} textual tool call(s).`);
    } else if (text.includes(openTag)) {
      // Цей лог може бути корисним, якщо теги є, але жоден не містив валідного JSON
      logger.warn(`[toolParser] <tool_call> tags were present in the text, but no valid JSON tool calls were parsed.`);
    }
    return calls;
  }