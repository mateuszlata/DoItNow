import { describe, expect, it } from "vitest";
import { forecastAt, formatTemp, toWeatherPoints, weatherKind, weatherLabel } from "@/lib/weather";

const response = {
  properties: {
    timeseries: [
      {
        time: "2026-10-18T16:00:00Z",
        data: {
          instant: { details: { air_temperature: 14.6, wind_speed: 3.2 } },
          next_1_hours: { summary: { symbol_code: "lightrain" }, details: { precipitation_amount: 0.4 } },
        },
      },
      {
        time: "2026-10-18T17:00:00Z",
        data: {
          instant: { details: { air_temperature: 13.4, wind_speed: 2.1 } },
          next_6_hours: { summary: { symbol_code: "partlycloudy_night" }, details: { precipitation_amount: 0 } },
        },
      },
      { time: "2026-10-18T18:00:00Z", data: { instant: { details: {} } } },
    ],
  },
};

describe("weather", () => {
  it("turns the MET response into compact points", () => {
    expect(toWeatherPoints(response)).toEqual([
      { t: "2026-10-18T16:00:00Z", temp: 14.6, symbol: "lightrain", precip: 0.4, wind: 3.2 },
      { t: "2026-10-18T17:00:00Z", temp: 13.4, symbol: "partlycloudy_night", precip: 0, wind: 2.1 },
    ]);
  });

  it("picks the point closest to the start, but not further than 3 hours", () => {
    const points = toWeatherPoints(response);
    expect(forecastAt(points, new Date("2026-10-18T16:40:00Z"))?.symbol).toBe("partlycloudy_night");
    expect(forecastAt(points, new Date("2026-10-18T19:30:00Z"))?.temp).toBe(13.4);
    expect(forecastAt(points, new Date("2026-10-25T16:00:00Z"))).toBeNull();
  });

  it("names the weather in Polish", () => {
    expect(weatherKind("heavyrainshowersandthunder_day")).toBe("storm");
    expect(weatherKind("lightsnow")).toBe("snow");
    expect(weatherKind("lightrainshowers_day")).toBe("drizzle");
    expect(weatherKind("fair_day")).toBe("partly");
    expect(weatherLabel("clearsky_night")).toBe("Bezchmurnie");
    expect(weatherLabel("clearsky_day")).toBe("Słonecznie");
    expect(weatherLabel("sleet")).toBe("Deszcz ze śniegiem");
    expect(weatherLabel("heavyrain")).toBe("Ulewa");
    expect(formatTemp(-0.4)).toBe("0°");
    expect(formatTemp(17.6)).toBe("18°");
  });
});
