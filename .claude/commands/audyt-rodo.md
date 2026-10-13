---
description: Audyt prywatności i RODO Metando (jakie dane, gdzie płyną, zgodność z polityką prywatności) — tylko raport
---

Przeprowadź audyt prywatności i zgodności z RODO. Najpierw przeczytaj `.claude/audyty/zasady.md` i stosuj się do niego. To nie jest porada prawna — wskaż ryzyka i rozbieżności, a sprawy wymagające prawnika oznacz.

1. **Inwentarz danych osobowych**: przejdź przez migracje (`supabase/migrations/`), serwisy i formularze. Zrób tabelę: dana (e-mail, nick, strój, pozycje, ulubione sporty, wiadomości czatu, zgłoszenia, imiona gości, skrót urządzenia, okolica „W pobliżu”, IP przy Turnstile itd.) → gdzie przechowywana → kto ją widzi → jak długo → podstawa prawna.
2. **Odbiorcy i przekazania**: każdy zewnętrzny serwis, do którego trafiają dane (Supabase, Cloudflare Workers i Turnstile, Google Places, Photon/OpenStreetMap, Open-Meteo, mapy OSM w przeglądarce, Google Fonts — sprawdź, czy fonty są na pewno lokalne). Czy przekazanie poza EOG jest opisane.
3. **Zgodność z dokumentami**: porównaj ustalenia z `src/pages/prywatnosc.astro` i `src/pages/regulamin.astro` (oraz `src/lib/legal.ts`). Wypisz wszystko, co aplikacja robi, a polityka tego nie mówi — i odwrotnie.
4. **Prawa użytkownika**: usunięcie konta (co dokładnie znika, co zostaje — wiadomości, odpowiedzi gości, rezerwacje obiektów), dostęp do danych, sprostowanie, sprzeciw. Czy usunięcie konta faktycznie czyści dane (test `delete-account`).
5. **Minimalizacja i retencja**: czy zbieramy tylko to, co potrzebne; czy coś żyje wiecznie, choć nie musi (stare spotkania, czat po zamknięciu, odpowiedzi gości, logi, zgłoszenia moderacji).
6. **Ciasteczka i pamięć przeglądarki**: lista ciasteczek i kluczy `localStorage` / `sessionStorage`, czy wszystkie są niezbędne (bez zgody) i opisane w polityce.
7. **Osoby bez konta i dzieci**: goście z zaproszeń i ze strony spotkania — jakie dane o nich zbieramy i czy wiedzą o tym w chwili podania imienia; deklaracja 18+.
8. **Moderacja i DSA**: zgłaszanie treści, ukrywanie wiadomości, kontakt dla użytkowników i organów — czy spełnia podstawowe obowiązki platformy z treściami użytkowników.
