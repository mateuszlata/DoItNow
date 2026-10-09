import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createEvent, parseEventForm, type EventFormValues } from "@/lib/services/events";
import { freeSpots, takenSpots, teamSize } from "@/lib/capacity";
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
    durationMinutes: "90",
    venueId: "",
    total: "4",
    organizerPlays: "on",
    requiresApproval: "on",
    reserveSpots: "",
    minPeople: "",
    lat: "",
    lng: "",
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

  it("requires at least 2 people when the organizer takes part", async () => {
    const { client } = untouchedClient();
    const result = await createEvent(client, "user-id", { ...valid, total: "1" }, new Date("2026-10-01"));
    expect(!result.ok && result.errors.total).toBe("Skoro bierzesz udział, skład musi liczyć co najmniej 2 osoby.");
  });
});

describe("parseEventForm: skład i pinezka", () => {
  const base: EventFormValues = {
    sport: "pilka-nozna",
    area: "Wola",
    place: "Orlik",
    startsAt: "2026-11-01T18:00",
    durationMinutes: "90",
    venueId: "",
    total: "12",
    organizerPlays: "on",
    requiresApproval: "on",
    reserveSpots: "",
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
  };
  const now = new Date("2026-10-01T00:00:00Z");

  it("a playing organizer takes one place in the team (12 total -> 11 to fill)", () => {
    const result = parseEventForm(base, now);
    expect(result.ok && result.data).toMatchObject({ spots: 11, organizerPlays: true });
  });

  it("an organizer who does not play leaves all places open (unchecked box sends nothing)", () => {
    const result = parseEventForm({ ...base, organizerPlays: "" }, now);
    expect(result.ok && result.data).toMatchObject({ spots: 12, organizerPlays: false });
  });

  it("accepts an optional pin and rejects coordinates out of range or without a pair", () => {
    const pinned = parseEventForm({ ...base, lat: "52.2297", lng: "21.0122" }, now);
    expect(pinned.ok && pinned.data).toMatchObject({ lat: 52.2297, lng: 21.0122 });
    expect(parseEventForm({ ...base, lat: "", lng: "" }, now).ok && true).toBe(true);

    const outOfRange = parseEventForm({ ...base, lat: "95", lng: "21" }, now);
    expect(!outOfRange.ok && outOfRange.errors.lat).toBe("Nieprawidłowe położenie pinezki.");
    const halfPin = parseEventForm({ ...base, lat: "52.2", lng: "" }, now);
    expect(halfPin.ok).toBe(false);
  });
});

describe("capacity", () => {
  it("counts the playing organizer in the team and in taken places", () => {
    const event = { spots: 11, organizer_plays: true, accepted_count: 3 };
    expect(teamSize(event)).toBe(12);
    expect(takenSpots(event)).toBe(4);
    expect(freeSpots(event)).toBe(8);
  });

  it("does not count an organizer who only organizes", () => {
    const event = { spots: 12, organizer_plays: false, accepted_count: 12 };
    expect(teamSize(event)).toBe(12);
    expect(takenSpots(event)).toBe(12);
    expect(freeSpots(event)).toBe(0);
  });
});

describe("participationErrorMessage", () => {
  it("maps database codes to Polish messages", () => {
    expect(participationErrorMessage("EVENT_FULL")).toBe("Brak wolnych miejsc w składzie i na liście rezerwowej.");
  });

  it("falls back for unknown codes and returns null without a code", () => {
    expect(participationErrorMessage("SOMETHING_ELSE")).toBe("Coś poszło nie tak. Spróbuj ponownie.");
    expect(participationErrorMessage(null)).toBeNull();
  });
});
