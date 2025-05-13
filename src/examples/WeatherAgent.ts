// src/agents/examples/WeatherAgent.ts
import OllamaPlugin from "@/main"; // Адаптуйте шлях
import { IAgent, IToolFunction } from "@/agents/IAgent";
import { Notice } from "obsidian"; // Можливо Notice знадобиться для повідомлень

// Приклад використання OpenWeatherMap API (потрібен API ключ!)
const OPENWEATHERMAP_API_KEY = "16771698f22a664fd02258a97d7f7fa8"; // <<< ЗАМІНІТЬ НА ВАШ СПРАВЖНІЙ API КЛЮЧ!
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
    const location = args.location;

    if (!location || typeof location !== 'string') {
      return "Помилка: Аргумент 'location' відсутній або не є рядком.";
    }

    if (OPENWEATHERMAP_API_KEY === "16771698f22a664fd02258a97d7f7fa8") {
         return "Помилка: Необхідно замінити 'YOUR_OPENWEATHERMAP_API_KEY' на ваш справжній ключ OpenWeatherMap у коді агента.";
    }

    try {
      let url = '';
      let forecastData;

      // Використовуємо endpoint /forecast для всіх запитів, так як він дає дані на 5 днів з інтервалом 3 години
      // Потім ми відфільтруємо ці дані залежно від запиту (сьогодні, завтра, 5 днів)
      url = `${OPENWEATHERMAP_BASE_URL}/forecast?q=${encodeURIComponent(location)}&units=metric&appid=${OPENWEATHERMAP_API_KEY}&lang=ua`; // Додаємо lang=ua для української мови

      const response = await fetch(url);

      if (!response.ok) {
        // Спробуємо прочитати помилку з тіла відповіді, якщо API надає таку інформацію
         let errorBody = await response.text();
         try {
             const errorJson = JSON.parse(errorBody);
             if (errorJson.message) {
                 errorBody = errorJson.message;
             }
         } catch (e) {
             // Не JSON відповідь, ігноруємо
         }
        throw new Error(`Помилка HTTP: ${response.status} ${response.statusText}. Відповідь API: ${errorBody}`);
      }

      const data = await response.json();

      // Перевірка на помилки, специфічні для OpenWeatherMap (наприклад, місто не знайдено)
      if (data.cod !== "200") {
           throw new Error(`Помилка API: ${data.message || 'Невідома помилка API'}`);
      }


      forecastData = data.list; // Масив прогнозів кожні 3 години
      const city = data.city.name;


      let result = `Прогноз погоди для ${city}:\n\n`;
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Початок дня

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);


      switch (toolName) {
        case "getWeatherToday": {
            // Знаходимо перший прогноз, який відповідає сьогоднішній даті
            const todayForecast = forecastData.find((item: any) => {
                const itemDate = new Date(item.dt * 1000); // Перетворюємо timestamp у мілісекунди
                 itemDate.setHours(0, 0, 0, 0);
                 return itemDate.getTime() === today.getTime();
            });

            if (todayForecast) {
                result += `Сьогодні (${new Date(todayForecast.dt * 1000).toLocaleDateString()}): ${todayForecast.weather[0].description}, Температура: ${todayForecast.main.temp}°C, Відчувається як: ${todayForecast.main.feels_like}°C, Вологість: ${todayForecast.main.humidity}%.`;
            } else {
                result += "Не вдалося знайти прогноз на сьогодні.";
            }
            break;
        }

        case "getWeatherTomorrow": {
             // Знаходимо перший прогноз, який відповідає завтрашній даті
             const tomorrowForecast = forecastData.find((item: any) => {
                const itemDate = new Date(item.dt * 1000);
                 itemDate.setHours(0, 0, 0, 0);
                 return itemDate.getTime() === tomorrow.getTime();
             });

             if (tomorrowForecast) {
                result += `Завтра (${new Date(tomorrowForecast.dt * 1000).toLocaleDateString()}): ${tomorrowForecast.weather[0].description}, Температура: ${tomorrowForecast.main.temp}°C, Відчувається як: ${tomorrowForecast.main.feels_like}°C, Вологість: ${tomorrowForecast.main.humidity}%.`;
             } else {
                result += "Не вдалося знайти прогноз на завтра. API може не надавати дані так далеко вперед або для цього міста.";
             }
            break;
        }

        case "getWeather5Days": {
            const dailyForecasts: { [key: string]: any } = {};
            let daysCount = 0;
            const maxDays = 5;

            // Фільтруємо прогнози, щоб отримати перший запис для кожного з наступних 5 днів (починаючи з завтра)
             // Або включаючи сьогодні, якщо сьогоднішній запит дає повний день
             // Для простоти візьмемо перші 5 унікальних днів, які є після сьогодні (включно або наступні)
            for (const item of forecastData) {
                const itemDate = new Date(item.dt * 1000);
                 const dateString = itemDate.toLocaleDateString();

                 // Перевіряємо, чи це вже не пройдений час сьогодні
                 if (itemDate.getTime() < new Date().getTime() && new Date(itemDate).toDateString() === new Date().toDateString()) {
                     continue; // Пропускаємо минулі прогнози на сьогодні
                 }

                if (!dailyForecasts[dateString]) {
                    dailyForecasts[dateString] = item; // Беремо перший прогноз за день
                    daysCount++;
                }

                if (daysCount >= maxDays) {
                    break; // Зупиняємося після знаходження 5 днів
                }
            }

            if (Object.keys(dailyForecasts).length > 0) {
                 for (const dateString in dailyForecasts) {
                    const item = dailyForecasts[dateString];
                     const date = new Date(item.dt * 1000).toLocaleDateString();
                     const dayOfWeek = new Date(item.dt * 1000).toLocaleDateString('uk-UA', { weekday: 'long' }); // День тижня українською
                    result += `- ${dayOfWeek}, ${date}: ${item.weather[0].description}, Темп.: ${item.main.temp}°C, Волог.: ${item.main.humidity}%\n`;
                }
            } else {
                result += "Не вдалося отримати прогноз на 5 днів.";
            }
            break;
        }

        default:
          return `Помилка: Невідомий інструмент "${toolName}" для WeatherAgent.`;
      }

      // new Notice(`Agent fetched weather for: ${location}`); // Можна показати сповіщення
      return result;

    } catch (e: any) {
      plugin.logger.error(`[WeatherAgent] Помилка отримання погоди для ${location}:`, e);
      return `Помилка отримання погоди для "${location}": ${e.message}`;
    }
  }
}