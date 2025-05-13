// src/agents/examples/WeatherAgent.ts
import OllamaPlugin from "@/main"; // Адаптуйте шлях
import { IAgent, IToolFunction } from "@/agents/IAgent";
import { Notice } from "obsidian";

// Приклад використання OpenWeatherMap API
const OPENWEATHERMAP_BASE_URL = "https://api.openweathermap.org/data/2.5";

export class WeatherAgent implements IAgent {
  id = "weather-agent";
  name = "Weather Agent";
  description = "An agent that can fetch weather forecasts from the internet.";

  getTools(): IToolFunction[] {
    return [
      {
        name: "getWeatherToday",
        description: "Gets today's weather forecast for a specified location.",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city name or location for the weather forecast (e.g., 'Kyiv', 'London').",
            },
          },
          required: ["location"],
        },
      },
      {
        name: "getWeatherTomorrow",
        description: "Gets tomorrow's weather forecast for a specified location.",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city name or location for the weather forecast.",
            },
          },
          required: ["location"],
        },
      },
      {
        name: "getWeather5Days",
        description: "Gets the weather forecast for the next 5 days for a specified location.",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city name or location for the weather forecast.",
            },
          },
          required: ["location"],
        },
      },
    ];
  }

  async executeTool(toolName: string, args: any, plugin: OllamaPlugin): Promise<string> {
    const apiKey = plugin.settings.openWeatherMapApiKey;
    let location = args.location;

    if (!apiKey || apiKey === "YOUR_OPENWEATHERMAP_API_KEY") {
      return "Помилка: Необхідно надати API ключ OpenWeatherMap у налаштуваннях плагіна Weather Agent.";
    }

    if (!location || typeof location !== 'string') {
      location = plugin.settings.weatherDefaultLocation;
      if (!location) {
        return "Помилка: Аргумент 'location' відсутній і локація за замовчуванням не встановлена в налаштуваннях.";
      }
    }

    try {
      let url = '';
      let result = '';
      let forecastData;

      url = `${OPENWEATHERMAP_BASE_URL}/forecast?q=${encodeURIComponent(location)}&units=metric&appid=${apiKey}&lang=ua`;

      const response = await fetch(url);

      if (!response.ok) {
        let errorBody = await response.text();
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.message) {
            errorBody = errorJson.message;
          }
        } catch (e) {
          // Not JSON response, ignore
        }
        throw new Error(`Помилка HTTP: ${response.status} ${response.statusText}. Відповідь API: ${errorBody}`);
      }

      const data = await response.json();

      if (data.cod !== "200") {
        throw new Error(`Помилка API: ${data.message || 'Невідома помилка API'}`);
      }

      forecastData = data.list;
      const city = data.city.name;

      result = `Прогноз погоди для ${city}:\n\n`;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Налаштування для форматування дати та часу
      const dateOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
      const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
      const dayOfWeekOptions: Intl.DateTimeFormatOptions = { weekday: 'long' };

      switch (toolName) {
        case "getWeatherToday": {
          const todayForecast = forecastData.find((item: any) => {
            const itemDate = new Date(item.dt * 1000);
            return itemDate >= now && itemDate.toDateString() === now.toDateString();
          }) || forecastData.find((item: any) => new Date(item.dt * 1000).toDateString() === now.toDateString());

          if (todayForecast) {
            const date = new Date(todayForecast.dt * 1000);
            const formattedDate = date.toLocaleDateString('uk-UA', dateOptions);
            const formattedTime = date.toLocaleTimeString('uk-UA', timeOptions);
            result += `Сьогодні (${formattedDate}, ${formattedTime}): ${todayForecast.weather[0].description}, Температура: ${todayForecast.main.temp}°C, Відчувається як: ${todayForecast.main.feels_like}°C, Вологість: ${todayForecast.main.humidity}%.`;
          } else {
            result += "Не вдалося знайти прогноз на сьогодні (можливо, всі прогнози на сьогодні вже пройшли за часом).";
          }
          break;
        }

        case "getWeatherTomorrow": {
          const tomorrowForecast = forecastData.find((item: any) => {
            const itemDate = new Date(item.dt * 1000);
            return itemDate.toDateString() === tomorrow.toDateString();
          });

          if (tomorrowForecast) {
            const date = new Date(tomorrowForecast.dt * 1000);
            const formattedDate = date.toLocaleDateString('uk-UA', dateOptions);
            const formattedTime = date.toLocaleTimeString('uk-UA', timeOptions);
            result += `Завтра (${formattedDate}, ${formattedTime}): ${tomorrowForecast.weather[0].description}, Температура: ${tomorrowForecast.main.temp}°C, Відчувається як: ${tomorrowForecast.main.feels_like}°C, Вологість: ${tomorrowForecast.main.humidity}%.`;
          } else {
            result += "Не вдалося знайти прогноз на завтра. API може не надавати дані так далеко вперед або для цього міста.";
          }
          break;
        }

        case "getWeather5Days": {
          const dailyForecasts: { [key: string]: any } = {};
          const processedDays: Set<string> = new Set();
          const now = new Date();
          let daysCount = 0;
          const maxDays = 5;

          for (const item of forecastData) {
            const itemDate = new Date(item.dt * 1000);
            const dayKey = itemDate.toDateString();

            if (itemDate.getTime() < now.getTime() && itemDate.toDateString() === now.toDateString() && processedDays.has(dayKey)) {
              continue;
            }

            if (!processedDays.has(dayKey)) {
              dailyForecasts[dayKey] = item;
              processedDays.add(dayKey);
              daysCount++;
            }

            if (daysCount >= maxDays) {
              break;
            }
          }

          if (Object.keys(dailyForecasts).length > 0) {
            const sortedDays = Object.keys(dailyForecasts).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

            for (const dayKey of sortedDays) {
              const item = dailyForecasts[dayKey];
              const date = new Date(item.dt * 1000);
              const formattedDate = date.toLocaleDateString('uk-UA', dateOptions);
              // Отримуємо день тижня українською
              const dayOfWeek = date.toLocaleDateString('uk-UA', dayOfWeekOptions);

              result += `- ${dayOfWeek}, ${formattedDate}: ${item.weather[0].description}, Темп.: ${item.main.temp}°C, Волог.: ${item.main.humidity}%\n`;
            }
          } else {
            result += "Не вдалося отримати прогноз на 5 днів.";
          }
          break;
        }

        default:
          return `Помилка: Невідомий інструмент "${toolName}" для WeatherAgent.`;
      }

      return result;

    } catch (e: any) {
      plugin.logger.error(`[WeatherAgent] Помилка отримання погоди для ${location}:`, e);
      return `Помилка отримання погоди для "${location}": ${e.message}`;
    }
  }
}