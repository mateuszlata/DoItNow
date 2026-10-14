import { describe, expect, it } from "vitest";
import { fitsLevel, levelHint, levelMixLabel, levelRangeLabel, parseLevelRange } from "@/lib/levels";

describe("levels", () => {
  it("parses the event range from the form", () => {
    expect(parseLevelRange("2-3")).toEqual({ min: 2, max: 3 });
    expect(parseLevelRange("")).toBeNull();
    expect(parseLevelRange("3-2")).toBeNull();
    expect(parseLevelRange("0-5")).toBeNull();
  });

  it("names ranges and the squad mix", () => {
    expect(levelRangeLabel(null, null)).toBe("Dla każdego");
    expect(levelRangeLabel(2, 2)).toBe("Poziom średni");
    expect(levelRangeLabel(2, 3)).toBe("Poziom średni–zaawansowany");
    expect(
      levelMixLabel([
        { level: 2, players: 2 },
        { level: 3, players: 1 },
      ]),
    ).toBe("2× średnio, 1× zaawansowanie");
  });

  it("checks whether a player fits, treating missing data as a fit", () => {
    expect(fitsLevel(1, 3, 4)).toBe(false);
    expect(fitsLevel(3, 3, 4)).toBe(true);
    expect(fitsLevel(null, 3, 4)).toBe(true);
    expect(fitsLevel(1, null, null)).toBe(true);
  });

  it("describes levels per sport", () => {
    expect(levelHint("pilka-nozna", 2)).toBe("gram co tydzień ze znajomymi");
    expect(levelHint("inne", 1)).toBe("dla zabawy, gram okazjonalnie");
  });
});
