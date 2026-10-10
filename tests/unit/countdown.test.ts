import { describe, expect, it } from "vitest";
import { formatCountdown } from "@/lib/countdown";

const MIN = 60_000;
const start = Date.UTC(2026, 9, 20, 16, 0);
const end = start + 90 * MIN;

describe("formatCountdown", () => {
  it("shows days, hours and minutes when the event is more than a day away", () => {
    const now = start - (2 * 1440 + 6 * 60 + 11) * MIN - 30_000;
    expect(formatCountdown(start, end, now)).toEqual({ text: "za 2 d 6 h 11 min", state: "upcoming" });
  });

  it("marks the last three hours as soon and adds seconds in the last hour", () => {
    expect(formatCountdown(start, end, start - (2 * 60 + 5) * MIN)).toEqual({ text: "za 2 h 5 min", state: "soon" });
    expect(formatCountdown(start, end, start - 41 * MIN - 8_000)).toEqual({ text: "za 41 min 08 s", state: "soon" });
  });

  it("says the event is on during it and over afterwards", () => {
    expect(formatCountdown(start, end, start + MIN)).toEqual({ text: "trwa teraz", state: "live" });
    expect(formatCountdown(start, end, end)).toEqual({ text: "zakończone", state: "over" });
  });
});
