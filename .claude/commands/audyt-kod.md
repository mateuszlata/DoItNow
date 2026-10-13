---
description: Audyt jakości kodu i testów Metando (konwencje, martwy kod, duplikacja, luki w testach) — tylko raport
---

Przeprowadź audyt jakości kodu i testów. Najpierw przeczytaj `.claude/audyty/zasady.md` i stosuj się do niego. Konwencje projektu są w `CLAUDE.md`.

1. **Stan narzędzi**: uruchom `npm run lint`, `npx astro check`, `npm test` (wymaga `npx supabase start`) i zapisz wyniki.
2. **Konwencje z CLAUDE.md**: alias `@/`, `cn()` zamiast sklejania klas, zod w każdym API, `prerender = false`, hooki w `src/components/hooks/`, typy wspólne w `src/types.ts`, serwisy w `src/lib/services/`, RLS w nowych tabelach — wypisz odstępstwa.
3. **Martwy i zdublowany kod**: nieużywane eksporty, komponenty, endpointy, kolumny i funkcje w bazie nadpisane w późniejszych migracjach; logika powtórzona w kilku miejscach (np. liczenie miejsc, formatowanie dat, odczyt położenia spotkania, formularze gości), która powinna mieć jedno źródło.
4. **Duże pliki i złożoność**: strony i komponenty, które robią za dużo (np. `src/pages/events/[id]/index.astro`) — zaproponuj podział tylko tam, gdzie realnie utrudnia zmiany.
5. **Obsługa błędów**: miejsca, gdzie błąd z bazy lub sieci jest połykany bez śladu, albo zamienia się w mylący komunikat; spójność mapowania kodów błędów na polskie komunikaty.
6. **Testy**: reguły i ścieżki bez testów (integracyjnych dla bazy, e2e dla kluczowych przepływów), testy kruche (zależne od czasu, kolejności, danych z innych testów), brak sprzątania kont testowych.
7. **Dokumentacja**: czy `CLAUDE.md`, README i komentarze opisują stan faktyczny (nowe funkcje bazy, zmienne środowiskowe, komendy).
