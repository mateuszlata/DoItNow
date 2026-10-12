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
