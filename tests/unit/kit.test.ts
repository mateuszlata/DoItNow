import { describe, expect, it } from "vitest";
import { KIT_COLORS, KIT_PATTERNS, defaultKit, kitFrom, kitNumberColor, parseKit } from "@/lib/kit";

const valid = { pattern: "vstripes", primary: "#ffffff", secondary: "#13261f", label: "10" };

describe("parseKit", () => {
  it("accepts a palette kit with a number or initials", () => {
    expect(parseKit(valid)).toEqual(valid);
    expect(parseKit({ ...valid, label: " mł " })).toMatchObject({ label: "MŁ" });
    expect(parseKit({ ...valid, label: "07" })).toMatchObject({ label: "7" });
    expect(parseKit({ ...valid, label: "0" })).toMatchObject({ label: "0" });
  });

  it("rejects colors, patterns and labels outside the creator", () => {
    expect(parseKit({ ...valid, primary: "#123456" })).toBeNull();
    expect(parseKit({ ...valid, pattern: "camo" })).toBeNull();
    for (const label of ["100", "-1", "ABCD", "A1", "", null]) {
      expect(parseKit({ ...valid, label })).toBeNull();
    }
  });
});

describe("defaultKit", () => {
  it("is stable for an account and always a valid two-colour kit", () => {
    for (const id of ["a", "0c5f2c1e-1111-4222-8333-444455556666", "36f31a30-54d7-40f2-a3ec-d64c8a4e564b"]) {
      const kit = defaultKit(id);
      expect(defaultKit(id)).toEqual(kit);
      expect(parseKit(kit)).toEqual(kit);
      expect(kit.primary).not.toBe(kit.secondary);
    }
  });

  it("spreads accounts across patterns and colours", () => {
    const kits = Array.from({ length: 200 }, (_, i) => defaultKit(`user-${String(i)}`));
    expect(new Set(kits.map((k) => k.pattern)).size).toBe(KIT_PATTERNS.length);
    expect(new Set(kits.map((k) => k.primary)).size).toBe(KIT_COLORS.length);
  });
});

describe("kitFrom", () => {
  it("uses the saved kit and falls back to the default one", () => {
    const columns = { kit_pattern: "sash", kit_primary: "#d62828", kit_secondary: "#ffffff", kit_label: "9" };
    expect(kitFrom(columns, "x")).toEqual({ pattern: "sash", primary: "#d62828", secondary: "#ffffff", label: "9" });
    const empty = { kit_pattern: null, kit_primary: null, kit_secondary: null, kit_label: null };
    expect(kitFrom(empty, "x")).toEqual(defaultKit("x"));
    expect(kitFrom(null, "x")).toEqual(defaultKit("x"));
  });
});

describe("kitNumberColor", () => {
  it("keeps the number readable on light and dark shirts", () => {
    expect(kitNumberColor("#ffffff")).toBe("#13261f");
    expect(kitNumberColor("#f4d03f")).toBe("#13261f");
    expect(kitNumberColor("#1d3557")).toBe("#ffffff");
  });
});
