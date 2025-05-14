import { __awaiter } from "tslib";
import { Notice } from "obsidian";
// Приклад використання OpenWeatherMap API
const OPENWEATHERMAP_BASE_URL = "https://api.openweathermap.org/data/2.5";
export class WeatherAgent {
    constructor() {
        this.id = "weather-agent";
        this.name = "Weather Agent";
        this.description = "An agent that can fetch weather forecasts from the internet.";
    }
    getTools() {
        return [
            {
                name: "getWeatherToday",
                description: "Gets today's weather forecast for a specified location. Uses default location from settings if not provided.",
                parameters: {
                    type: "object",
                    properties: {
                        location: {
                            type: "string",
                            description: "Optional. The city name or location for the weather forecast (e.g., 'Kyiv', 'London'). If omitted, uses default from settings.",
                        },
                    },
                    // required: ["location"], // ВИДАЛЯЄМО required, щоб AI міг викликати без локації
                },
            },
            {
                name: "getWeatherTomorrow",
                description: "Gets tomorrow's weather forecast for a specified location. Uses default location from settings if not provided.",
                parameters: {
                    type: "object",
                    properties: {
                        location: {
                            type: "string",
                            description: "Optional. The city name or location for the weather forecast. If omitted, uses default from settings.",
                        },
                    },
                    // required: ["location"], // ВИДАЛЯЄМО required
                },
            },
            {
                name: "getWeather5Days",
                description: "Gets the weather forecast for the next 5 days for a specified location. Uses default location from settings if not provided.",
                parameters: {
                    type: "object",
                    properties: {
                        location: {
                            type: "string",
                            description: "Optional. The city name or location for the weather forecast. If omitted, uses default from settings.",
                        },
                    },
                    // required: ["location"], // ВИДАЛЯЄМО required
                },
            },
        ];
    }
    executeTool(toolName, args, plugin) {
        return __awaiter(this, void 0, void 0, function* () {
            const apiKey = plugin.settings.openWeatherMapApiKey;
            let locationToUse = args === null || args === void 0 ? void 0 : args.location; // Використовуємо ?. для безпечного доступу
            if (!apiKey || apiKey === "YOUR_OPENWEATHERMAP_API_KEY") {
                return "Помилка: Необхідно надати API ключ OpenWeatherMap у налаштуваннях плагіна Weather Agent.";
            }
            // Якщо локація не надана в аргументах або є порожнім рядком, використовуємо дефолтну
            if (!locationToUse || typeof locationToUse !== 'string' || locationToUse.trim() === '') {
                locationToUse = plugin.settings.weatherDefaultLocation;
                if (!locationToUse || locationToUse.trim() === '') {
                    return "Помилка: Локація не вказана і локація за замовчуванням не встановлена в налаштуваннях.";
                }
                new Notice(`Використовується локація за замовчуванням: ${locationToUse}`); // Повідомляємо користувача
            }
            try {
                let url = '';
                let result = '';
                let forecastData;
                url = `${OPENWEATHERMAP_BASE_URL}/forecast?q=${encodeURIComponent(locationToUse)}&units=metric&appid=${apiKey}&lang=ua`;
                const response = yield fetch(url);
                if (!response.ok) {
                    let errorBody = yield response.text();
                    try {
                        const errorJson = JSON.parse(errorBody);
                        if (errorJson.message) {
                            errorBody = errorJson.message;
                        }
                    }
                    catch (e) {
                        // Not JSON response, ignore
                    }
                    throw new Error(`Помилка HTTP: ${response.status} ${response.statusText}. Відповідь API: ${errorBody}`);
                }
                const data = yield response.json();
                if (data.cod !== "200") {
                    throw new Error(`Помилка API: ${data.message || 'Невідома помилка API'}`);
                }
                forecastData = data.list;
                const city = data.city.name; // Отримуємо назву міста з відповіді API для точності
                result = `Прогноз погоди для ${city}:\n\n`; // Використовуємо назву міста з відповіді API
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
                const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
                const dayOfWeekOptions = { weekday: 'long' };
                switch (toolName) {
                    case "getWeatherToday": {
                        const todayForecast = forecastData.find((item) => {
                            const itemDate = new Date(item.dt * 1000);
                            return itemDate >= now && itemDate.toDateString() === now.toDateString();
                        }) || forecastData.find((item) => new Date(item.dt * 1000).toDateString() === now.toDateString());
                        if (todayForecast) {
                            const date = new Date(todayForecast.dt * 1000);
                            const formattedDate = date.toLocaleDateString('uk-UA', dateOptions);
                            const formattedTime = date.toLocaleTimeString('uk-UA', timeOptions);
                            result += `Сьогодні (${formattedDate}, ${formattedTime}): ${todayForecast.weather[0].description}, Температура: ${todayForecast.main.temp}°C, Відчувається як: ${todayForecast.main.feels_like}°C, Вологість: ${todayForecast.main.humidity}%.`;
                        }
                        else {
                            result += "Не вдалося знайти прогноз на сьогодні (можливо, всі прогнози на сьогодні вже пройшли за часом).";
                        }
                        break;
                    }
                    case "getWeatherTomorrow": {
                        const tomorrowForecast = forecastData.find((item) => {
                            const itemDate = new Date(item.dt * 1000);
                            return itemDate.toDateString() === tomorrow.toDateString();
                        });
                        if (tomorrowForecast) {
                            const date = new Date(tomorrowForecast.dt * 1000);
                            const formattedDate = date.toLocaleDateString('uk-UA', dateOptions);
                            const formattedTime = date.toLocaleTimeString('uk-UA', timeOptions);
                            result += `Завтра (${formattedDate}, ${formattedTime}): ${tomorrowForecast.weather[0].description}, Температура: ${tomorrowForecast.main.temp}°C, Відчувається як: ${tomorrowForecast.main.feels_like}°C, Вологість: ${tomorrowForecast.main.humidity}%.`;
                        }
                        else {
                            result += "Не вдалося знайти прогноз на завтра. API може не надавати дані так далеко вперед або для цього міста.";
                        }
                        break;
                    }
                    case "getWeather5Days": {
                        const dailyForecasts = {};
                        const processedDays = new Set();
                        const now = new Date(); // Поточний час для порівняння
                        let daysCount = 0;
                        const maxDays = 5;
                        for (const item of forecastData) {
                            const itemDate = new Date(item.dt * 1000);
                            const dayKey = itemDate.toDateString(); // Ключ для дня
                            // Пропускаємо минулі прогнози на сьогодні, якщо вже є один запис за цей день
                            if (itemDate.getTime() < now.getTime() && dayKey === now.toDateString() && processedDays.has(dayKey)) {
                                continue;
                            }
                            // Якщо це перший запис за цей день, додаємо його
                            if (!processedDays.has(dayKey)) {
                                // Для сьогоднішнього дня беремо лише ті прогнози, що ще не минули, або перший доступний
                                if (dayKey === now.toDateString() && itemDate.getTime() < now.getTime() && !Object.values(dailyForecasts).some(df => new Date(df.dt * 1000).toDateString() === dayKey)) {
                                    // Якщо це минулий час сьогодні і ще не було запису за сьогодні, беремо його
                                }
                                else if (dayKey === now.toDateString() && itemDate.getTime() < now.getTime()) {
                                    // Якщо це минулий час сьогодні, але вже був запис, пропускаємо
                                    continue;
                                }
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
                                const dayOfWeek = date.toLocaleDateString('uk-UA', dayOfWeekOptions);
                                result += `- ${dayOfWeek}, ${formattedDate}: ${item.weather[0].description}, Темп.: ${item.main.temp}°C, Волог.: ${item.main.humidity}%\n`;
                            }
                        }
                        else {
                            result += "Не вдалося отримати прогноз на 5 днів.";
                        }
                        break;
                    }
                    default:
                        return `Помилка: Невідомий інструмент "${toolName}" для WeatherAgent.`;
                }
                return result;
            }
            catch (e) {
                plugin.logger.error(`[WeatherAgent] Помилка отримання погоди для ${locationToUse}:`, e);
                return `Помилка отримання погоди для "${locationToUse}": ${e.message}`;
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiV2VhdGhlckFnZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiV2VhdGhlckFnZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFHQSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRWxDLDBDQUEwQztBQUMxQyxNQUFNLHVCQUF1QixHQUFHLHlDQUF5QyxDQUFDO0FBRTFFLE1BQU0sT0FBTyxZQUFZO0lBQXpCO1FBQ0UsT0FBRSxHQUFHLGVBQWUsQ0FBQztRQUNyQixTQUFJLEdBQUcsZUFBZSxDQUFDO1FBQ3ZCLGdCQUFXLEdBQUcsOERBQThELENBQUM7SUFpTi9FLENBQUM7SUEvTUMsUUFBUTtRQUNOLE9BQU87WUFDTDtnQkFDRSxJQUFJLEVBQUUsaUJBQWlCO2dCQUN2QixXQUFXLEVBQUUsOEdBQThHO2dCQUMzSCxVQUFVLEVBQUU7b0JBQ1YsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLFFBQVEsRUFBRTs0QkFDUixJQUFJLEVBQUUsUUFBUTs0QkFDZCxXQUFXLEVBQUUsZ0lBQWdJO3lCQUM5STtxQkFDRjtvQkFDRCxrRkFBa0Y7aUJBQ25GO2FBQ0Y7WUFDRDtnQkFDRSxJQUFJLEVBQUUsb0JBQW9CO2dCQUMxQixXQUFXLEVBQUUsaUhBQWlIO2dCQUM5SCxVQUFVLEVBQUU7b0JBQ1YsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLFFBQVEsRUFBRTs0QkFDUixJQUFJLEVBQUUsUUFBUTs0QkFDZCxXQUFXLEVBQUUsdUdBQXVHO3lCQUNySDtxQkFDRjtvQkFDRCxnREFBZ0Q7aUJBQ2pEO2FBQ0Y7WUFDRDtnQkFDRSxJQUFJLEVBQUUsaUJBQWlCO2dCQUN2QixXQUFXLEVBQUUsOEhBQThIO2dCQUMzSSxVQUFVLEVBQUU7b0JBQ1YsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsVUFBVSxFQUFFO3dCQUNWLFFBQVEsRUFBRTs0QkFDUixJQUFJLEVBQUUsUUFBUTs0QkFDZCxXQUFXLEVB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QUFDLENBQUM7NEJBRTdHLEtBQUssTUFBTSxNQUFNLElBQUksVUFBVSxFQUFFLENBQUM7Z0NBQ2hDLE1BQU0sSUFBSSxHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQ0FDcEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztnQ0FDdEMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQztnQ0FDcEUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO2dDQUVyRSxNQUFNLElBQUksS0FBSyxTQUFTLEtBQUssYUFBYSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxZQUFZLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxlQUFlLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxLQUFLLENBQUM7NEJBQzdJLENBQUM7d0JBQ0gsQ0FBQzs2QkFBTSxDQUFDOzRCQUNOLE1BQU0sSUFBSSx3Q0FBd0MsQ0FBQzt3QkFDckQsQ0FBQzt3QkFDRCxNQUFNO29CQUNSLENBQUM7b0JBRUQ7d0JBQ0UsT0FBTyxrQ0FBa0MsUUFBUSxxQkFBcUIsQ0FBQztnQkFDM0UsQ0FBQztnQkFFRCxPQUFPLE1BQU0sQ0FBQztZQUVoQixDQUFDO1lBQUMsT0FBTyxDQUFNLEVBQUUsQ0FBQztnQkFDaEIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsK0NBQStDLGFBQWEsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN4RixPQUFPLGlDQUFpQyxhQUFhLE1BQU0sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3pFLENBQUM7UUFDSCxDQUFDO0tBQUE7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbIi8vIHNyYy9hZ2VudHMvZXhhbXBsZXMvV2VhdGhlckFnZW50LnRzXG5pbXBvcnQgT2xsYW1hUGx1Z2luIGZyb20gXCJAL21haW5cIjsgLy8g0JDQtNCw0L/RgtGD0LnRgtC1INGI0LvRj9GFXG5pbXBvcnQgeyBJQWdlbnQsIElUb29sRnVuY3Rpb24gfSBmcm9tIFwiQC9hZ2VudHMvSUFnZW50XCI7XG5pbXBvcnQgeyBOb3RpY2UgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuLy8g0J/RgNC40LrQu9Cw0LQg0LLQuNC60L7RgNC40YHRgtCw0L3QvdGPIE9wZW5XZWF0aGVyTWFwIEFQSVxuY29uc3QgT1BFTldFQVRIRVJNQVBfQkFTRV9VUkwgPSBcImh0dHBzOi8vYXBpLm9wZW53ZWF0aGVybWFwLm9yZy9kYXRhLzIuNVwiO1xuXG5leHBvcnQgY2xhc3MgV2VhdGhlckFnZW50IGltcGxlbWVudHMgSUFnZW50IHtcbiAgaWQgPSBcIndlYXRoZXItYWdlbnRcIjtcbiAgbmFtZSA9IFwiV2VhdGhlciBBZ2VudFwiO1xuICBkZXNjcmlwdGlvbiA9IFwiQW4gYWdlbnQgdGhhdCBjYW4gZmV0Y2ggd2VhdGhlciBmb3JlY2FzdHMgZnJvbSB0aGUgaW50ZXJuZXQuXCI7XG5cbiAgZ2V0VG9vbHMoKTogSVRvb2xGdW5jdGlvbltdIHtcbiAgICByZXR1cm4gW1xuICAgICAge1xuICAgICAgICBuYW1lOiBcImdldFdlYXRoZXJUb2RheVwiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJHZXRzIHRvZGF5J3Mgd2VhdGhlciBmb3JlY2FzdCBmb3IgYSBzcGVjaWZpZWQgbG9jYXRpb24uIFVzZXMgZGVmYXVsdCBsb2NhdGlvbiBmcm9tIHNldHRpbmdzIGlmIG5vdCBwcm92aWRlZC5cIixcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIHR5cGU6IFwib2JqZWN0XCIsXG4gICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgbG9jYXRpb246IHsgLy8g0JfQsNC70LjRiNCw0ZTQvNC+INC/0LDRgNCw0LzQtdGC0YAsINCw0LvQtSDQstGW0L0g0LzQvtC20LUg0LHRg9GC0Lgg0L3QtSDQvdCw0LTQsNC90LjQuVxuICAgICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJPcHRpb25hbC4gVGhlIGNpdHkgbmFtZSBvciBsb2NhdGlvbiBmb3IgdGhlIHdlYXRoZXIgZm9yZWNhc3QgKGUuZy4sICdLeWl2JywgJ0xvbmRvbicpLiBJZiBvbWl0dGVkLCB1c2VzIGRlZmF1bHQgZnJvbSBzZXR0aW5ncy5cIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyByZXF1aXJlZDogW1wibG9jYXRpb25cIl0sIC8vINCS0JjQlNCQ0JvQr9CE0JzQniByZXF1aXJlZCwg0YnQvtCxIEFJINC80ZbQsyDQstC40LrQu9C40LrQsNGC0Lgg0LHQtdC3INC70L7QutCw0YbRltGXXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiBcImdldFdlYXRoZXJUb21vcnJvd1wiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJHZXRzIHRvbW9ycm93J3Mgd2VhdGhlciBmb3JlY2FzdCBmb3IgYSBzcGVjaWZpZWQgbG9jYXRpb24uIFVzZXMgZGVmYXVsdCBsb2NhdGlvbiBmcm9tIHNldHRpbmdzIGlmIG5vdCBwcm92aWRlZC5cIixcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIHR5cGU6IFwib2JqZWN0XCIsXG4gICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgbG9jYXRpb246IHtcbiAgICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiT3B0aW9uYWwuIFRoZSBjaXR5IG5hbWUgb3IgbG9jYXRpb24gZm9yIHRoZSB3ZWF0aGVyIGZvcmVjYXN0LiBJZiBvbWl0dGVkLCB1c2VzIGRlZmF1bHQgZnJvbSBzZXR0aW5ncy5cIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICAvLyByZXF1aXJlZDogW1wibG9jYXRpb25cIl0sIC8vINCS0JjQlNCQ0JvQr9CE0JzQniByZXF1aXJlZFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogXCJnZXRXZWF0aGVyNURheXNcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiR2V0cyB0aGUgd2VhdGhlciBmb3JlY2FzdCBmb3IgdGhlIG5leHQgNSBkYXlzIGZvciBhIHNwZWNpZmllZCBsb2NhdGlvbi4gVXNlcyBkZWZhdWx0IGxvY2F0aW9uIGZyb20gc2V0dGluZ3MgaWYgbm90IHByb3ZpZGVkLlwiLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgdHlwZTogXCJvYmplY3RcIixcbiAgICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgICBsb2NhdGlvbjoge1xuICAgICAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogXCJPcHRpb25hbC4gVGhlIGNpdHkgbmFtZSBvciBsb2NhdGlvbiBmb3IgdGhlIHdlYXRoZXIgZm9yZWNhc3QuIElmIG9taXR0ZWQsIHVzZXMgZGVmYXVsdCBmcm9tIHNldHRpbmdzLlwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIHJlcXVpcmVkOiBbXCJsb2NhdGlvblwiXSwgLy8g0JLQmNCU0JDQm9Cv0ITQnNCeIHJlcXVpcmVkXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIF07XG4gIH1cblxuICBhc3luYyBleGVjdXRlVG9vbCh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiBhbnksIHBsdWdpbjogT2xsYW1hUGx1Z2luKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBhcGlLZXkgPSBwbHVnaW4uc2V0dGluZ3Mub3BlbldlYXRoZXJNYXBBcGlLZXk7XG4gICAgbGV0IGxvY2F0aW9uVG9Vc2U6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGFyZ3M/LmxvY2F0aW9uOyAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+ID8uINC00LvRjyDQsdC10LfQv9C10YfQvdC+0LPQviDQtNC+0YHRgtGD0L/Rg1xuXG4gICAgaWYgKCFhcGlLZXkgfHwgYXBpS2V5ID09PSBcIllPVVJfT1BFTldFQVRIRVJNQVBfQVBJX0tFWVwiKSB7XG4gICAgICByZXR1cm4gXCLQn9C+0LzQuNC70LrQsDog0J3QtdC+0LHRhdGW0LTQvdC+INC90LDQtNCw0YLQuCBBUEkg0LrQu9GO0YcgT3BlbldlYXRoZXJNYXAg0YMg0L3QsNC70LDRiNGC0YPQstCw0L3QvdGP0YUg0L/Qu9Cw0LPRltC90LAgV2VhdGhlciBBZ2VudC5cIjtcbiAgICB9XG5cbiAgICAvLyDQr9C60YnQviDQu9C+0LrQsNGG0ZbRjyDQvdC1INC90LDQtNCw0L3QsCDQsiDQsNGA0LPRg9C80LXQvdGC0LDRhSDQsNCx0L4g0ZQg0L/QvtGA0L7QttC90ZbQvCDRgNGP0LTQutC+0LwsINCy0LjQutC+0YDQuNGB0YLQvtCy0YPRlNC80L4g0LTQtdGE0L7Qu9GC0L3Rg1xuICAgIGlmICghbG9jYXRpb25Ub1VzZSB8fCB0eXBlb2YgbG9jYXRpb25Ub1VzZSAhPT0gJ3N0cmluZycgfHwgbG9jYXRpb25Ub1VzZS50cmltKCkgPT09ICcnKSB7XG4gICAgICBsb2NhdGlvblRvVXNlID0gcGx1Z2luLnNldHRpbmdzLndlYXRoZXJEZWZhdWx0TG9jYXRpb247XG4gICAgICBpZiAoIWxvY2F0aW9uVG9Vc2UgfHwgbG9jYXRpb25Ub1VzZS50cmltKCkgPT09ICcnKSB7XG4gICAgICAgIHJldHVybiBcItCf0L7QvNC40LvQutCwOiDQm9C+0LrQsNGG0ZbRjyDQvdC1INCy0LrQsNC30LDQvdCwINGWINC70L7QutCw0YbRltGPINC30LAg0LfQsNC80L7QstGH0YPQstCw0L3QvdGP0Lwg0L3QtSDQstGB0YLQsNC90L7QstC70LXQvdCwINCyINC90LDQu9Cw0YjRgtGD0LLQsNC90L3Rj9GFLlwiO1xuICAgICAgfVxuICAgICAgbmV3IE5vdGljZShg0JLQuNC60L7RgNC40YHRgtC+0LLRg9GU0YLRjNGB0Y8g0LvQvtC60LDRhtGW0Y8g0LfQsCDQt9Cw0LzQvtCy0YfRg9Cy0LDQvdC90Y/QvDogJHtsb2NhdGlvblRvVXNlfWApOyAvLyDQn9C+0LLRltC00L7QvNC70Y/RlNC80L4g0LrQvtGA0LjRgdGC0YPQstCw0YfQsFxuICAgIH1cblxuXG4gICAgdHJ5IHtcbiAgICAgIGxldCB1cmwgPSAnJztcbiAgICAgIGxldCByZXN1bHQgPSAnJztcbiAgICAgIGxldCBmb3JlY2FzdERhdGE7XG5cbiAgICAgIHVybCA9IGAke09QRU5XRUFUSEVSTUFQX0JBU0VfVVJMfS9mb3JlY2FzdD9xPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGxvY2F0aW9uVG9Vc2UpfSZ1bml0cz1tZXRyaWMmYXBwaWQ9JHthcGlLZXl9Jmxhbmc9dWFgO1xuXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCk7XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgbGV0IGVycm9yQm9keSA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBlcnJvckpzb24gPSBKU09OLnBhcnNlKGVycm9yQm9keSk7XG4gICAgICAgICAgaWYgKGVycm9ySnNvbi5tZXNzYWdlKSB7XG4gICAgICAgICAgICBlcnJvckJvZHkgPSBlcnJvckpzb24ubWVzc2FnZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAvLyBOb3QgSlNPTiByZXNwb25zZSwgaWdub3JlXG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDQn9C+0LzQuNC70LrQsCBIVFRQOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fS4g0JLRltC00L/QvtCy0ZbQtNGMIEFQSTogJHtlcnJvckJvZHl9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cbiAgICAgIGlmIChkYXRhLmNvZCAhPT0gXCIyMDBcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYNCf0L7QvNC40LvQutCwIEFQSTogJHtkYXRhLm1lc3NhZ2UgfHwgJ9Cd0LXQstGW0LTQvtC80LAg0L/QvtC80LjQu9C60LAgQVBJJ31gKTtcbiAgICAgIH1cblxuICAgICAgZm9yZWNhc3REYXRhID0gZGF0YS5saXN0O1xuICAgICAgY29uc3QgY2l0eSA9IGRhdGEuY2l0eS5uYW1lOyAvLyDQntGC0YDQuNC80YPRlNC80L4g0L3QsNC30LLRgyDQvNGW0YHRgtCwINC3INCy0ZbQtNC/0L7QstGW0LTRliBBUEkg0LTQu9GPINGC0L7Rh9C90L7RgdGC0ZZcblxuICAgICAgcmVzdWx0ID0gYNCf0YDQvtCz0L3QvtC3INC/0L7Qs9C+0LTQuCDQtNC70Y8gJHtjaXR5fTpcXG5cXG5gOyAvLyDQktC40LrQvtGA0LjRgdGC0L7QstGD0ZTQvNC+INC90LDQt9Cy0YMg0LzRltGB0YLQsCDQtyDQstGW0LTQv9C+0LLRltC00ZYgQVBJXG5cbiAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKG5vdy5nZXRGdWxsWWVhcigpLCBub3cuZ2V0TW9udGgoKSwgbm93LmdldERhdGUoKSk7XG4gICAgICBjb25zdCB0b21vcnJvdyA9IG5ldyBEYXRlKHRvZGF5KTtcbiAgICAgIHRvbW9ycm93LnNldERhdGUodG9tb3Jyb3cuZ2V0RGF0ZSgpICsgMSk7XG5cbiAgICAgIGNvbnN0IGRhdGVPcHRpb25zOiBJbnRsLkRhdGVUaW1lRm9ybWF0T3B0aW9ucyA9IHsgZGF5OiAnMi1kaWdpdCcsIG1vbnRoOiAnMi1kaWdpdCcsIHllYXI6ICdudW1lcmljJyB9O1xuICAgICAgY29uc3QgdGltZU9wdGlvbnM6IEludGwuRGF0ZVRpbWVGb3JtYXRPcHRpb25zID0geyBob3VyOiAnMi1kaWdpdCcsIG1pbnV0ZTogJzItZGlnaXQnLCBob3VyMTI6IGZhbHNlIH07XG4gICAgICBjb25zdCBkYXlPZldlZWtPcHRpb25zOiBJbnRsLkRhdGVUaW1lRm9ybWF0T3B0aW9ucyA9IHsgd2Vla2RheTogJ2xvbmcnIH07XG5cbiAgICAgIHN3aXRjaCAodG9vbE5hbWUpIHtcbiAgICAgICAgY2FzZSBcImdldFdlYXRoZXJUb2RheVwiOiB7XG4gICAgICAgICAgY29uc3QgdG9kYXlGb3JlY2FzdCA9IGZvcmVjYXN0RGF0YS5maW5kKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1EYXRlID0gbmV3IERhdGUoaXRlbS5kdCAqIDEwMDApO1xuICAgICAgICAgICAgcmV0dXJuIGl0ZW1EYXRlID49IG5vdyAmJiBpdGVtRGF0ZS50b0RhdGVTdHJpbmcoKSA9PT0gbm93LnRvRGF0ZVN0cmluZygpO1xuICAgICAgICAgIH0pIHx8IGZvcmVjYXN0RGF0YS5maW5kKChpdGVtOiBhbnkpID0+IG5ldyBEYXRlKGl0ZW0uZHQgKiAxMDAwKS50b0RhdGVTdHJpbmcoKSA9PT0gbm93LnRvRGF0ZVN0cmluZygpKTtcblxuICAgICAgICAgIGlmICh0b2RheUZvcmVjYXN0KSB7XG4gICAgICAgICAgICBjb25zdCBkYXRlID0gbmV3IERhdGUodG9kYXlGb3JlY2FzdC5kdCAqIDEwMDApO1xuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGVkRGF0ZSA9IGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKCd1ay1VQScsIGRhdGVPcHRpb25zKTtcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRlZFRpbWUgPSBkYXRlLnRvTG9jYWxlVGltZVN0cmluZygndWstVUEnLCB0aW1lT3B0aW9ucyk7XG4gICAgICAgICAgICByZXN1bHQgKz0gYNCh0YzQvtCz0L7QtNC90ZYgKCR7Zm9ybWF0dGVkRGF0ZX0sICR7Zm9ybWF0dGVkVGltZX0pOiAke3RvZGF5Rm9yZWNhc3Qud2VhdGhlclswXS5kZXNjcmlwdGlvbn0sINCi0LXQvNC/0LXRgNCw0YLRg9GA0LA6ICR7dG9kYXlGb3JlY2FzdC5tYWluLnRlbXB9wrBDLCDQktGW0LTRh9GD0LLQsNGU0YLRjNGB0Y8g0Y/QujogJHt0b2RheUZvcmVjYXN0Lm1haW4uZmVlbHNfbGlrZX3CsEMsINCS0L7Qu9C+0LPRltGB0YLRjDogJHt0b2RheUZvcmVjYXN0Lm1haW4uaHVtaWRpdHl9JS5gO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHQgKz0gXCLQndC1INCy0LTQsNC70L7RgdGPINC30L3QsNC50YLQuCDQv9GA0L7Qs9C90L7QtyDQvdCwINGB0YzQvtCz0L7QtNC90ZYgKNC80L7QttC70LjQstC+LCDQstGB0ZYg0L/RgNC+0LPQvdC+0LfQuCDQvdCwINGB0YzQvtCz0L7QtNC90ZYg0LLQttC1INC/0YDQvtC50YjQu9C4INC30LAg0YfQsNGB0L7QvCkuXCI7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgY2FzZSBcImdldFdlYXRoZXJUb21vcnJvd1wiOiB7XG4gICAgICAgICAgY29uc3QgdG9tb3Jyb3dGb3JlY2FzdCA9IGZvcmVjYXN0RGF0YS5maW5kKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1EYXRlID0gbmV3IERhdGUoaXRlbS5kdCAqIDEwMDApO1xuICAgICAgICAgICAgcmV0dXJuIGl0ZW1EYXRlLnRvRGF0ZVN0cmluZygpID09PSB0b21vcnJvdy50b0RhdGVTdHJpbmcoKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmICh0b21vcnJvd0ZvcmVjYXN0KSB7XG4gICAgICAgICAgICBjb25zdCBkYXRlID0gbmV3IERhdGUodG9tb3Jyb3dGb3JlY2FzdC5kdCAqIDEwMDApO1xuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGVkRGF0ZSA9IGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKCd1ay1VQScsIGRhdGVPcHRpb25zKTtcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRlZFRpbWUgPSBkYXRlLnRvTG9jYWxlVGltZVN0cmluZygndWstVUEnLCB0aW1lT3B0aW9ucyk7XG4gICAgICAgICAgICByZXN1bHQgKz0gYNCX0LDQstGC0YDQsCAoJHtmb3JtYXR0ZWREYXRlfSwgJHtmb3JtYXR0ZWRUaW1lfSk6ICR7dG9tb3Jyb3dGb3JlY2FzdC53ZWF0aGVyWzBdLmRlc2NyaXB0aW9ufSwg0KLQtdC80L/QtdGA0LDRgtGD0YDQsDogJHt0b21vcnJvd0ZvcmVjYXN0Lm1haW4udGVtcH3CsEMsINCS0ZbQtNGH0YPQstCw0ZTRgtGM0YHRjyDRj9C6OiAke3RvbW9ycm93Rm9yZWNhc3QubWFpbi5mZWVsc19saWtlfcKwQywg0JLQvtC70L7Qs9GW0YHRgtGMOiAke3RvbW9ycm93Rm9yZWNhc3QubWFpbi5odW1pZGl0eX0lLmA7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdCArPSBcItCd0LUg0LLQtNCw0LvQvtGB0Y8g0LfQvdCw0LnRgtC4INC/0YDQvtCz0L3QvtC3INC90LAg0LfQsNCy0YLRgNCwLiBBUEkg0LzQvtC20LUg0L3QtSDQvdCw0LTQsNCy0LDRgtC4INC00LDQvdGWINGC0LDQuiDQtNCw0LvQtdC60L4g0LLQv9C10YDQtdC0INCw0LHQviDQtNC70Y8g0YbRjNC+0LPQviDQvNGW0YHRgtCwLlwiO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGNhc2UgXCJnZXRXZWF0aGVyNURheXNcIjoge1xuICAgICAgICAgIGNvbnN0IGRhaWx5Rm9yZWNhc3RzOiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0ge307XG4gICAgICAgICAgY29uc3QgcHJvY2Vzc2VkRGF5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG4gICAgICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTsgLy8g0J/QvtGC0L7Rh9C90LjQuSDRh9Cw0YEg0LTQu9GPINC/0L7RgNGW0LLQvdGP0L3QvdGPXG4gICAgICAgICAgbGV0IGRheXNDb3VudCA9IDA7XG4gICAgICAgICAgY29uc3QgbWF4RGF5cyA9IDU7XG5cbiAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZm9yZWNhc3REYXRhKSB7XG4gICAgICAgICAgICBjb25zdCBpdGVtRGF0ZSA9IG5ldyBEYXRlKGl0ZW0uZHQgKiAxMDAwKTtcbiAgICAgICAgICAgIGNvbnN0IGRheUtleSA9IGl0ZW1EYXRlLnRvRGF0ZVN0cmluZygpOyAvLyDQmtC70Y7RhyDQtNC70Y8g0LTQvdGPXG5cbiAgICAgICAgICAgIC8vINCf0YDQvtC/0YPRgdC60LDRlNC80L4g0LzQuNC90YPQu9GWINC/0YDQvtCz0L3QvtC30Lgg0L3QsCDRgdGM0L7Qs9C+0LTQvdGWLCDRj9C60YnQviDQstC20LUg0ZQg0L7QtNC40L0g0LfQsNC/0LjRgSDQt9CwINGG0LXQuSDQtNC10L3RjFxuICAgICAgICAgICAgaWYgKGl0ZW1EYXRlLmdldFRpbWUoKSA8IG5vdy5nZXRUaW1lKCkgJiYgZGF5S2V5ID09PSBub3cudG9EYXRlU3RyaW5nKCkgJiYgcHJvY2Vzc2VkRGF5cy5oYXMoZGF5S2V5KSkge1xuICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8g0K/QutGJ0L4g0YbQtSDQv9C10YDRiNC40Lkg0LfQsNC/0LjRgSDQt9CwINGG0LXQuSDQtNC10L3RjCwg0LTQvtC00LDRlNC80L4g0LnQvtCz0L5cbiAgICAgICAgICAgIGlmICghcHJvY2Vzc2VkRGF5cy5oYXMoZGF5S2V5KSkge1xuICAgICAgICAgICAgICAvLyDQlNC70Y8g0YHRjNC+0LPQvtC00L3RltGI0L3RjNC+0LPQviDQtNC90Y8g0LHQtdGA0LXQvNC+INC70LjRiNC1INGC0ZYg0L/RgNC+0LPQvdC+0LfQuCwg0YnQviDRidC1INC90LUg0LzQuNC90YPQu9C4LCDQsNCx0L4g0L/QtdGA0YjQuNC5INC00L7RgdGC0YPQv9C90LjQuVxuICAgICAgICAgICAgICBpZiAoZGF5S2V5ID09PSBub3cudG9EYXRlU3RyaW5nKCkgJiYgaXRlbURhdGUuZ2V0VGltZSgpIDwgbm93LmdldFRpbWUoKSAmJiAhT2JqZWN0LnZhbHVlcyhkYWlseUZvcmVjYXN0cykuc29tZShkZiA9PiBuZXcgRGF0ZShkZi5kdCAqIDEwMDApLnRvRGF0ZVN0cmluZygpID09PSBkYXlLZXkpKSB7XG4gICAgICAgICAgICAgICAgLy8g0K/QutGJ0L4g0YbQtSDQvNC40L3Rg9C70LjQuSDRh9Cw0YEg0YHRjNC+0LPQvtC00L3RliDRliDRidC1INC90LUg0LHRg9C70L4g0LfQsNC/0LjRgdGDINC30LAg0YHRjNC+0LPQvtC00L3Rliwg0LHQtdGA0LXQvNC+INC50L7Qs9C+XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoZGF5S2V5ID09PSBub3cudG9EYXRlU3RyaW5nKCkgJiYgaXRlbURhdGUuZ2V0VGltZSgpIDwgbm93LmdldFRpbWUoKSkge1xuICAgICAgICAgICAgICAgIC8vINCv0LrRidC+INGG0LUg0LzQuNC90YPQu9C40Lkg0YfQsNGBINGB0YzQvtCz0L7QtNC90ZYsINCw0LvQtSDQstC20LUg0LHRg9CyINC30LDQv9C40YEsINC/0YDQvtC/0YPRgdC60LDRlNC80L5cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGRhaWx5Rm9yZWNhc3RzW2RheUtleV0gPSBpdGVtO1xuICAgICAgICAgICAgICBwcm9jZXNzZWREYXlzLmFkZChkYXlLZXkpO1xuICAgICAgICAgICAgICBkYXlzQ291bnQrKztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRheXNDb3VudCA+PSBtYXhEYXlzKSB7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuXG4gICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGRhaWx5Rm9yZWNhc3RzKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBzb3J0ZWREYXlzID0gT2JqZWN0LmtleXMoZGFpbHlGb3JlY2FzdHMpLnNvcnQoKGEsIGIpID0+IG5ldyBEYXRlKGEpLmdldFRpbWUoKSAtIG5ldyBEYXRlKGIpLmdldFRpbWUoKSk7XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgZGF5S2V5IG9mIHNvcnRlZERheXMpIHtcbiAgICAgICAgICAgICAgY29uc3QgaXRlbSA9IGRhaWx5Rm9yZWNhc3RzW2RheUtleV07XG4gICAgICAgICAgICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShpdGVtLmR0ICogMTAwMCk7XG4gICAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRlZERhdGUgPSBkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZygndWstVUEnLCBkYXRlT3B0aW9ucyk7XG4gICAgICAgICAgICAgIGNvbnN0IGRheU9mV2VlayA9IGRhdGUudG9Mb2NhbGVEYXRlU3RyaW5nKCd1ay1VQScsIGRheU9mV2Vla09wdGlvbnMpO1xuXG4gICAgICAgICAgICAgIHJlc3VsdCArPSBgLSAke2RheU9mV2Vla30sICR7Zm9ybWF0dGVkRGF0ZX06ICR7aXRlbS53ZWF0aGVyWzBdLmRlc2NyaXB0aW9ufSwg0KLQtdC80L8uOiAke2l0ZW0ubWFpbi50ZW1wfcKwQywg0JLQvtC70L7Qsy46ICR7aXRlbS5tYWluLmh1bWlkaXR5fSVcXG5gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHQgKz0gXCLQndC1INCy0LTQsNC70L7RgdGPINC+0YLRgNC40LzQsNGC0Lgg0L/RgNC+0LPQvdC+0Lcg0L3QsCA1INC00L3RltCyLlwiO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgcmV0dXJuIGDQn9C+0LzQuNC70LrQsDog0J3QtdCy0ZbQtNC+0LzQuNC5INGW0L3RgdGC0YDRg9C80LXQvdGCIFwiJHt0b29sTmFtZX1cIiDQtNC70Y8gV2VhdGhlckFnZW50LmA7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG5cbiAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgIHBsdWdpbi5sb2dnZXIuZXJyb3IoYFtXZWF0aGVyQWdlbnRdINCf0L7QvNC40LvQutCwINC+0YLRgNC40LzQsNC90L3RjyDQv9C+0LPQvtC00Lgg0LTQu9GPICR7bG9jYXRpb25Ub1VzZX06YCwgZSk7XG4gICAgICByZXR1cm4gYNCf0L7QvNC40LvQutCwINC+0YLRgNC40LzQsNC90L3RjyDQv9C+0LPQvtC00Lgg0LTQu9GPIFwiJHtsb2NhdGlvblRvVXNlfVwiOiAke2UubWVzc2FnZX1gO1xuICAgIH1cbiAgfVxufSJdfQ==