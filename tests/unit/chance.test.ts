import { describe, expect, it } from "vitest";
import { chanceExplanation, chanceTarget, chanceTips, meetingChance, type ChanceInput } from "@/lib/chance";

const base: ChanceInput = {
  teamSize: 10,
  minPeople: 8,
  confirmed: 4,
  pendingInvites: 0,
  freeSpots: 6,
  hoursToStart: 72,
};

describe("meetingChance", () => {
  it("uses the organizer's minimum, or 80% of the team without one", () => {
    expect(chanceTarget(10, 8)).toBe(8);
    expect(chanceTarget(10, null)).toBe(8);
    expect(chanceTarget(5, null)).toBe(4);
  });

  it("is high once the minimum is confirmed", () => {
    expect(meetingChance({ ...base, confirmed: 8 })).toEqual({ percent: 95, level: "high", target: 8 });
  });

  it("grows with confirmations, invites and time, rounded to 5%", () => {
    const low = meetingChance({ ...base, confirmed: 2, hoursToStart: 3 });
    const more = meetingChance({ ...base, confirmed: 6 });
    const invited = meetingChance({ ...base, confirmed: 6, pendingInvites: 2 });
    expect(low.level).toBe("low");
    expect(more.percent).toBeGreaterThan(low.percent);
    expect(invited.percent).toBeGreaterThanOrEqual(more.percent);
    expect(more.percent % 5).toBe(0);
    expect(more.percent).toBeLessThanOrEqual(90);
  });

  it("does not let unanswered question marks count as real players", () => {
    const hoarded = meetingChance({ ...base, confirmed: 2, pendingInvites: 6, freeSpots: 0 });
    expect(hoarded.level).not.toBe("high");
  });
});

describe("chanceTips", () => {
  it("shows how inviting friends raises the chance", () => {
    const tips = chanceTips({ ...base, confirmed: 5 }, { isOrganizer: false, canInvite: true, reserveSpots: 0 });
    expect(tips[0].kind).toBe("invite");
    expect(tips[0].text).toMatch(/Zaproś 2 znajomych — gdy potwierdzą, szansa wzrośnie z \d+% do \d+%\./);
  });

  it("reminds about unanswered invites and suggests a minimum and a reserve to the organizer", () => {
    const kinds = (input: ChanceInput) =>
      chanceTips(input, { isOrganizer: true, canInvite: true, reserveSpots: 0 }).map((t) => t.kind);
    expect(kinds({ ...base, pendingInvites: 2 })).toContain("remind");
    expect(kinds({ ...base, minPeople: null })).toContain("minimum");
    expect(kinds({ ...base, confirmed: 10, freeSpots: 0 })).toContain("reserve");
  });
});

describe("chanceExplanation", () => {
  it("explains the number in plain words", () => {
    const chance = meetingChance({ ...base, pendingInvites: 2 });
    expect(chanceExplanation({ ...base, pendingInvites: 2 }, chance)).toBe(
      "4 z 8 potrzebnych potwierdzonych · zaproszeni bez odpowiedzi: 2 · 3 dni do startu",
    );
  });
});

describe("inviting never lowers the chance", () => {
  it("reserving a seat for a friend keeps or raises the chance", () => {
    for (const hours of [3, 24, 72, 200]) {
      for (let free = 1; free <= 6; free++) {
        const before = meetingChance({ ...base, freeSpots: free, pendingInvites: 0, hoursToStart: hours });
        const after = meetingChance({ ...base, freeSpots: free - 1, pendingInvites: 1, hoursToStart: hours });
        expect(after.percent).toBeGreaterThanOrEqual(before.percent);
      }
    }
  });
});
