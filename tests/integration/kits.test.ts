// Strój gracza w profilu i w czacie (lokalny Supabase: `npx supabase start`).
import { afterAll, describe, expect, it } from "vitest";
import { defaultKit } from "@/lib/kit";
import { getKit, saveKit } from "@/lib/services/profiles";
import { createEvent } from "@/lib/services/events";
import { listMessages, postMessage } from "@/lib/services/chat";
import { toLocalDateTime } from "@/lib/time";
import { HOUR, cleanupTestUsers, newUser } from "./helpers";

afterAll(cleanupTestUsers);

const KIT = { pattern: "hoops", primary: "#2a9d55", secondary: "#ffffff", label: "MŁ" } as const;

describe("player kits", () => {
  it("starts with the default kit and keeps the saved one", async () => {
    const user = await newUser("Barwy KT");
    expect(await getKit(user.client, user.id)).toEqual(defaultKit(user.id));

    expect(await saveKit(user.client, user.id, KIT)).toBe(true);
    expect(await getKit(user.client, user.id)).toEqual(KIT);
  });

  it("rejects values outside the creator at the database level", async () => {
    const user = await newUser("Hakier KT");
    const invalid = [
      { kit_pattern: "camo", kit_primary: "#ffffff", kit_secondary: "#13261f", kit_label: "1" },
      { kit_pattern: "plain", kit_primary: "#123456", kit_secondary: "#13261f", kit_label: "1" },
      { kit_pattern: "plain", kit_primary: "#ffffff", kit_secondary: "#13261f", kit_label: "100" },
      { kit_pattern: "plain", kit_primary: null, kit_secondary: null, kit_label: "1" },
    ];
    for (const values of invalid) {
      const { error } = await user.client.from("profiles").update(values).eq("id", user.id);
      expect(error).not.toBeNull();
    }
  });

  it("does not let anyone change someone else's kit", async () => {
    const [owner, other] = await Promise.all([newUser("Właściciel KT"), newUser("Inny KT")]);
    await saveKit(other.client, owner.id, KIT);
    expect(await getKit(owner.client, owner.id)).toEqual(defaultKit(owner.id));
  });

  it("shows the author's kit in the event chat", async () => {
    const organizer = await newUser("Org KT");
    await saveKit(organizer.client, organizer.id, KIT);
    const day = toLocalDateTime(new Date(Date.now() + 72 * HOUR)).slice(0, 10);
    const event = await createEvent(organizer.client, organizer.id, {
      sport: "pilka-nozna",
      area: "Test KT",
      place: "Boisko KT",
      startsAt: `${day}T19:00`,
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
    if (!event.ok) throw new Error("event failed");
    expect((await postMessage(organizer.client, event.event.id, "Cześć")).ok).toBe(true);
    const result = await listMessages(organizer.client, event.event.id);
    if (!result.ok) throw new Error(result.code);
    expect(result.data[0]).toMatchObject({
      kit_pattern: "hoops",
      kit_primary: "#2a9d55",
      kit_secondary: "#ffffff",
      kit_label: "MŁ",
    });
  });
});
