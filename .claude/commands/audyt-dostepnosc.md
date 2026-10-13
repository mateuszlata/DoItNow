---
description: Audyt dostępności Metando (WCAG 2.2 AA, telefon, klawiatura, czytniki ekranu, kontrast) — tylko raport
---

Przeprowadź audyt dostępności według WCAG 2.2 na poziomie AA. Najpierw przeczytaj `.claude/audyty/zasady.md` i stosuj się do niego. Kolory i reguły marki są w `src/styles/global.css` i w design systemie (https://claude.ai/artifact/7CMztJ4HWXvdNYu3P2ezJn — sekcja o kontraście).

Sprawdź kod stron (`src/pages/**/*.astro`) i komponentów (`src/components/**`), a tam, gdzie się da, także działającą lokalną wersję (`npm run build && npm run preview`) w widoku telefonu 375 px:

1. **Kontrast** tekstu (4,5:1, duży tekst 3:1) i elementów sterujących (3:1: obramowania pól, ikony, focus) na każdym tle — kremowe karty, zielone boisko, pomarańczowe paski, plakietki (szansa, pogoda, status). Policz wartości dla par tokenów, nie zgaduj.
2. **Klawiatura**: wszystko dostępne z Tab / Enter / Spacja / Esc — menu udostępniania, lista promieni, wybór okolicy, czat, składy (przeciąganie zawodników!), kreator barw; widoczny focus; brak pułapek.
3. **Czytniki ekranu**: etykiety pól i przycisków-ikon, `aria-*` na menu i listach, ogłaszanie zmian (`role="status"`, `aria-live`) przy dołączaniu, czacie, odświeżaniu na żywo; sensowna kolejność nagłówków; tekst alternatywny obrazków i ukrywanie ozdobników (koszulki, ikony).
4. **Telefon**: cele dotyku co najmniej 24×24 px (lepiej 44), brak przewijania w poziomie, powiększanie tekstu do 200%, orientacja, dolny pasek nie zasłania treści.
5. **Formularze**: komunikaty błędów powiązane z polami, wymagane pola oznaczone, autouzupełnianie (`autocomplete`), podpowiedzi zrozumiałe bez koloru.
6. **Ruch i czas**: animacja logo i inne animacje respektują `prefers-reduced-motion`; automatyczne przeładowanie strony spotkania nie gubi pozycji ani wpisanego tekstu.
7. **Język i treść**: `lang="pl"`, zrozumiałe komunikaty, informacja nie tylko kolorem (szansa, pogoda, statusy).
