import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types";

// Stan czatu wydarzenia: pobiera nowe wiadomości co kilka sekund, gdy karta jest widoczna,
// i scala je po id (ukrycie wiadomości podmienia jej wersję na liście).
const POLL_MS = 8000;

interface ChatResponse {
  messages?: ChatMessage[];
  syncedAt?: string;
  message?: string;
  id?: string;
}

function merge(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function useEventChat(eventId: string, initialMessages: ChatMessage[], initialSyncedAt: string) {
  const [messages, setMessages] = useState(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const syncedAt = useRef(initialSyncedAt);
  const base = `/api/events/${eventId}/messages`;

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${base}?after=${encodeURIComponent(syncedAt.current)}`);
      const data = (await response.json()) as ChatResponse;
      if (!response.ok) {
        setError(data.message ?? "Nie udało się pobrać wiadomości.");
        return;
      }
      if (data.syncedAt) syncedAt.current = data.syncedAt;
      setMessages((current) => merge(current, data.messages ?? []));
      setError(null);
    } catch {
      setError("Brak połączenia — spróbujemy ponownie za chwilę.");
    }
  }, [base]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      setSending(true);
      try {
        const response = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        const data = (await response.json()) as ChatResponse;
        if (!response.ok) {
          setError(data.message ?? "Nie udało się wysłać wiadomości.");
          return false;
        }
        await refresh();
        return true;
      } catch {
        setError("Brak połączenia — wiadomość nie została wysłana.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [base, refresh],
  );

  const act = useCallback(
    async (messageId: string, action: "hide" | "report", reason?: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/messages/${messageId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reason ? { reason } : {}),
        });
        const data = (await response.json()) as ChatResponse;
        if (!response.ok) {
          setError(data.message ?? "Nie udało się.");
          return false;
        }
        if (action === "hide") await refresh();
        return true;
      } catch {
        setError("Brak połączenia — spróbuj ponownie.");
        return false;
      }
    },
    [refresh],
  );

  return { messages, error, sending, send, act };
}
