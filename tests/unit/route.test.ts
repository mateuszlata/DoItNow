import { describe, expect, it } from "vitest";
import { isRouteSport, routeSummary } from "@/lib/route";

describe("routeSummary", () => {
  const base = { route_destination: null, route_loop: false, route_distance_km: null, route_pace: null };

  it("describes the destination or loop, distance and pace", () => {
    expect(
      routeSummary({ ...base, route_destination: "Olsztyn", route_distance_km: 35.5, route_pace: "25–28 km/h" }),
    ).toBe("→ Olsztyn · 35,5 km · 25–28 km/h");
    expect(routeSummary({ ...base, route_loop: true, route_distance_km: 10 })).toBe("pętla · 10 km");
    expect(routeSummary(base)).toBeNull();
  });

  it("applies only to rides and runs", () => {
    expect(isRouteSport("rower")).toBe(true);
    expect(isRouteSport("bieganie")).toBe(true);
    expect(isRouteSport("pilka-nozna")).toBe(false);
  });
});
