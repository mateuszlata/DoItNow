---
description: Audyt UX i treści Metando (ścieżki użytkowników, komunikaty, puste stany, telefon) — tylko raport
---

Przeprowadź audyt doświadczenia użytkownika i treści. Najpierw przeczytaj `.claude/audyty/zasady.md` i stosuj się do niego. Zasady języka i wyglądu opisuje README design systemu (https://claude.ai/artifact/7CMztJ4HWXvdNYu3P2ezJn): polski, na „Ty”, krótkie czasowniki na przyciskach, stan podany liczbami.

Przejdź każdą ścieżkę w kodzie, a jeśli się da — w lokalnej wersji w widoku telefonu (konta tylko testowe, lokalne):

1. **Pierwsza wizyta z linku** od znajomego (strona spotkania bez konta) → dołączenie jako gość → czat do czytania → założenie konta → przejęcie miejsca.
2. **Zaproszenie osobiste** (`/i/[token]`) → odpowiedź → zmiana zdania.
3. **Organizator**: utworzenie spotkania (z obiektem i bez), udostępnienie, zaproszenia z pulą, akceptacja zgłoszeń, składy, edycja, odwołanie.
4. **Gracz**: lista z filtrami (sport, termin, W pobliżu, promień), dołączenie, rezerwa, rezygnacja, „Moje”, barwy i pozycje.
5. **Zarządca obiektu i admin**: dodanie obiektu, decyzje o rezerwacjach, moderacja czatu.

Dla każdej ścieżki oceń:

- liczbę kroków i miejsca, gdzie łatwo się zgubić albo zrezygnować;
- komunikaty sukcesu i błędów (czy mówią, co się stało i co dalej; spójność słownictwa: „spotkanie” vs „ogłoszenie”, „skład”, „rezerwa”, „gość”);
- puste stany (brak spotkań, brak wyników w promieniu, pusty czat, brak prognozy);
- przypadki brzegowe (pełny skład, spotkanie za 1 h, odwołane, minione, brak internetu);
- spójność z design systemem (pigułki, kolory statusów, emoji tylko jako znaczniki).

Na końcu: lista 5 zmian, które najbardziej zwiększą liczbę osób, które dołączają i wracają.
