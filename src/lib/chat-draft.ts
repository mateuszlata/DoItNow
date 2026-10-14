// Wiadomość zaczęta przed założeniem konta (w zajawce czatu) czeka w pamięci przeglądarki i po zalogowaniu
// pojawia się w polu czatu gotowa do wysłania. Tylko w tej przeglądarce; pamięć bywa wyłączona — wtedy nic.

const key = (eventId: string) => `metando-chat-draft:${eventId}`;

export function readChatDraft(eventId: string): string {
  try {
    return typeof window === "undefined" ? "" : (window.localStorage.getItem(key(eventId)) ?? "");
  } catch {
    return "";
  }
}

export function saveChatDraft(eventId: string, text: string): void {
  try {
    if (text.trim()) window.localStorage.setItem(key(eventId), text.slice(0, 1000));
    else window.localStorage.removeItem(key(eventId));
  } catch {
    // brak dostępu do pamięci przeglądarki — wiadomość nie przetrwa logowania
  }
}

export function clearChatDraft(eventId: string): void {
  saveChatDraft(eventId, "");
}
