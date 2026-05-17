// Tool definitions for Claude (Anthropic format)

export const tools = [
  {
    name: "get_weather",
    description: "Get current weather and forecast for a location. Use when the user asks about weather, temperature, rain, humidity, wind, or asks how the weather will be in a specific place or time.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name, optionally with country. E.g., 'Tegucigalpa', 'Madrid Spain', 'New York'.",
        },
        forecast_days: {
          type: "integer",
          description: "Number of forecast days (1-7). Default 1 for today only. Use 2-7 for multi-day forecasts.",
          minimum: 1,
          maximum: 7,
        },
      },
      required: ["location"],
    },
  },
];

// Tool execution: given a tool name and input, return the result string

export async function executeTool(toolName: string, toolInput: any): Promise<string> {
  if (toolName === "get_weather") {
    return await getWeather(toolInput.location, toolInput.forecast_days || 1);
  }
  return `Error: unknown tool ${toolName}`;
}

async function getWeather(location: string, forecastDays: number): Promise<string> {
  try {
    // Step 1: Geocode the location name to lat/lon
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
    );
    
    if (!geoResp.ok) {
      return `Error: could not geocode location "${location}"`;
    }
    
    const geoData = await geoResp.json();
    
    if (!geoData.results || geoData.results.length === 0) {
      return `Error: location "${location}" not found`;
    }
    
    const place = geoData.results[0];
    const lat = place.latitude;
    const lon = place.longitude;
    const placeName = `${place.name}${place.country ? ', ' + place.country : ''}`;
    
    // Step 2: Get weather forecast
    const weatherResp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=${forecastDays}`
    );
    
    if (!weatherResp.ok) {
      return `Error: weather API failed for ${placeName}`;
    }
    
    const weatherData = await weatherResp.json();
    
    // Step 3: Format the response as text Claude can use
    const current = weatherData.current;
    const daily = weatherData.daily;
    
    let result = `Weather for ${placeName}:\n`;
    result += `Current: ${current.temperature_2m}°C (feels like ${current.apparent_temperature}°C), humidity ${current.relative_humidity_2m}%, wind ${current.wind_speed_10m} km/h\n`;
    result += `Weather code: ${current.weather_code} (use WMO interpretation: 0=clear, 1-3=partly cloudy, 45-48=fog, 51-67=rain, 71-77=snow, 80-82=showers, 95-99=thunderstorm)\n`;
    
    if (forecastDays > 1) {
      result += `\nForecast:\n`;
      for (let i = 0; i < forecastDays; i++) {
        result += `Day ${i + 1} (${daily.time[i]}): max ${daily.temperature_2m_max[i]}°C, min ${daily.temperature_2m_min[i]}°C, precipitation chance ${daily.precipitation_probability_max[i]}%\n`;
      }
    }
    
    return result;
  } catch (err: any) {
    return `Error: weather service unavailable (${err.message})`;
  }
}
