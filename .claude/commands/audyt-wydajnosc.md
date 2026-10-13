---
description: Audyt wydajności i kosztów Metando (zapytania, ładowanie stron, Cloudflare, Supabase, zewnętrzne API) — tylko raport
---

Przeprowadź audyt wydajności i kosztów działania. Najpierw przeczytaj `.claude/audyty/zasady.md` i stosuj się do niego.

1. **Zapytania na stronę**: dla `/events`, `/events/[id]`, `/my`, `/i/[token]` i stron admina policz zapytania do Supabase przy jednym wejściu (zalogowany i gość). Szukaj zapytań w pętli, zapytań, które można połączyć, i pobierania całych list tylko po to, by je policzyć (np. liczby przy sportach, promienie, najbliższe spotkania — limit `MAX_EVENTS_SHOWN`).
2. **Baza**: indeksy pod filtry i sortowanie (`starts_at`, `status`, `sport`, `lat`/`lng`, klucze obce w `participations`, `invite_responses`, `event_messages`); koszt widoku `events_public` (podzapytania w kolumnach); funkcje wołane przy każdym wejściu (`release_stale_invites`).
3. **Przeglądarka**: rozmiar paczek JS (`npm run build`, katalog `dist/_astro`), wyspy Reacta i ich dyrektywy (`client:load` vs `client:idle` / `visible`), Leaflet i mapy na liście, fonty, obrazki OG; co blokuje pierwsze wyświetlenie na słabym telefonie.
4. **Odświeżanie na żywo i odpytywanie**: czat co 8 s, wersja spotkania co 15 s — ile zapytań na godzinę generuje jedna otwarta karta i 100 osób naraz; czy przestaje, gdy karta jest w tle.
5. **Zewnętrzne API i limity darmowe**: Google Places (pula miesięczna), Open-Meteo (limit dzienny, pamięć podręczna 30 min po okolicy), Photon, Turnstile; Supabase Free (rozmiar bazy, transfer, połączenia), Cloudflare Workers Free (zapytania dziennie, czas CPU). Oszacuj, przy ilu aktywnych użytkownikach dziennie który limit pęknie pierwszy.
6. **Pamięć podręczna**: nagłówki `Cache-Control` stron i API, co można bezpiecznie zapamiętać na krawędzi Cloudflare, a czego nie wolno (strony zależne od sesji).

Podawaj liczby (zapytania, KB, ms, limity), a nie wrażenia.
