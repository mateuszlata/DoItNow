import { describe, expect, it } from "vitest";
import { gmailLink, mailtoLink, smsLink, telegramLink, whatsappLink } from "@/lib/share-links";

const url = "https://metando.pl/events/abc";
const input = {
  text: `⚽ Piłka nożna — czwartek, 15 października, Mokotów\nBrakuje jeszcze 3 osób. Wchodzisz? 👇\n${url}`,
  url,
  subject: "Metando: Piłka nożna — czwartek",
};

describe("share links", () => {
  it("keeps the whole message with Polish letters, emoji and line breaks for WhatsApp", () => {
    const link = new URL(whatsappLink(input));
    expect(link.origin).toBe("https://wa.me");
    expect(link.searchParams.get("text")).toBe(input.text);
  });

  it("opens a Gmail draft with subject and body", () => {
    const link = new URL(gmailLink(input));
    expect(link.hostname).toBe("mail.google.com");
    expect(link.searchParams.get("su")).toBe(input.subject);
    expect(link.searchParams.get("body")).toBe(input.text);
  });

  it("encodes mailto with %20 instead of + so mail apps show spaces", () => {
    const link = mailtoLink(input);
    expect(link.startsWith("mailto:?subject=Metando%3A%20Pi%C5%82ka")).toBe(true);
    expect(link).not.toContain("+");
    expect(decodeURIComponent(link.split("&body=")[1])).toBe(input.text);
  });

  it("gives Telegram the link separately and the text without a duplicated link", () => {
    const link = new URL(telegramLink(input));
    expect(link.searchParams.get("url")).toBe(url);
    expect(link.searchParams.get("text")).toBe(input.text.slice(0, -url.length).trimEnd());
  });

  it("prefills an SMS", () => {
    expect(decodeURIComponent(smsLink(input).split("body=")[1])).toBe(input.text);
  });
});
