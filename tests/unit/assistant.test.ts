import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { askAssistant, eventContext, type AssistantEvent, type EventSearch, type FoundEvent } from "@/lib/assistant";

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

interface FakeReply {
  stop_reason: string;
  parsed_output: unknown;
  content?: unknown[];
}

/** Klient z przygotowanymi kolejno odpowiedziami modelu (bez sieci). */
function fakeClient(...replies: FakeReply[]) {
  const calls: { tools?: unknown }[] = [];
  const client = {
    messages: {
      parse: (params: { tools?: unknown }) => {
        calls.push(params);
        return Promise.resolve({ content: [], ...replies[Math.min(calls.length - 1, replies.length - 1)] });
      },
    },
  } as unknown as Pick<Anthropic, "messages">;
  return { client, calls };
}

const found: FoundEvent = {
  id: "e1",
  sport: "Koszykówka",
  when: "sobota 17.10, 18:00–19:30",
  area: "Raków",
  free: 3,
  team: 10,
  distance_km: 2.4,
};

describe("assistant context", () => {
  it("gives visitors without an account no exact place or description", () => {
    const text = eventContext(event, []);
    expect(text).toContain("Dokładne miejsce: widoczne tylko dla zalogowanych");
    expect(text).toContain("Koszt: 20 zł na osobę");
    expect(text).toContain("Skład: 10 miejsc łącznie, zajęte 4 (w tym organizator, który gra), wolne 6");
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
    const { client } = fakeClient({
      stop_reason: "end_turn",
      parsed_output: { known: true, answer: "20 zł na osobę.", event_ids: [] },
    });
    expect(await askAssistant("key", { question: "Ile kosztuje?", eventContext: "kontekst" }, client)).toEqual({
      known: true,
      answer: "20 zł na osobę.",
      events: [],
      search: null,
    });
  });

  it("falls back to a human when the model declines", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", parsed_output: null });
    expect((await askAssistant("key", { question: "?" }, client)).known).toBe(false);
  });

  it("searches with the model's filters and returns only events the search found", async () => {
    const searched: EventSearch[] = [];
    const { client, calls } = fakeClient(
      {
        stop_reason: "tool_use",
        parsed_output: null,
        content: [
          { type: "tool_use", id: "t1", name: "search_events", input: { sports: ["koszykowka"], when: "weekend" } },
        ],
      },
      {
        stop_reason: "end_turn",
        parsed_output: { known: true, answer: "Jest kosz w sobotę.", event_ids: ["e1", "zmyslone"] },
      },
    );
    const reply = await askAssistant(
      "key",
      {
        question: "Kosz w weekend?",
        search: (filters) => {
          searched.push(filters);
          return Promise.resolve({ events: [found], scope: "Raków, promień 10 km" });
        },
      },
      client,
    );
    expect(searched).toEqual([{ sports: ["koszykowka"], when: "weekend" }]);
    expect(reply.events).toEqual([found]);
    expect(reply.search).toEqual({ sports: ["koszykowka"], when: "weekend" });
    expect(calls[0].tools).toBeDefined();
  });

  it("rejects invalid search filters without calling the search", async () => {
    let searched = false;
    const { client } = fakeClient(
      {
        stop_reason: "tool_use",
        parsed_output: null,
        content: [{ type: "tool_use", id: "t1", name: "search_events", input: { sports: ["szachy"] } }],
      },
      { stop_reason: "end_turn", parsed_output: { known: false, answer: "Nie wiem.", event_ids: [] } },
    );
    const reply = await askAssistant(
      "key",
      {
        question: "Szachy?",
        search: () => {
          searched = true;
          return Promise.resolve({ events: [], scope: "" });
        },
      },
      client,
    );
    expect(searched).toBe(false);
    expect(reply.search).toBeNull();
  });

  it("offers no search tool when there is no search", async () => {
    const { client, calls } = fakeClient({
      stop_reason: "end_turn",
      parsed_output: { known: true, answer: "Tak.", event_ids: [] },
    });
    await askAssistant("key", { question: "Czy to darmowe?" }, client);
    expect(calls[0].tools).toBeUndefined();
  });
});
