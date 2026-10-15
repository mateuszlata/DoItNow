import { describe, expect, it } from "vitest";
import {
  boundingBox,
  distanceKm,
  formatDistance,
  parseNear,
  radiusLabel,
  serializeNear,
  withinRadius,
} from "@/lib/near";

describe("near", () => {
  it("round-trips the cookie with coordinates rounded to about 1 km", () => {
    const value = serializeNear({ lat: 52.229712, lng: 21.012258, radiusKm: 5, label: "Śródmieście | Warszawa" });
    expect(parseNear(value)).toEqual({ lat: 52.23, lng: 21.01, radiusKm: 5, label: "Śródmieście | Warszawa" });
  });

  it("rejects broken values and moves radii we no longer offer to the next wider one", () => {
    expect(parseNear("abc")).toBeNull();
    expect(parseNear("52.2|21.0|7|x")).toMatchObject({ radiusKm: 10 });
    expect(parseNear("52.2|21.0|999|x")).toBeNull();
    expect(parseNear("52.2|21.0|-1|x")).toBeNull();
    expect(parseNear("95|21|5|x")).toBeNull();
    expect(parseNear("52.2|21.0|10|")).toMatchObject({ label: "Twoja okolica" });
  });

  it("offers a no-limit radius that keeps every event", () => {
    expect(parseNear("52.2|21.0|0|x")).toMatchObject({ radiusKm: 0 });
    expect(radiusLabel(0)).toBe("Bez limitu");
    expect(radiusLabel(200)).toBe("200 km");
    expect(withinRadius(330, 0)).toBe(true);
    expect(withinRadius(undefined, 0)).toBe(true);
    expect(withinRadius(330, 200)).toBe(false);
  });

  it("measures distances between Warsaw districts", () => {
    // Pałac Kultury → Stadion Narodowy: ok. 2,6 km
    const km = distanceKm({ lat: 52.2318, lng: 21.0059 }, { lat: 52.2395, lng: 21.0458 });
    expect(km).toBeGreaterThan(2.5);
    expect(km).toBeLessThan(3);
  });

  it("builds a box that contains the whole circle", () => {
    const near = { lat: 52.23, lng: 21.01, radiusKm: 10, label: "x" };
    const box = boundingBox(near, 0);
    expect(distanceKm(near, { lat: box.maxLat, lng: near.lng })).toBeCloseTo(10, 0);
    expect(distanceKm(near, { lat: near.lat, lng: box.maxLng })).toBeCloseTo(10, 0);
  });

  it("formats distances for cards", () => {
    expect(formatDistance(0.04)).toBe("0,1 km");
    expect(formatDistance(2.345)).toBe("2,3 km");
    expect(formatDistance(12.6)).toBe("13 km");
  });
});
