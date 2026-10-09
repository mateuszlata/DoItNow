import { describe, expect, it } from "vitest";
import { toSuggestion } from "@/lib/geocode";

const at = { coordinates: [21.0122, 52.2297] as [number, number] };

describe("toSuggestion", () => {
  it("uses the place name as the title and the street, district and city as the subtitle", () => {
    const s = toSuggestion({
      geometry: at,
      properties: { name: "Orlik", street: "Raszyńska", housenumber: "8", district: "Ochota", city: "Warszawa" },
    });
    expect(s).toEqual({ title: "Orlik", subtitle: "Raszyńska 8, Ochota, Warszawa", lat: 52.2297, lng: 21.0122 });
  });

  it("falls back to the street with number when there is no name", () => {
    const s = toSuggestion({ geometry: at, properties: { street: "Dolna", housenumber: "5", city: "Warszawa" } });
    expect(s.title).toBe("Dolna 5");
    expect(s.subtitle).toBe("Warszawa");
  });

  it("does not repeat the title or duplicate parts in the subtitle", () => {
    const s = toSuggestion({
      geometry: at,
      properties: { name: "Częstochowa", city: "Częstochowa", state: "śląskie" },
    });
    expect(s.title).toBe("Częstochowa");
    expect(s.subtitle).toBe("");
  });
});
