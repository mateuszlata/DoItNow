// Ulubione sporty i lista ogłoszeń filtrowana po kilku sportach (lokalny Supabase: `npx supabase start`).
import { afterAll, describe, expect, it } from "vitest";
import { createEvent, listUpcomingEvents } from "@/lib/services/events";
import { getFavoriteSports, normalizeSports, parseSportsParam, saveFavoriteSports } from "@/lib/services/preferences";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, cleanupTestUsers, newUser } from "./helpers";

afterAll(cleanupTestUsers);

describe("favorite sports", () => {
  it("is empty until chosen, then keeps only known sports in a fixed order", async () => {
    const user = await newUser("Kibic PR");
    expect(await getFavoriteSports(user.client, user.id)).toBeNull();

    expect(await saveFavoriteSports(user.client, user.id, ["tenis", "pilka-nozna", "curling", "tenis"])).toBe(true);
    expect(await getFavoriteSports(user.client, user.id)).toEqual(["pilka-nozna", "tenis"]);

    // „Pomiń” zapisuje pustą listę — już nie pytamy, pokazujemy wszystko.
    expect(await saveFavoriteSports(user.client, user.id, [])).toBe(true);
    expect(await getFavoriteSports(user.client, user.id)).toEqual([]);
  });

  it("stays private to its owner", async () => {
    const [owner, other] = await Promise.all([newUser("Właściciel PR"), newUser("Ciekawski PR")]);
    await saveFavoriteSports(owner.client, owner.id, ["squash"]);
    expect(await getFavoriteSports(other.client, owner.id)).toBeNull();

    const { error } = await other.client
      .from("user_sport_preferences")
      .insert({ user_id: owner.id, sports: ["rower"] });
    expect(error).not.toBeNull();
    expect(await getFavoriteSports(owner.client, owner.id)).toEqual(["squash"]);
  });

  it("parses the sports list from the address", () => {
    expect(parseSportsParam(null)).toBeNull();
    expect(parseSportsParam("tenis,pilka-nozna,xyz")).toEqual(["pilka-nozna", "tenis"]);
    expect(normalizeSports(["inne", "inne"])).toEqual(["inne"]);
  });
});

describe("event list with several sports", () => {
  it("shows only the chosen sports", async () => {
    const organizer = await newUser("Org PR");
    const day = toLocalDateTime(new Date(Date.now() + 96 * HOUR)).slice(0, 10);
    for (const sport of ["squash", "rower", "tenis-stolowy"]) {
      const result = await createEvent(organizer.client, organizer.id, {
        sport,
        area: "Test PR",
        place: "Miejsce PR",
        startsAt: `${day}T07:00`,
        durationMinutes: "60",
        venueId: "",
        total: "4",
        organizerPlays: "on",
        requiresApproval: "",
        reserveSpots: "",
        minPeople: "",
        lat: "",
        lng: "",
        description: "",
      });
      if (!result.ok) throw new Error(`event failed: ${JSON.stringify(result.errors)}`);
    }

    const { events } = await listUpcomingEvents(
      organizer.client,
      { sports: ["squash", "tenis-stolowy"], day },
      { authenticated: true, limit: 50 },
    );
    const mine = events.filter((e) => e.area === "Test PR").map((e) => e.sport);
    expect(mine.sort()).toEqual(["squash", "tenis-stolowy"]);
  });
});
