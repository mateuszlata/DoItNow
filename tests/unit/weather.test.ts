import { describe, expect, it } from "vitest";
import { forecastFor, formatTemp, toWeatherPoints, weatherKind, weatherLabel } from "@/lib/weather";

const response = {
  hourly: {
    time: ["2026-10-18T16:00", "2026-10-18T17:00", "2026-10-18T18:00", "2026-10-18T19:00"],
    temperature_2m: [14.6, 13.4, 12.1, null],
    apparent_temperature: [12.9, 11.0, 9.8, null],
    precipitation_probability: [10, 45, 70, null],
    precipitation: [0, 0.2, 1.1, null],
    weather_code: [2, 61, 63, null],
    wind_speed_10m: [3.2, 4.1, 5.0, null],
    wind_gusts_10m: [6, 9.5, 12.3, null],
    is_day: [1, 0, 0, null],
  },
};

describe("weather", () => {
  it("turns Open-Meteo columns into hourly points", () => {
    const points = toWeatherPoints(response);
    expect(points).toHaveLength(3);
    expect(points[1]).toEqual({
      t: "2026-10-18T17:00:00Z",
      temp: 13.4,
      feels: 11,
      code: 61,
      day: false,
      precip: 0.2,
      prob: 45,
      wind: 4.1,
      gusts: 9.5,
    });
  });

  it("sums up the whole match: worst weather, top rain chance and total rain", () => {
    const points = toWeatherPoints(response);
    const match = forecastFor(points, new Date("2026-10-18T16:30:00Z"), 90);
    expect(match).toMatchObject({ code: 61, prob: 45, wind: 4.1, gusts: 9.5 });
    expect(match?.start.temp).toBe(14.6);
    expect(match?.precip).toBeCloseTo(0.2);
    expect(forecastFor(points, new Date("2026-10-18T18:00:00Z"), 60)).toMatchObject({ code: 63, prob: 70 });
    expect(forecastFor(points, new Date("2026-11-30T16:00:00Z"), 60)).toBeNull();
  });

  it("names the weather in Polish", () => {
    expect(weatherKind(96)).toBe("storm");
    expect(weatherKind(73)).toBe("snow");
    expect(weatherKind(51)).toBe("drizzle");
    expect(weatherKind(63)).toBe("rain");
    expect(weatherKind(2)).toBe("partly");
    expect(weatherLabel(0, false)).toBe("Bezchmurnie");
    expect(weatherLabel(0)).toBe("Słonecznie");
    expect(weatherLabel(65)).toBe("Ulewa");
    expect(weatherLabel(80)).toBe("Przelotny deszcz");
    expect(formatTemp(-0.4)).toBe("0°");
    expect(formatTemp(17.6)).toBe("18°");
  });
});
