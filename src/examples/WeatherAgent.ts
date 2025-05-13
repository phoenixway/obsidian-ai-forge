// src/agents/examples/WeatherAgent.ts
import OllamaPlugin from "@/main"; // Адаптуйте шлях
import { IAgent, IToolFunction } from "@/agents/IAgent";
import { Notice } from "obsidian"; // Можливо Notice знадобиться для повідомлень

// Приклад використання OpenWeatherMap API (потрібен API ключ!)
// ЗАМІНІТЬ "YOUR_OPENWEATHERMAP_API_KEY" на ВАШ СПРАВЖНІЙ API КЛЮЧ!
const OPENWEATHERMAP_API_KEY = "16771698f22a664fd02258a97d7f7fa8";
const OPENWEATHERMAP_BASE_URL = "https://api.openweathermap.org/data/2.5";

// Використовуємо окрему змінну для плейсхолдера, щоб уникнути попереджень статичного аналізу
const PLACEHOLDER_API_KEY_VALUE: string = "YOUR_OPENWEATHERMAP_API_KEY";


export class WeatherAgent implements IAgent {
  id = "weather-agent";
  name = "Weather Agent";
  description = "An agent that can fetch weather forecasts from the internet.";

  getTools(): IToolFunction[] {
    return [
      // ... (інструменти залишаються без змін)
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

    // Перевірка на плейсхолдер API ключа, використовуючи допоміжну змінну
    if (OPENWEATHERMAP_API_KEY === PLACEHOLDER_API_KEY_VALUE) {
         return `Помилка: Необхідно замінити '${PLACEHOLDER_API_KEY_VALUE}' на ваш справжній ключ OpenWeatherMap у коді агента WeatherAgent.`;
    }

    try {
      let url = '';
      let forecastData;

      url = `${OPENWEATHERMAP_BASE_URL}/forecast?q=${encodeURIComponent(location)}&units=metric&appid=${OPENWEATHERMAP_API_KEY}&lang=ua`; // Додаємо lang=ua для української мови

      const response = await fetch(url);

      if (!response.ok) {
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


      switch (toolName) {
        case "getWeatherToday": {
            // Знаходимо перший прогноз на сьогодні (може бути декілька записів за день)
            const todayForecasts = forecastData.filter((item: any) => {
                const itemDate = new Date(item.dt * 1000);
                 const compareDate = new Date(); // Порівнюємо з поточною датою без часу
                 compareDate.setHours(0,0,0,0);
                 return itemDate.setHours(0,0,0,0) === compareDate.getTime();
            });

            // Для "сьогодні" може бути корисно показати поточний або найближчий прогноз
            // Або просто перший доступний на сьогодні
             const firstTodayForecast = todayForecasts.length > 0 ? todayForecasts[0] : null;


            if (firstTodayForecast) {
                 const date = new Date(firstTodayForecast.dt * 1000).toLocaleDateString();
                 const time = new Date(firstTodayForecast.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                result += `Сьогодні (${date}, ${time}): ${firstTodayForecast.weather[0].description}, Температура: ${firstTodayForecast.main.temp}°C, Відчувається як: ${firstTodayForecast.main.feels_like}°C, Вологість: ${firstTodayForecast.main.humidity}%.`;
            } else {
                result += "Не вдалося знайти прогноз на сьогодні (можливо, всі прогнози на сьогодні вже пройшли за часом).";
            }
            break;
        }

        case "getWeatherTomorrow": {
             // Знаходимо перший прогноз на завтра
             const tomorrowForecasts = forecastData.filter((item: any) => {
                const itemDate = new Date(item.dt * 1000);
                 const compareDate = new Date();
                 compareDate.setDate(compareDate.getDate() + 1); // Завтра
                 compareDate.setHours(0,0,0,0);
                 return itemDate.setHours(0,0,0,0) === compareDate.getTime();
             });

             const firstTomorrowForecast = tomorrowForecasts.length > 0 ? tomorrowForecasts[0] : null;

             if (firstTomorrowForecast) {
                const date = new Date(firstTomorrowForecast.dt * 1000).toLocaleDateString();
                const time = new Date(firstTomorrowForecast.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                result += `Завтра (${date}, ${time}): ${firstTomorrowForecast.weather[0].description}, Температура: ${firstTomorrowForecast.main.temp}°C, Відчувається як: ${firstTomorrowForecast.main.feels_like}°C, Вологість: ${firstTomorrowForecast.main.humidity}%.`;
             } else {
                result += "Не вдалося знайти прогноз на завтра. API може не надавати дані так далеко вперед або для цього міста.";
             }
            break;
        }

        case "getWeather5Days": {
            const dailyForecasts: { [key: string]: any } = {};
            let daysCount = 0;
            const maxDays = 5; // OpenWeatherMap надає максимум 5 днів

            // Групуємо прогнози по днях, беручи перший запис за день
             for (const item of forecastData) {
                const itemDate = new Date(item.dt * 1000);
                 const dateString = itemDate.toLocaleDateString();

                 // Перевіряємо, чи це вже не пройдений час сьогодні
                 if (itemDate.getTime() < new Date().getTime() && itemDate.toDateString() === new Date().toDateString()) {
                     // Можна пропустити минулі прогнози на сьогодні, якщо ми шукаємо майбутні 5 днів
                     // Або включити перший доступний прогноз на сьогодні, якщо він є в forecastData
                     // Для 5 днів зазвичай беруть прогнози на наступні дні.
                     // Якщо сьогоднішній день ще попереду, перший прогноз на сьогодні буде включено
                 }

                const dayKey = new Date(item.dt * 1000).toDateString(); // Ключ для дня без часу

                if (!dailyForecasts[dayKey]) {
                    // Беремо перший доступний прогноз за цей день як представника дня
                    dailyForecasts[dayKey] = item;
                    daysCount++;
                }

                if (daysCount >= maxDays) {
                    break; // Зупиняємося після знаходження 5 днів
                }
            }

            if (Object.keys(dailyForecasts).length > 0) {
                 // Сортуємо дні по даті для коректного виведення
                 const sortedDays = Object.keys(dailyForecasts).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

                 for (const dayKey of sortedDays) {
                    const item = dailyForecasts[dayKey];
                     const date = new Date(item.dt * 1000).toLocaleDateString();
                     const dayOfWeek = new Date(item.dt * 1000).toLocaleDateString('uk-UA', { weekday: 'long' }); // День тижня українською
                     // Можна додати час прогнозу, якщо це перший запис за день
                    const time = new Date(item.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    result += `- ${dayOfWeek}, ${date} (${time}): ${item.weather[0].description}, Темп.: ${item.main.temp}°C, Волог.: ${item.main.humidity}%\n`;
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