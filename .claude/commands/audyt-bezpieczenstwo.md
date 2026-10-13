---
description: Audyt bezpieczeństwa Metando (RLS, funkcje w bazie, API, sesje, boty, sekrety) — tylko raport, bez zmian w kodzie
---

Przeprowadź audyt bezpieczeństwa Metando. Najpierw przeczytaj `.claude/audyty/zasady.md` i stosuj się do niego (tryb tylko do odczytu, weryfikacja, format raportu).

Zakres i co sprawdzić:

1. **RLS i uprawnienia w bazie** (`supabase/migrations/`, czytaj w kolejności nazw — późniejsza migracja nadpisuje wcześniejszą):
   - każda tabela ma włączone RLS i polityki per operacja i rola; brak polityk insert/update tam, gdzie zmiany idą przez funkcje (zgodnie z CLAUDE.md);
   - każda funkcja `security definer` ma `set search_path = ''`, sprawdza `auth.uid()` / członkostwo / organizatora zanim cokolwiek zmieni, a `revoke … from public, anon` i `grant` odpowiadają temu, kto naprawdę powinien ją wołać;
   - funkcje dostępne dla `anon` (zaproszenia, dołączanie gościa, widok gościa, czat gościa, `release_stale_invites`): czy da się nimi odczytać lub zmienić cudze dane, zgadując token / id spotkania / identyfikator urządzenia; czy limity (np. 60 odpowiedzi) chronią przed zalaniem;
   - widoki (`events_public`): czy nie wystawiają więcej, niż powinny (dokładne miejsce, opis, organizator).
2. **Endpointy API** (`src/pages/api/**`): walidacja zod każdego wejścia, sprawdzenie zalogowania tam, gdzie trzeba, `prerender = false`, brak ufania danym z formularza (np. id użytkownika), poprawne kody błędów, brak wycieku szczegółów błędów do klienta.
3. **Sesje i logowanie** (`src/middleware.ts`, `src/lib/supabase.ts`, `src/pages/api/auth/*`): ciasteczka (httpOnly, secure, sameSite), przekierowanie `next` (otwarte przekierowania — `src/lib/next-path.ts`), chronione ścieżki, wylogowanie, reset hasła.
4. **Ochrona przed botami i nadużyciami**: Turnstile (`src/lib/turnstile.ts`) na każdej akcji bez konta; limity czatu; pula zapytań Google (`consume_places_quota`); publiczne endpointy wołające zewnętrzne API (`/api/weather`, `/api/places/area`) — czy da się nimi generować koszty albo nadużyć cudzego API.
5. **XSS i treści użytkowników**: czat (linki, `withLinks`), opisy spotkań, nazwy gości, `set:html` / `dangerouslySetInnerHTML`, atrybuty `href` z danych użytkownika.
6. **Sekrety i konfiguracja**: brak sekretów w repozytorium i w kodzie trafiającym do przeglądarki (`astro:env` — `access: "secret"`), `.dev.vars` w `.gitignore`, klucz Google tylko po stronie serwera, nagłówki bezpieczeństwa (CSP, X-Frame-Options, Referrer-Policy) — czy są ustawione i czy powinny.
7. **Zależności**: `npm audit --omit=dev` (tylko odczyt), przestarzałe pakiety z znanymi lukami.

Na końcu raportu dodaj sekcję „Model zagrożeń w 5 zdaniach”: kto może chcieć zaszkodzić Metando, co jest najcenniejsze i które z twoich ustaleń to blokuje.
