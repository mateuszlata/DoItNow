// Pytania do organizatora: kto pyta i odpowiada, kto co widzi, filtr, limity i powiadomienia (lokalny Supabase).
import { afterAll, describe, expect, it } from "vitest";
import { createEvent } from "@/lib/services/events";
import { answerQuestion, askQuestion, hideQuestion, listQuestions } from "@/lib/services/questions";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, anonClient, cleanupTestUsers, newUser, type TestUser } from "./helpers";

afterAll(cleanupTestUsers);

async function event(organizer: TestUser): Promise<string> {
  const created = await createEvent(organizer.client, organizer.id, {
    sport: "pilka-nozna",
    area: "Test PY",
    place: "Orlik PY",
    startsAt: toLocalDateTime(new Date(Date.now() + 72 * HOUR)),
    durationMinutes: "90",
    venueId: "",
    total: "10",
    organizerPlays: "on",
    requiresApproval: "",
    reserveSpots: "",
    minPeople: "",
    lat: "",
    lng: "",
    description: "",
  });
  if (!created.ok) throw new Error(JSON.stringify(created.errors));
  return created.event.id;
}

async function notificationTypes(user: TestUser, eventId: string): Promise<string[]> {
  const { data } = await user.client.from("notifications").select("type").eq("event_id", eventId);
  return ((data ?? []) as { type: string }[]).map((n) => n.type);
}

describe("questions to the organizer", () => {
  it("lets anyone signed in ask, shows the answer to everyone and the open question only to its author and the organizer", async () => {
    const [organizer, ala, ola] = await Promise.all([newUser("Org PY"), newUser("Ala PY"), newUser("Ola PY")]);
    const eventId = await event(organizer);

    expect(await askQuestion(ala.client, eventId, "Czy jest parking przy orliku?")).toEqual({ ok: true });
    expect(await notificationTypes(organizer, eventId)).toEqual(["question"]);

    const [pending] = await listQuestions(organizer.client, eventId);
    expect(pending).toMatchObject({ body: "Czy jest parking przy orliku?", answer: null, mine: false });
    expect((await listQuestions(ala.client, eventId))[0]).toMatchObject({ mine: true });
    expect(await listQuestions(ola.client, eventId)).toEqual([]);
    expect(await listQuestions(anonClient(), eventId)).toEqual([]);

    expect(await answerQuestion(ala.client, pending.id, "Tak")).toEqual({ ok: false, code: "NOT_ORGANIZER" });
    expect(await answerQuestion(organizer.client, pending.id, "Tak, za szkołą.")).toEqual({ ok: true });
    expect(await notificationTypes(ala, eventId)).toEqual(["answered"]);
    expect((await listQuestions(anonClient(), eventId))[0]).toMatchObject({
      body: "Czy jest parking przy orliku?",
      answer: "Tak, za szkołą.",
    });

    expect(await hideQuestion(ola.client, pending.id)).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(await hideQuestion(organizer.client, pending.id)).toEqual({ ok: true });
    expect(await listQuestions(anonClient(), eventId)).toEqual([]);
  });

  it("blocks the organizer's own questions, vulgar text and flooding", async () => {
    const [organizer, tom] = await Promise.all([newUser("Org2 PY"), newUser("Tom PY")]);
    const eventId = await event(organizer);

    expect(await askQuestion(organizer.client, eventId, "Pytanie do siebie?")).toEqual({
      ok: false,
      code: "OWN_EVENT",
    });
    expect(await askQuestion(tom.client, eventId, "Kurwa, o której?")).toEqual({ ok: false, code: "MESSAGE_BLOCKED" });
    for (const body of ["Pytanie pierwsze?", "Pytanie drugie?", "Pytanie trzecie?"]) {
      expect(await askQuestion(tom.client, eventId, body)).toEqual({ ok: true });
    }
    expect(await askQuestion(tom.client, eventId, "Pytanie czwarte?")).toEqual({ ok: false, code: "RATE_LIMITED" });
  });
});
