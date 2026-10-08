import { describe, expect, it } from "vitest";
import { dayRange, localDateTimeToDate } from "@/lib/time";

describe("localDateTimeToDate (Europe/Warsaw)", () => {
  it("converts summer time (UTC+2)", () => {
    expect(localDateTimeToDate("2026-07-01T18:00")?.toISOString()).toBe("2026-07-01T16:00:00.000Z");
  });

  it("converts winter time (UTC+1)", () => {
    expect(localDateTimeToDate("2026-12-01T18:00")?.toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });

  it("handles the day clocks go back (25 Oct 2026)", () => {
    expect(localDateTimeToDate("2026-10-25T12:00")?.toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(localDateTimeToDate("2026-07-01 18:00")).toBeNull();
    expect(localDateTimeToDate("")).toBeNull();
  });
});

describe("dayRange", () => {
  it("covers a full local day", () => {
    const range = dayRange("2026-07-01");
    expect(range?.from.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(range?.to.toISOString()).toBe("2026-07-01T22:00:00.000Z");
  });

  it("is 25 hours long on the day clocks go back", () => {
    const range = dayRange("2026-10-25");
    expect(range && (range.to.getTime() - range.from.getTime()) / 3_600_000).toBe(25);
  });

  it("rejects malformed input", () => {
    expect(dayRange("25.10.2026")).toBeNull();
  });
});
