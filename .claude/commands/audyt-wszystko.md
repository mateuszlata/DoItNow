---
description: Pełny audyt Metando ze wszystkich stron naraz (osobne raporty i jedno zestawienie) — tylko raport
---

Przeprowadź pełny audyt Metando. Najpierw przeczytaj `.claude/audyty/zasady.md`.

Uruchom równolegle osobnych agentów (po jednym na każdy rodzaj), przekazując każdemu treść odpowiedniej komendy z `.claude/commands/` i zasady z `.claude/audyty/zasady.md`:
`audyt-bezpieczenstwo`, `audyt-rodo`, `audyt-logika`, `audyt-dostepnosc`, `audyt-wydajnosc`, `audyt-ux`, `audyt-kod`, `audyt-produkcja`.

Każdy agent zapisuje swój raport w `docs/audyty/`. Gdy wszystkie skończą:

1. Zweryfikuj samodzielnie każde ustalenie o wadze Krytyczne i Wysokie (otwórz wskazany kod, potwierdź scenariusz) — odrzuć te, które się nie potwierdzą, i napisz dlaczego.
2. Usuń duplikaty (ten sam problem zgłoszony z kilku stron) i połącz je w jedno ustalenie.
3. Zapisz zestawienie w `docs/audyty/zestawienie-<RRRR-MM-DD>.md`: tabela wszystkich potwierdzonych ustaleń od najpoważniejszych, z odnośnikiem do raportu źródłowego, oraz plan napraw w trzech falach (teraz / przed pierwszymi 100 użytkownikami / później).
4. W odpowiedzi streść: ocenę ogólną w 3 zdaniach, 5 najważniejszych napraw, ile ustaleń jest w każdej wadze.
