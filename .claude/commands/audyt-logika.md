---
description: Audyt logiki biznesowej i spójności danych Metando (miejsca, rezerwa, goście, terminy, wyścigi) — tylko raport
---

Przeprowadź audyt logiki biznesowej i spójności danych. Najpierw przeczytaj `.claude/audyty/zasady.md` i stosuj się do niego. Reguły domenowe opisuje `CLAUDE.md`; ich źródłem prawdy są funkcje w `supabase/migrations/` (czytaj najnowszą definicję każdej funkcji).

1. **Niezmienniki miejsc** — wypisz je wprost i sprawdź, czy każda funkcja je zachowuje:
   - skład = `spots` + grający organizator + `guest_count`; zaakceptowani ≤ `spots`; rezerwa ≤ `reserve_spots`;
   - `guest_count` = suma `guest_invites.reserved`; `guest_confirmed` = liczba odpowiedzi „yes”; potwierdzeni w puli ≤ zarezerwowani;
   - co najmniej jedno miejsce zostaje dla graczy z Metando;
   - minimum osób (`events_min_people_range`) mieści się w składzie.
     Dla każdej funkcji zmieniającej te liczby (`request_to_join`, `withdraw…`, `remove_participant`, `settle_event`, `set_my_invites`, `respond_to_invite`, `join_event_as_guest`, `join_event_claiming_guest`, `release_*`, `update_event`, `respond_to_cancellation` …) opisz, czy po niej niezmienniki nadal są prawdziwe — także przy błędzie w połowie.
2. **Współbieżność**: czy funkcje blokują wiersz spotkania (`for update`) zanim liczą miejsca; scenariusz „dwie osoby klikają ostatnie miejsce naraz”, „gość i rezerwowy w tej samej sekundzie”.
3. **Czas i strefy**: 12-godzinne progi (rezygnacja, edycja, zwalnianie zaproszeń), zamknięcie czatu 3 dni po spotkaniu, filtry „dziś / jutro / weekend” i wybór dnia (Europe/Warsaw vs UTC, zmiana czasu), odliczanie, pogoda na czas meczu.
4. **Stany spotkania**: aktywne → odwołane → przejęte przez uczestnika (`organizer_left`, `handover_at`); co widzi i może każda rola w każdym stanie (organizator, uczestnik, rezerwa, oczekujący, gość bez konta, osoba z zewnątrz, admin).
5. **Obiekty i rezerwacje**: `apply_venue_rules`, `events_venue_no_overlap`, godziny otwarcia, cena za godzinę, `decide_venue_booking`, reset statusu przy zmianie terminu.
6. **Szansa na mecz** (`src/lib/chance.ts`) i liczniki na liście („W pobliżu”, liczby przy sportach, promienie): czy liczą to samo, co pokazuje strona spotkania.
7. **Pokrycie testami**: dla każdej reguły wskaż test w `tests/integration/` albo zgłoś brak (z propozycją przypadku testowego).
