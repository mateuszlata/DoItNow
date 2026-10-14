import { describe, expect, it } from "vitest";
import { chatLayout, dividerLabel } from "@/lib/chat-layout";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 14, 11, 0) + minutes * 60_000).toISOString();

describe("chatLayout", () => {
  it("groups consecutive messages of one person and shows the time only after a longer break", () => {
    const rows = chatLayout([
      { author_id: "jank", created_at: at(0) },
      { author_id: "jank", created_at: at(1) },
      { author_id: "mateusz", created_at: at(2) },
      { author_id: "mateusz", created_at: at(9) }, // > 5 min — nowa grupa, bez separatora
      { author_id: "mateusz", created_at: at(30) }, // ≥ 15 min — separator i nowa grupa
    ]);
    expect(rows).toEqual([
      { divider: true, first: true, last: false },
      { divider: false, first: false, last: true },
      { divider: false, first: true, last: true },
      { divider: false, first: true, last: true },
      { divider: true, first: true, last: true },
    ]);
  });

  it("names the day in the divider", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    expect(dividerLabel("2026-10-14T11:58:00Z", now)).toBe("Dziś 13:58");
    expect(dividerLabel("2026-10-13T19:10:00Z", now)).toBe("Wczoraj 21:10");
    expect(dividerLabel("2026-10-12T16:00:00Z", now)).toMatch(/12 paź.*18:00/);
  });
});
