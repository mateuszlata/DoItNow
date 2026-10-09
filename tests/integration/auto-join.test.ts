// Dołączanie bez akceptacji (domyślne) i usuwanie uczestnika przez organizatora
// (lokalny Supabase: `npx supabase start`).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEvent } from "@/lib/services/events";
import { removeParticipant, requestToJoin, withdrawParticipation } from "@/lib/services/participations";
import { HOUR, cleanupTestUsers, newUser, type TestUser } from "./helpers";
import { toLocalDateTime } from "@/lib/time";

let organizer: TestUser;

beforeAll(async () => {
  organizer = await newUser("Organizator AJ");
});

afterAll(cleanupTestUsers);

/** Ogłoszenie z formularza: organizator gra, `total` osób w składzie, bez zaznaczonej akceptacji. */
async function createOpenEvent(total: number, reserveSpots = 0, requiresApproval = false): Promise<string> {
  const result = await createEvent(organizer.client, organizer.id, {
    sport: "siatkowka",
    area: "Test AJ",
    place: "Boisko testowe",
    startsAt: toLocalDateTime(new Date(Date.now() + 72 * HOUR)),
    durationMinutes: "90",
    venueId: "",
    total: String(total),
    organizerPlays: "on",
    requiresApproval: requiresApproval ? "on" : "",
    reserveSpots: String(reserveSpots),
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
  });
  if (!result.ok) throw new Error(`create failed: ${JSON.stringify(result.errors)}`);
  return result.event.id;
}

async function join(eventId: string, user: TestUser) {
  const result = await requestToJoin(user.client, eventId);
  if (!result.ok) throw new Error(`join failed: ${result.code}`);
  return result.participation;
}

describe("dołączanie bez akceptacji", () => {
  it("is the default for new events: joining puts you straight into the team, then the reserve, then full", async () => {
    const eventId = await createOpenEvent(2, 1);
    const [a, b, c] = await Promise.all([newUser("A1"), newUser("A2"), newUser("A3")]);

    expect((await join(eventId, a)).status).toBe("accepted");
    expect((await join(eventId, b)).status).toBe("reserve");
    expect(await requestToJoin(c.client, eventId)).toEqual({ ok: false, code: "EVENT_FULL" });
  });

  it("with the approval switch on, joining still waits for the organizer", async () => {
    const eventId = await createOpenEvent(3, 0, true);
    const a = await newUser("A4");
    expect((await join(eventId, a)).status).toBe("pending");
  });

  it("someone who withdrew can join again and lands in the team", async () => {
    const eventId = await createOpenEvent(3);
    const a = await newUser("A5");
    await join(eventId, a);
    await withdrawParticipation(a.client, eventId);
    expect((await join(eventId, a)).status).toBe("accepted");
  });
});

describe("usuwanie uczestnika przez organizatora", () => {
  it("frees the place for the first person in reserve and blocks re-joining", async () => {
    const eventId = await createOpenEvent(2, 1);
    const [a, b] = await Promise.all([newUser("U1"), newUser("U2")]);
    const first = await join(eventId, a);
    await join(eventId, b);

    const removed = await removeParticipant(organizer.client, first.id);
    expect(removed.ok && removed.participation.status).toBe("removed");

    const { data } = await organizer.client
      .from("participations")
      .select("status")
      .eq("event_id", eventId)
      .eq("user_id", b.id)
      .single<{ status: string }>();
    expect(data?.status).toBe("accepted");
    expect(await requestToJoin(a.client, eventId)).toEqual({ ok: false, code: "ALREADY_REMOVED" });
  });

  it("only the organizer can remove someone", async () => {
    const eventId = await createOpenEvent(3);
    const [a, b] = await Promise.all([newUser("U3"), newUser("U4")]);
    const participation = await join(eventId, a);
    await join(eventId, b);
    expect(await removeParticipant(b.client, participation.id)).toEqual({ ok: false, code: "NOT_ORGANIZER" });
  });
});
