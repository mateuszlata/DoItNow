import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createEvent, type EventFormValues } from "@/lib/services/events";
import { canWithdrawAccepted, participationErrorMessage } from "@/lib/services/participations";

const HOUR = 3_600_000;

describe("canWithdrawAccepted (FR-008: najpóźniej 12 h przed)", () => {
  const startsAt = new Date("2026-11-01T18:00:00Z");

  it("allows withdrawal more than 12 h before", () => {
    expect(canWithdrawAccepted(startsAt, new Date(startsAt.getTime() - 13 * HOUR))).toBe(true);
  });

  it("allows withdrawal exactly 12 h before", () => {
    expect(canWithdrawAccepted(startsAt, new Date(startsAt.getTime() - 12 * HOUR))).toBe(true);
  });

  it("blocks withdrawal later than 12 h before", () => {
    expect(canWithdrawAccepted(startsAt, new Date(startsAt.getTime() - 12 * HOUR + 1000))).toBe(false);
  });
});

describe("createEvent validation", () => {
  const valid: EventFormValues = {
    sport: "koszykowka",
    area: "Mokotów",
    place: "Boisko przy ul. Testowej 1",
    startsAt: "2026-11-01T18:00",
    spots: "3",
    description: "",
  };
  // Klient, który nie powinien zostać użyty, gdy walidacja odrzuca dane.
  const untouchedClient = () => {
    const from = vi.fn();
    return { client: { from } as unknown as SupabaseClient, from };
  };

  it("rejects an event in the past without touching the database", async () => {
    const { client, from } = untouchedClient();
    const result = await createEvent(client, "user-id", valid, new Date("2026-11-02T00:00:00Z"));
    expect(result).toEqual({ ok: false, errors: { startsAt: "Wydarzenie musi odbyć się w przyszłości." } });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a sport outside the fixed list", async () => {
    const { client } = untouchedClient();
    const result = await createEvent(client, "user-id", { ...valid, sport: "szachy" }, new Date("2026-10-01"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.sport).toBe("Wybierz sport z listy.");
  });

  it("requires at least one needed person", async () => {
    const { client } = untouchedClient();
    const result = await createEvent(client, "user-id", { ...valid, spots: "0" }, new Date("2026-10-01"));
    expect(!result.ok && result.errors.spots).toBe("Potrzebna jest co najmniej 1 osoba.");
  });
});

describe("participationErrorMessage", () => {
  it("maps database codes to Polish messages", () => {
    expect(participationErrorMessage("EVENT_FULL")).toBe(
      "Brak wolnych miejsc — nie można zaakceptować kolejnej osoby.",
    );
  });

  it("falls back for unknown codes and returns null without a code", () => {
    expect(participationErrorMessage("SOMETHING_ELSE")).toBe("Coś poszło nie tak. Spróbuj ponownie.");
    expect(participationErrorMessage(null)).toBeNull();
  });
});
