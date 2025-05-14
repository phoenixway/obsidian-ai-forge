// src/agents/examples/TimeAgent.ts
import OllamaPlugin from "@/main"; // Адаптуйте шлях
import { IAgent, IToolFunction } from "@/agents/IAgent";
import { Notice } from "obsidian";

export class TimeAgent implements IAgent {
  id = "time-agent";
  name = "Time Agent";
  description = "An agent that can provide the current date and time.";

  getTools(): IToolFunction[] {
    return [
      {
        name: "getCurrentDateTime",
        description: "Gets the current date and time. Optionally, specify a format or locale.",
        parameters: {
          type: "object",
          properties: {
            format: {
              type: "string",
              description: "Optional. A format string: 'full' (default), 'dateonly', 'timeonly', 'iso'.",
              enum: ["full", "dateonly", "timeonly", "iso"], // Додаємо enum для валідації
            },
            locale: {
                type: "string",
                description: "Optional. A BCP 47 language tag (e.g., 'en-US', 'uk-UA', 'de-DE') for localized output. Defaults to system/browser locale.",
            }
            // TODO: Можна додати параметр 'timezone' в майбутньому, але це значно ускладнить реалізацію без бібліотек
          },
          // required: [] // Немає обов'язкових параметрів, якщо не вказано, поверне стандартний формат
        },
      },
      {
        name: "getCurrentTimestamp",
        description: "Gets the current Unix timestamp (seconds since Epoch) or ISO 8601 timestamp string.",
        parameters: {
            type: "object",
            properties: {
                type: {
                    type: "string",
                    description: "Optional. 'unix' (default) for seconds since epoch, or 'iso' for ISO 8601 string.",
                    enum: ["unix", "iso"]
                }
            }
        }
      }
    ];
  }

  async executeTool(toolName: string, args: any, plugin: OllamaPlugin): Promise<string> {
    const now = new Date();
    const userLocale = args?.locale || undefined; // Використовуємо локаль з аргументів або дефолтну системну

    switch (toolName) {
      case "getCurrentDateTime":
        const formatOption = args?.format || "full"; // За замовчуванням 'full'

        // Налаштування для форматування дати та часу
        const fullDateTimeOptions: Intl.DateTimeFormatOptions = {
          dateStyle: 'full', // e.g., Tuesday, December 17, 2019
          timeStyle: 'long',  // e.g., 12:00:00 AM PST
        };
        const dateOnlyOptions: Intl.DateTimeFormatOptions = {
          dateStyle: 'long', // e.g., December 17, 2019
        };
        const timeOnlyOptions: Intl.DateTimeFormatOptions = {
          timeStyle: 'medium', // e.g., 12:00:00 AM
        };

        try {
            switch (formatOption) {
              case "dateonly":
                new Notice("Time Agent: Provided current date.");
                return `Поточна дата: ${now.toLocaleDateString(userLocale, dateOnlyOptions)}`;
              case "timeonly":
                new Notice("Time Agent: Provided current time.");
                return `Поточний час: ${now.toLocaleTimeString(userLocale, timeOnlyOptions)}`;
              case "iso":
                new Notice("Time Agent: Provided ISO date-time.");
                return `Поточна дата та час (ISO 8601): ${now.toISOString()}`;
              case "full":
              default:
                new Notice("Time Agent: Provided current full date and time.");
                return `Поточна дата та час: ${now.toLocaleString(userLocale, fullDateTimeOptions)}`;
            }
        } catch (e: any) {
            plugin.logger.warn(`[TimeAgent] Error formatting date/time with locale '${userLocale}': ${e.message}. Falling back to default locale.`);
            // Якщо сталася помилка з локаллю (наприклад, вона не підтримується), повертаємо з системною локаллю
            switch (formatOption) {
                case "dateonly":
                  return `Поточна дата: ${now.toLocaleDateString(undefined, dateOnlyOptions)}`;
                case "timeonly":
                  return `Поточний час: ${now.toLocaleTimeString(undefined, timeOnlyOptions)}`;
                case "iso":
                  return `Поточна дата та час (ISO 8601): ${now.toISOString()}`;
                case "full":
                default:
                  return `Поточна дата та час: ${now.toLocaleString(undefined, fullDateTimeOptions)}`;
              }
        }

      case "getCurrentTimestamp":
        const timestampType = args?.type || "unix"; // За замовчуванням 'unix'
        if (timestampType === "iso") {
            new Notice("Time Agent: Provided ISO timestamp.");
            return `Поточний ISO 8601 Timestamp: ${now.toISOString()}`;
        } else { // "unix"
            new Notice("Time Agent: Provided Unix timestamp.");
            return `Поточний Unix Timestamp (секунди): ${Math.floor(now.getTime() / 1000)}`;
        }

      default:
        return `Error: Unknown tool "${toolName}" for TimeAgent.`;
    }
  }
}