# Zasady audytów Metando

Wspólne dla wszystkich komend `/audyt-*`. Metando to prawdziwy produkt (https://metando.pl), więc audyt ma szukać rzeczy, które realnie zaszkodzą użytkownikom, danym albo właścicielowi — nie stylu dla samego stylu.

## Tryb pracy

- **Tylko do odczytu.** Nie zmieniaj plików, nie commituj, nie wdrażaj, nie uruchamiaj migracji. Możesz czytać kod, uruchamiać `npm run lint`, `npx astro check`, `npm test` (lokalny Supabase) i polecenia, które niczego nie zapisują.
- **Nie dotykaj produkcji.** Żadnych kont, logowań ani zapisów na metando.pl. Wolno tylko czytać publiczne strony (GET) bez danych osobowych. Nie używaj haseł ani sekretów.
- **Weryfikuj każde ustalenie.** Zanim coś zgłosisz, znajdź dokładne miejsce w kodzie i opisz konkretny scenariusz (kto, co robi, co się dzieje). Jeśli to tylko podejrzenie, oznacz je „do sprawdzenia” i napisz, jak to sprawdzić. Nie zgłaszaj rzeczy, które obsługuje warstwa, której nie przeczytałeś — najpierw ją przeczytaj (np. reguły w funkcjach Postgres w `supabase/migrations/`, które często blokują to, co wygląda na lukę w TypeScripcie).
- **Kontekst projektu:** reguły biznesowe i konwencje są w `CLAUDE.md`; logika domenowa żyje w funkcjach `security definer` w migracjach (późniejsza migracja nadpisuje wcześniejszą definicję); serwisy w `src/lib/services/` mapują kody błędów na polskie komunikaty.

## Format raportu

Pisz po polsku. Raport zapisz do `docs/audyty/<rodzaj>-<RRRR-MM-DD>.md` (to jedyny plik, który wolno utworzyć) i streść go w odpowiedzi.

1. **Podsumowanie** — 3–5 zdań: ogólna ocena i trzy najważniejsze rzeczy do zrobienia.
2. **Ustalenia** — tabela posortowana od najpoważniejszych:

   | # | Waga | Obszar | Plik:linia | Problem | Scenariusz | Poprawka |

   Wagi:
   - **Krytyczne** — utrata lub wyciek danych, przejęcie konta, obejście reguł w bazie, łamanie prawa; naprawić przed kolejnym wdrożeniem.
   - **Wysokie** — realna szkoda dla użytkowników albo kosztów przy normalnym użyciu.
   - **Średnie** — szkoda w nietypowej sytuacji albo wyraźne ryzyko na przyszłość.
   - **Niskie** — drobiazg, porządek, dobra praktyka.

3. **Co jest dobrze** — krótko, żeby wiedzieć, czego nie ruszać.
4. **Do sprawdzenia** — podejrzenia, których nie dało się potwierdzić, i jak je potwierdzić.
5. **Plan** — kolejność napraw (najpierw krytyczne i tanie), z szacunkiem wysiłku (S / M / L).

Nie proponuj przepisywania całości. Poprawka ma być najmniejszą zmianą, która usuwa problem.
