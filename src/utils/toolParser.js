// src/utils/toolParser.ts
/**
 * Parses a text string to find and extract all valid textual tool_call blocks.
 * Each tool_call block is expected to be wrapped in <tool_call>...</tool_call> tags
 * and contain a valid JSON object with "name" and "arguments" properties.
 *
 * @param text The input string to parse.
 * @param logger A logger instance for logging errors or warnings.
 * @returns An array of parsed tool calls. Returns an empty array if no valid calls are found.
 */
export function parseAllTextualToolCalls(text, logger) {
    const calls = [];
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
        logger.debug(`[toolParser] Attempting to parse potential JSON string: "${jsonString.substring(0, 100)}..."`);
        if (!jsonString) {
            logger.warn(`[toolParser] Empty content found between <tool_call> tags at index ${openTagIndex}. Skipping.`);
            currentIndex = closeTagIndex + closeTag.length;
            continue;
        }
        try {
            const parsedJson = JSON.parse(jsonString);
            if (parsedJson &&
                typeof parsedJson.name === 'string' &&
                (typeof parsedJson.arguments === 'object' || parsedJson.arguments === undefined || parsedJson.arguments === null)) {
                calls.push({ name: parsedJson.name, arguments: parsedJson.arguments || {} });
                logger.debug(`[toolParser] Successfully parsed tool call: ${parsedJson.name}`);
            }
            else {
                logger.error("[toolParser] Parsed JSON does not match expected structure (name: string, arguments: object/undefined/null).", { jsonString, parsedJson });
            }
        }
        catch (e) {
            logger.error(`[toolParser] Failed to parse JSON from tool_call content. JSON string was: "${jsonString}". Error: ${e.message}`);
            // Не додаємо цей виклик, якщо JSON невалідний, і продовжуємо пошук наступних
        }
        currentIndex = closeTagIndex + closeTag.length; // Переходимо до наступного пошуку
    }
    if (calls.length > 0) {
        logger.info(`[toolParser] Successfully parsed ${calls.length} textual tool call(s).`);
    }
    else if (text.includes(openTag)) {
        // Цей лог може бути корисним, якщо теги є, але жоден не містив валідного JSON
        logger.warn(`[toolParser] <tool_call> tags were present in the text, but no valid JSON tool calls were parsed.`);
    }
    return calls;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbFBhcnNlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRvb2xQYXJzZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEJBQTBCO0FBZ0J4Qjs7Ozs7Ozs7R0FRRztBQUNILE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxJQUFZLEVBQUUsTUFBYztJQUNuRSxNQUFNLEtBQUssR0FBcUIsRUFBRSxDQUFDO0lBQ25DLElBQUksQ0FBQyxJQUFJLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDdEMsTUFBTSxDQUFDLElBQUksQ0FBQyxxRkFBcUYsQ0FBQyxDQUFDO1FBQ25HLE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztJQUVELE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQztJQUM5QixNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUM7SUFDaEMsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO0lBRXJCLE1BQU0sQ0FBQyxLQUFLLENBQUMsb0VBQW9FLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBRWhHLE9BQU8sWUFBWSxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNsQyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN6RCxJQUFJLFlBQVksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxLQUFLLENBQUMsbURBQW1ELENBQUMsQ0FBQztZQUNsRSxNQUFNLENBQUMsa0NBQWtDO1FBQzNDLENBQUM7UUFFRCx3REFBd0Q7UUFDeEQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsWUFBWSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1RSxJQUFJLGFBQWEsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sQ0FBQyxJQUFJLENBQUMsdURBQXVELFlBQVksd0RBQXdELElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLFlBQVksR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDOUwsTUFBTTtRQUNSLENBQUM7UUFFRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLGFBQWEsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3ZGLE1BQU0sQ0FBQyxLQUFLLENBQUMsNERBQTRELFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUU1RyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDZCxNQUFNLENBQUMsSUFBSSxDQUFDLHNFQUFzRSxZQUFZLGFBQWEsQ0FBQyxDQUFDO1lBQzdHLFlBQVksR0FBRyxhQUFhLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUMvQyxTQUFTO1FBQ2IsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDMUMsSUFBSSxVQUFVO2dCQUNWLE9BQU8sVUFBVSxDQUFDLElBQUksS0FBSyxRQUFRO2dCQUNuQyxDQUFDLE9BQU8sVUFBVSxDQUFDLFNBQVMsS0FBSyxRQUFRLElBQUksVUFBVSxDQUFDLFNBQVMsS0FBSyxTQUFTLElBQUksVUFBVSxDQUFDLFNBQVMsS0FBSyxJQUFJLENBQUMsRUFDaEgsQ0FBQztnQkFDSixLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFVBQVUsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLFVBQVUsQ0FBQyxTQUFTLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDN0UsTUFBTSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7WUFDakYsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE1BQU0sQ0FBQyxLQUFLLENBQUMsOEdBQThHLEVBQUUsRUFBQyxVQUFVLEVBQUUsVUFBVSxFQUFDLENBQUMsQ0FBQztZQUN6SixDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sQ0FBTSxFQUFFLENBQUM7WUFDaEIsTUFBTSxDQUFDLEtBQUssQ0FBQywrRUFBK0UsVUFBVSxhQUFhLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ2hJLDZFQUE2RTtRQUMvRSxDQUFDO1FBQ0QsWUFBWSxHQUFHLGFBQWEsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsa0NBQWtDO0lBQ3BGLENBQUM7SUFFRCxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDckIsTUFBTSxDQUFDLElBQUksQ0FBQyxvQ0FBb0MsS0FBSyxDQUFDLE1BQU0sd0JBQXdCLENBQUMsQ0FBQztJQUN4RixDQUFDO1NBQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDbEMsOEVBQThFO1FBQzlFLE1BQU0sQ0FBQyxJQUFJLENBQUMsbUdBQW1HLENBQUMsQ0FBQztJQUNuSCxDQUFDO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gc3JjL3V0aWxzL3Rvb2xQYXJzZXIudHNcblxuLy8g0J/RgNC40L/Rg9GB0LrQsNGU0LzQviwg0YnQviDRgyDQstCw0YEg0ZQg0LDQsdC+INCx0YPQtNC1INGC0LjQvyBMb2dnZXJcbi8vINCv0LrRidC+INC90ZYsINC80L7QttC10YLQtSDRgtC40LzRh9Cw0YHQvtCy0L4g0LLQuNC60L7RgNC40YHRgtC+0LLRg9Cy0LDRgtC4IGFueSDQsNCx0L4g0LLQuNC30L3QsNGH0LjRgtC4INC/0YDQvtGB0YLQuNC5INGW0L3RgtC10YDRhNC10LnRgSDRgtGD0YJcbmludGVyZmFjZSBMb2dnZXIge1xuICAgIGRlYnVnOiAobWVzc2FnZT86IGFueSwgLi4ub3B0aW9uYWxQYXJhbXM6IGFueVtdKSA9PiB2b2lkO1xuICAgIGluZm86IChtZXNzYWdlPzogYW55LCAuLi5vcHRpb25hbFBhcmFtczogYW55W10pID0+IHZvaWQ7XG4gICAgd2FybjogKG1lc3NhZ2U/OiBhbnksIC4uLm9wdGlvbmFsUGFyYW1zOiBhbnlbXSkgPT4gdm9pZDtcbiAgICBlcnJvcjogKG1lc3NhZ2U/OiBhbnksIC4uLm9wdGlvbmFsUGFyYW1zOiBhbnlbXSkgPT4gdm9pZDtcbiAgfVxuICBcbiAgZXhwb3J0IGludGVyZmFjZSBQYXJzZWRUb29sQ2FsbCB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGFyZ3VtZW50czogYW55OyAvLyDQnNC+0LbQvdCwINGD0YLQvtGH0L3QuNGC0Lgg0YLQuNC/LCDRj9C60YnQviDQstGW0LTQvtC80LAg0YHRgtGA0YPQutGC0YPRgNCwINCw0YDQs9GD0LzQtdC90YLRltCyXG4gIH1cbiAgXG4gIC8qKlxuICAgKiBQYXJzZXMgYSB0ZXh0IHN0cmluZyB0byBmaW5kIGFuZCBleHRyYWN0IGFsbCB2YWxpZCB0ZXh0dWFsIHRvb2xfY2FsbCBibG9ja3MuXG4gICAqIEVhY2ggdG9vbF9jYWxsIGJsb2NrIGlzIGV4cGVjdGVkIHRvIGJlIHdyYXBwZWQgaW4gPHRvb2xfY2FsbD4uLi48L3Rvb2xfY2FsbD4gdGFnc1xuICAgKiBhbmQgY29udGFpbiBhIHZhbGlkIEpTT04gb2JqZWN0IHdpdGggXCJuYW1lXCIgYW5kIFwiYXJndW1lbnRzXCIgcHJvcGVydGllcy5cbiAgICpcbiAgICogQHBhcmFtIHRleHQgVGhlIGlucHV0IHN0cmluZyB0byBwYXJzZS5cbiAgICogQHBhcmFtIGxvZ2dlciBBIGxvZ2dlciBpbnN0YW5jZSBmb3IgbG9nZ2luZyBlcnJvcnMgb3Igd2FybmluZ3MuXG4gICAqIEByZXR1cm5zIEFuIGFycmF5IG9mIHBhcnNlZCB0b29sIGNhbGxzLiBSZXR1cm5zIGFuIGVtcHR5IGFycmF5IGlmIG5vIHZhbGlkIGNhbGxzIGFyZSBmb3VuZC5cbiAgICovXG4gIGV4cG9ydCBmdW5jdGlvbiBwYXJzZUFsbFRleHR1YWxUb29sQ2FsbHModGV4dDogc3RyaW5nLCBsb2dnZXI6IExvZ2dlcik6IFBhcnNlZFRvb2xDYWxsW10ge1xuICAgIGNvbnN0IGNhbGxzOiBQYXJzZWRUb29sQ2FsbFtdID0gW107XG4gICAgaWYgKCF0ZXh0IHx8IHR5cGVvZiB0ZXh0ICE9PSAnc3RyaW5nJykge1xuICAgICAgbG9nZ2VyLndhcm4oXCJbdG9vbFBhcnNlcl0gSW5wdXQgdGV4dCBpcyBudWxsLCB1bmRlZmluZWQsIG9yIG5vdCBhIHN0cmluZy4gUmV0dXJuaW5nIGVtcHR5IGFycmF5LlwiKTtcbiAgICAgIHJldHVybiBjYWxscztcbiAgICB9XG4gIFxuICAgIGNvbnN0IG9wZW5UYWcgPSBcIjx0b29sX2NhbGw+XCI7XG4gICAgY29uc3QgY2xvc2VUYWcgPSBcIjwvdG9vbF9jYWxsPlwiO1xuICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xuICBcbiAgICBsb2dnZXIuZGVidWcoYFt0b29sUGFyc2VyXSBTdGFydGluZyB0byBwYXJzZSB0ZXh0IGZvciB0b29sIGNhbGxzLiBUZXh0IGxlbmd0aDogJHt0ZXh0Lmxlbmd0aH1gKTtcbiAgXG4gICAgd2hpbGUgKGN1cnJlbnRJbmRleCA8IHRleHQubGVuZ3RoKSB7XG4gICAgICBjb25zdCBvcGVuVGFnSW5kZXggPSB0ZXh0LmluZGV4T2Yob3BlblRhZywgY3VycmVudEluZGV4KTtcbiAgICAgIGlmIChvcGVuVGFnSW5kZXggPT09IC0xKSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhcIlt0b29sUGFyc2VyXSBObyBtb3JlIG9wZW4gPHRvb2xfY2FsbD4gdGFncyBmb3VuZC5cIik7XG4gICAgICAgIGJyZWFrOyAvLyDQkdGW0LvRjNGI0LUg0L3QtdC80LDRlCDQstGW0LTQutGA0LjQstCw0Y7Rh9C40YUg0YLQtdCz0ZbQslxuICAgICAgfVxuICBcbiAgICAgIC8vINCo0YPQutCw0ZTQvNC+INC30LDQutGA0LjQstCw0Y7Rh9C40Lkg0YLQtdCzINCf0IbQodCb0K8g0L/QvtGC0L7Rh9C90L7Qs9C+INCy0ZbQtNC60YDQuNCy0LDRjtGH0L7Qs9C+XG4gICAgICBjb25zdCBjbG9zZVRhZ0luZGV4ID0gdGV4dC5pbmRleE9mKGNsb3NlVGFnLCBvcGVuVGFnSW5kZXggKyBvcGVuVGFnLmxlbmd0aCk7XG4gICAgICBpZiAoY2xvc2VUYWdJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYFt0b29sUGFyc2VyXSBGb3VuZCBhbiBvcGVuIDx0b29sX2NhbGw+IHRhZyBhdCBpbmRleCAke29wZW5UYWdJbmRleH0gd2l0aG91dCBhIHN1YnNlcXVlbnQgY2xvc2luZyB0YWcuIENvbnRlbnQgcHJldmlldzogXCIke3RleHQuc3Vic3RyaW5nKG9wZW5UYWdJbmRleCwgb3BlblRhZ0luZGV4ICsgNTApfS4uLlwiYCk7XG4gICAgICAgIGJyZWFrOyBcbiAgICAgIH1cbiAgXG4gICAgICBjb25zdCBqc29uU3RyaW5nID0gdGV4dC5zdWJzdHJpbmcob3BlblRhZ0luZGV4ICsgb3BlblRhZy5sZW5ndGgsIGNsb3NlVGFnSW5kZXgpLnRyaW0oKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW3Rvb2xQYXJzZXJdIEF0dGVtcHRpbmcgdG8gcGFyc2UgcG90ZW50aWFsIEpTT04gc3RyaW5nOiBcIiR7anNvblN0cmluZy5zdWJzdHJpbmcoMCwxMDApfS4uLlwiYCk7XG4gICAgICBcbiAgICAgIGlmICghanNvblN0cmluZykge1xuICAgICAgICAgIGxvZ2dlci53YXJuKGBbdG9vbFBhcnNlcl0gRW1wdHkgY29udGVudCBmb3VuZCBiZXR3ZWVuIDx0b29sX2NhbGw+IHRhZ3MgYXQgaW5kZXggJHtvcGVuVGFnSW5kZXh9LiBTa2lwcGluZy5gKTtcbiAgICAgICAgICBjdXJyZW50SW5kZXggPSBjbG9zZVRhZ0luZGV4ICsgY2xvc2VUYWcubGVuZ3RoO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICBcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZEpzb24gPSBKU09OLnBhcnNlKGpzb25TdHJpbmcpO1xuICAgICAgICBpZiAocGFyc2VkSnNvbiAmJiBcbiAgICAgICAgICAgIHR5cGVvZiBwYXJzZWRKc29uLm5hbWUgPT09ICdzdHJpbmcnICYmIFxuICAgICAgICAgICAgKHR5cGVvZiBwYXJzZWRKc29uLmFyZ3VtZW50cyA9PT0gJ29iamVjdCcgfHwgcGFyc2VkSnNvbi5hcmd1bWVudHMgPT09IHVuZGVmaW5lZCB8fCBwYXJzZWRKc29uLmFyZ3VtZW50cyA9PT0gbnVsbClcbiAgICAgICAgICAgKSB7XG4gICAgICAgICAgY2FsbHMucHVzaCh7IG5hbWU6IHBhcnNlZEpzb24ubmFtZSwgYXJndW1lbnRzOiBwYXJzZWRKc29uLmFyZ3VtZW50cyB8fCB7fSB9KTtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoYFt0b29sUGFyc2VyXSBTdWNjZXNzZnVsbHkgcGFyc2VkIHRvb2wgY2FsbDogJHtwYXJzZWRKc29uLm5hbWV9YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKFwiW3Rvb2xQYXJzZXJdIFBhcnNlZCBKU09OIGRvZXMgbm90IG1hdGNoIGV4cGVjdGVkIHN0cnVjdHVyZSAobmFtZTogc3RyaW5nLCBhcmd1bWVudHM6IG9iamVjdC91bmRlZmluZWQvbnVsbCkuXCIsIHtqc29uU3RyaW5nLCBwYXJzZWRKc29ufSk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGU6IGFueSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYFt0b29sUGFyc2VyXSBGYWlsZWQgdG8gcGFyc2UgSlNPTiBmcm9tIHRvb2xfY2FsbCBjb250ZW50LiBKU09OIHN0cmluZyB3YXM6IFwiJHtqc29uU3RyaW5nfVwiLiBFcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICAgIC8vINCd0LUg0LTQvtC00LDRlNC80L4g0YbQtdC5INCy0LjQutC70LjQuiwg0Y/QutGJ0L4gSlNPTiDQvdC10LLQsNC70ZbQtNC90LjQuSwg0ZYg0L/RgNC+0LTQvtCy0LbRg9GU0LzQviDQv9C+0YjRg9C6INC90LDRgdGC0YPQv9C90LjRhVxuICAgICAgfVxuICAgICAgY3VycmVudEluZGV4ID0gY2xvc2VUYWdJbmRleCArIGNsb3NlVGFnLmxlbmd0aDsgLy8g0J/QtdGA0LXRhdC+0LTQuNC80L4g0LTQviDQvdCw0YHRgtGD0L/QvdC+0LPQviDQv9C+0YjRg9C60YNcbiAgICB9XG4gIFxuICAgIGlmIChjYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICBsb2dnZXIuaW5mbyhgW3Rvb2xQYXJzZXJdIFN1Y2Nlc3NmdWxseSBwYXJzZWQgJHtjYWxscy5sZW5ndGh9IHRleHR1YWwgdG9vbCBjYWxsKHMpLmApO1xuICAgIH0gZWxzZSBpZiAodGV4dC5pbmNsdWRlcyhvcGVuVGFnKSkge1xuICAgICAgLy8g0KbQtdC5INC70L7QsyDQvNC+0LbQtSDQsdGD0YLQuCDQutC+0YDQuNGB0L3QuNC8LCDRj9C60YnQviDRgtC10LPQuCDRlCwg0LDQu9C1INC20L7QtNC10L0g0L3QtSDQvNGW0YHRgtC40LIg0LLQsNC70ZbQtNC90L7Qs9C+IEpTT05cbiAgICAgIGxvZ2dlci53YXJuKGBbdG9vbFBhcnNlcl0gPHRvb2xfY2FsbD4gdGFncyB3ZXJlIHByZXNlbnQgaW4gdGhlIHRleHQsIGJ1dCBubyB2YWxpZCBKU09OIHRvb2wgY2FsbHMgd2VyZSBwYXJzZWQuYCk7XG4gICAgfVxuICAgIHJldHVybiBjYWxscztcbiAgfSJdfQ==