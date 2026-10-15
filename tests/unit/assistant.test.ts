import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { askAssistant, eventContext, type AssistantEvent } from "@/lib/assistant";

const event: AssistantEvent = {
  sport: "pilka-nozna",
  area: "Raków",
  starts_at: "2026-10-17T16:00:00Z",
  duration_minutes: 90,
  spots: 9,
  organizer_plays: true,
  guest_count: 0,
  accepted_count: 3,
  reserve_spots: 2,
  reserve_count: 0,
  min_people: 8,
  requires_approval: false,
  cost_cents: 20000,
  level_min: 2,
  level_max: 3,
  route_destination: null,
  route_loop: false,
  route_distance_km: null,
  route_pace: null,
};

/** Klient z jedną przygotowaną odpowiedzią modelu (bez sieci). */
function fakeClient(reply: { stop_reason: string; parsed_output: unknown }) {
  return { messages: { parse: () => Promise.resolve(reply) } } as unknown as Pick<Anthropic, "messages">;
}

describe("assistant context", () => {
  it("gives visitors without an account no exact place or description", () => {
    const text = eventContext(event, []);
    expect(text).toContain("Dokładne miejsce: widoczne tylko dla zalogowanych");
    expect(text).toContain("Koszt: 20 zł na osobę");
    expect(text).toContain("wolnych miejsc: 6");
    expect(text).not.toContain("Opis organizatora");
  });

  it("adds the place, description and the organizer's answers for signed-in viewers", () => {
    const text = eventContext({ ...event, place: "Orlik przy SP 12", description: "Weź dwie koszulki." }, [
      { body: "Czy jest parking?", answer: "Tak, za szkołą." },
    ]);
    expect(text).toContain("Dokładne miejsce: Orlik przy SP 12");
    expect(text).toContain("Opis organizatora: Weź dwie koszulki.");
    expect(text).toContain("Odpowiedź organizatora: Tak, za szkołą.");
  });
});

describe("askAssistant", () => {
  it("returns the model's structured answer", async () => {
    const client = fakeClient({ stop_reason: "end_turn", parsed_output: { known: true, answer: "20 zł na osobę." } });
    expect(await askAssistant("key", "kontekst", "Ile kosztuje?", client)).toEqual({
      known: true,
      answer: "20 zł na osobę.",
    });
  });

  it("falls back to asking the organizer when the model declines", async () => {
    const client = fakeClient({ stop_reason: "refusal", parsed_output: null });
    expect((await askAssistant("key", "kontekst", "?", client)).known).toBe(false);
  });
});
