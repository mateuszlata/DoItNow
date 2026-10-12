import { describe, expect, it } from "vitest";
import {
  formation,
  mirrorSlot,
  parseAssignments,
  randomSplit,
  splitByPositions,
  swapPlayers,
  type FootballPosition,
  type LineupPlayer,
} from "@/lib/lineup";

const player = (name: string, position: FootballPosition): LineupPlayer => ({ userId: name, name, position });

const ten = [
  player("Kuba", "bramka"),
  player("Ola", "atak"),
  player("Bartek", "obrona"),
  player("Zosia", "pomoc"),
  player("Marek", "bramka"),
  player("Ania", "atak"),
  player("Piotr", "obrona"),
  player("Ewa", "obojetnie"),
  player("Tomek", "bramka"),
  player("Kasia", "pomoc"),
];

describe("formation", () => {
  it("has a goalkeeper and the right number of places for each team size", () => {
    for (let size = 1; size <= 11; size++) {
      const slots = formation(size);
      expect(slots).toHaveLength(size);
      expect(slots[0]).toMatchObject({ role: "bramka", x: 50 });
      expect(slots.every((s) => s.y > 75 && s.y < 150)).toBe(true);
    }
  });

  it("mirrors team B into the other half", () => {
    expect(mirrorSlot({ x: 30, y: 120, role: "obrona" })).toEqual({ x: 70, y: 30, role: "obrona" });
  });
});

describe("splitByPositions", () => {
  it("puts two goalkeepers in different teams, in goal, and balances the rest", () => {
    const { assignments, notes } = splitByPositions(ten);
    const team = (t: 0 | 1) => assignments.filter((a) => a.team === t);
    expect(team(0)).toHaveLength(5);
    expect(team(1)).toHaveLength(5);
    expect(assignments.find((a) => a.user_id === "Kuba")).toMatchObject({ team: 0, slot: 0 });
    expect(assignments.find((a) => a.user_id === "Marek")).toMatchObject({ team: 1, slot: 0 });
    expect(new Set(assignments.map((a) => a.user_id)).size).toBe(10);
    expect(notes[0]).toContain("3 chętnych na bramkę");
  });

  it("explains a missing goalkeeper and still fills the goal", () => {
    const { assignments, notes } = splitByPositions([
      player("A", "atak"),
      player("B", "obojetnie"),
      player("C", "obrona"),
      player("D", "pomoc"),
    ]);
    expect(notes[0]).toContain("Nikt nie zgłosił się na bramkę");
    expect(assignments.filter((a) => a.slot === 0)).toHaveLength(2);
  });
});

describe("randomSplit", () => {
  it("splits evenly and deterministically for a given random source", () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const { assignments } = randomSplit(ten, random);
    expect(assignments.filter((a) => a.team === 0)).toHaveLength(5);
    expect(assignments.filter((a) => a.team === 1)).toHaveLength(5);
  });
});

describe("swapPlayers and parseAssignments", () => {
  it("swaps two players between teams and places", () => {
    const start = [
      { user_id: "A", team: 0 as const, slot: 0 },
      { user_id: "B", team: 1 as const, slot: 3 },
    ];
    expect(swapPlayers(start, "A", "B")).toEqual([
      { user_id: "A", team: 1, slot: 3 },
      { user_id: "B", team: 0, slot: 0 },
    ]);
  });

  it("ignores saved entries of people no longer in the squad", () => {
    const saved = [
      { user_id: "A", team: 0, slot: 0 },
      { user_id: "Gone", team: 1, slot: 1 },
      { user_id: "B", team: 3, slot: 1 },
      "junk",
    ];
    expect(parseAssignments(saved, ["A", "B"])).toEqual([{ user_id: "A", team: 0, slot: 0 }]);
  });
});
