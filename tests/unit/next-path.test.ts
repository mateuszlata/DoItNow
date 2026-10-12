import { describe, expect, it } from "vitest";
import { authHref, safeNext } from "@/lib/next-path";

describe("safeNext", () => {
  it("accepts paths inside the app", () => {
    expect(safeNext("/events/0c5f2c1e-1111-4222-8333-444455556666")).toBe(
      "/events/0c5f2c1e-1111-4222-8333-444455556666",
    );
    expect(safeNext("/events?sport=tenis")).toBe("/events?sport=tenis");
    expect(safeNext("/my")).toBe("/my");
  });

  it("rejects anything that could leave the app or loop through auth", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "evil.example",
      "/events\nSet-Cookie: x",
      "/api/auth/signout",
      "/auth/signin",
      "",
      "/" + "a".repeat(400),
      null,
      42,
    ]) {
      expect(safeNext(value)).toBeNull();
    }
  });
});

describe("authHref", () => {
  it("keeps the return path and extra parameters", () => {
    expect(authHref("signin", "/events/abc")).toBe("/auth/signin?next=%2Fevents%2Fabc");
    expect(authHref("signup", null, { error: "Błąd" })).toBe("/auth/signup?error=B%C5%82%C4%85d");
    expect(authHref("signup", null)).toBe("/auth/signup");
  });
});

describe("fingerprint", () => {
  it("is stable for the same state and changes when the state changes", async () => {
    const { fingerprint } = await import("@/lib/services/live");
    const state = JSON.stringify([{ id: "e1", spots: 5 }, [{ id: "p1", status: "accepted" }], null]);
    expect(fingerprint(state)).toBe(fingerprint(state));
    expect(fingerprint(state)).not.toBe(fingerprint(state.replace("accepted", "withdrawn")));
  });
});

describe("share messages", () => {
  const event = { sport: "siatkowka", area: "Wola", starts_at: "2026-11-07T17:00:00Z", duration_minutes: 90 };

  it("describes the event and how many people are missing before the link", async () => {
    const { eventShareText } = await import("@/lib/share");
    const text = eventShareText(event, 3, "https://metando.pl/events/abc");
    expect(text).toContain("🏐 Siatkówka");
    expect(text).toContain("Wola");
    expect(text).toContain("Brakuje jeszcze 3 osób.");
    expect(text.endsWith("https://metando.pl/events/abc")).toBe(true);
    expect(eventShareText(event, 1, "u")).toContain("Brakuje jeszcze 1 osoby.");
  });

  it("invites friends without inflecting the sport name", async () => {
    const { inviteShareText } = await import("@/lib/share");
    const text = inviteShareText(event, "https://metando.pl/i/xyz");
    expect(text.startsWith("Hej! Zbieram ekipę: 🏐 Siatkówka")).toBe(true);
    expect(text).toContain("bez zakładania konta");
  });
});
