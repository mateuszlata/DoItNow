import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "@/lib/turnstile";

const reply = (body: unknown, ok = true) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: ok ? 200 : 500 })));

describe("verifyTurnstile", () => {
  it("skips the check when no secret is configured", async () => {
    const fetchImpl = reply({ success: false });
    expect(await verifyTurnstile(undefined, null, null, fetchImpl)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a missing token without calling Cloudflare", async () => {
    const fetchImpl = reply({ success: true });
    expect(await verifyTurnstile("secret", null, null, fetchImpl)).toBe(false);
    expect(await verifyTurnstile("secret", "", null, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts a token Cloudflare confirms and sends secret, token and IP", async () => {
    const fetchImpl = reply({ success: true });
    expect(await verifyTurnstile("secret", "token", "1.2.3.4", fetchImpl)).toBe(true);
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect([body.get("secret"), body.get("response"), body.get("remoteip")]).toEqual(["secret", "token", "1.2.3.4"]);
  });

  it("rejects a token Cloudflare refuses, an error response and a network failure", async () => {
    expect(await verifyTurnstile("secret", "token", null, reply({ success: false }))).toBe(false);
    expect(await verifyTurnstile("secret", "token", null, reply({}, false))).toBe(false);
    const failing = vi.fn(() => Promise.reject(new Error("offline")));
    expect(await verifyTurnstile("secret", "token", null, failing)).toBe(false);
  });
});
