---
project: "DoItNow"
context_type: greenfield
created: 2026-10-07
updated: 2026-10-08
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "zakres pierwszej wersji (chaos → regularność)"
      decision: "tylko jednorazowe ogłoszenia; stałe grupy w kolejnej wersji"
    - topic: "persona"
      decision: "dorosły z jednego miasta"
    - topic: "obecne obejście"
      decision: "rezygnuje albo ćwiczy sam; ogólny obraz niezweryfikowany"
  frs_drafted: 10
  quality_check_status: accepted
---

## Seed idea

Aplikacja łącząca osoby, które chcą w danym czasie uprawiać tę samą aktywność. Użytkownik po zalogowaniu tworzy ogłoszenie (aktywność, data i godzina, miejsce, limit osób), inni przeglądają listę z filtrami i dołączają albo rezygnują. Reguły: limit miejsc, brak zapisów na minione wydarzenia. Termin: 4 listopada 2026, dostępność 6–8 h dziennie. Doświadczenie: głównie teoretyczne, jeden projekt zrobiony z AI (matemio.pl).
Otwarte pytania: kto będzie pierwszymi użytkownikami? Czy blokować nakładające się zapisy? Które jedno rozszerzenie wybrać (okolica, powiadomienia, automatyczne testy i wdrożenie) i czy celować w blok dodatkowy?

## Vision & Problem Statement

Dorośli, którzy chcą uprawiać aktywność fizyczną (jazda na rowerze, piłka nożna, koszykówka), często nie mają z kim: znajomości z młodych lat zanikły albo znajomych chętnych na daną aktywność jest za mało. Gdy taka osoba chce się poruszać, rezygnuje i zostaje w domu albo ćwiczy sama, co przy grach zespołowych w praktyce oznacza rezygnację. Kosztem jest brak ruchu, gorsze zdrowie i zanikające kontakty towarzyskie.

Wgląd: spotkania zaczynają się od przypadkowej grupy chętnych na konkretny termin, a z czasem przekształcają się w stałą grupę, która spotyka się regularnie („od chaosu do porządku i regularności”). Pierwsza wersja obsługuje tylko pierwszy etap: jednorazowe ogłoszenia; stałe grupy są celem kolejnych wersji.

## User & Persona

### Primary persona

Dorosły mieszkaniec jednego miasta, który chce uprawiać konkretną aktywność (np. rower, piłka nożna, koszykówka), ale nie ma wystarczająco wielu chętnych znajomych. Sięga po produkt, gdy chce się poruszać w określonym czasie i szuka osób, które dołączą.

## Access Control

- Model płaski: jedna rola użytkownika. Konto jest wymagane, aby tworzyć ogłoszenia oraz dołączać do nich i rezygnować.
- Tylko autor ogłoszenia może je edytować i usuwać.
- Niezalogowany gość może przeglądać listę ogłoszeń; próba utworzenia ogłoszenia lub dołączenia kieruje do logowania.
- Metoda logowania (e-mail + hasło / Google / link e-mail): nieustalona — patrz Open Questions.

## MVP flow

1. Organizator loguje się.
2. Organizator tworzy ogłoszenie: sport, miejsce, data i godzina, liczba potrzebnych osób.
3. Druga osoba (zalogowana) przegląda listę i widzi ogłoszenie.
4. Druga osoba klika „Dołącz”.
5. Obie strony widzą listę uczestników i liczbę wolnych miejsc (np. 3/5).

## Timeline budget

- mvp_weeks: 3 (pierwszy przepływ ~1 tydzień)
- hard_deadline: 2026-11-04

## Success Criteria

### Primary
- Organizator tworzy ogłoszenie, inna zalogowana osoba znajduje je na liście i dołącza, a obie strony widzą listę uczestników i liczbę wolnych miejsc.

### Secondary
- Przynajmniej jedno prawdziwe ogłoszenie osiąga limit uczestników.

### Guardrails
- Prywatność danych kontaktowych: e-mail i dane użytkownika nie są widoczne publicznie, w tym dla gości.

## Functional Requirements

### Konto i dostęp
- FR-001: Gość może przeglądać listę ogłoszeń bez logowania, widząc sport, dzień i ogólną lokalizację; dokładne miejsce i uczestnicy są widoczne dopiero po zalogowaniu. Priority: must-have
  > Socrates: Counter-argument considered: „obcy widzą, kiedy i gdzie ktoś będzie”. Resolution: zmienione — gość widzi tylko ogólne informacje, szczegóły po zalogowaniu.
- FR-002: Użytkownik może założyć konto i zalogować się. Priority: must-have
  > Socrates: Counter-argument considered: „reset hasła to dodatkowa praca”. Resolution: bez zmian — konto jest niezbędne do przypisania ogłoszeń i zapisów.

### Ogłoszenia
- FR-003: Użytkownik może utworzyć ogłoszenie: sport ze stałej listy, miejsce, data i godzina, limit osób, opcjonalny opis od organizatora. Priority: must-have
  > Socrates: Counter-argument considered: „limit 0/1 nie ma sensu; opis niczego nie blokuje”. Resolution: bez zmian.
- FR-004: Autor może edytować własne ogłoszenie najpóźniej 12 h przed wydarzeniem oraz odwołać je w każdej chwili; uczestnicy widzą status „odwołane”. Priority: must-have
  > Socrates: Counter-argument considered: „autor zmienia godzinę lub miejsce, a zapisani o tym nie wiedzą”. Resolution: zmienione — edycja do 12 h przed wydarzeniem; odwołanie zawsze, zamiast cichego usunięcia.
- FR-005: Użytkownik może przeglądać listę nadchodzących ogłoszeń (od najbliższego) filtrowaną po sporcie i dniu. Priority: must-have
  > Socrates: Counter-argument considered: „lista zapchana minionymi wydarzeniami”. Resolution: zmienione — tylko przyszłe ogłoszenia, sortowane od najbliższego.
- FR-006: Użytkownik może zobaczyć szczegóły ogłoszenia z listą uczestników (imię lub nick, nigdy e-mail) i liczbą wolnych miejsc. Priority: must-have
  > Socrates: Counter-argument considered: „lista uczestników może zdradzać dane osobowe”. Resolution: zmienione — tylko imię/nick.

### Zapisy
- FR-007: Użytkownik może zgłosić chęć udziału w ogłoszeniu; zgłoszenie oczekuje na akceptację organizatora. Priority: must-have
  > Socrates: Counter-argument considered: „dołączyć może każdy, także nieodpowiednia osoba”. Resolution: zmienione — zapis wymaga akceptacji organizatora; miejsce w limicie zajmuje dopiero zaakceptowane zgłoszenie.
- FR-008: Uczestnik może zrezygnować z udziału najpóźniej 12 h przed wydarzeniem. Priority: must-have
  > Socrates: Counter-argument considered: „rezygnacja tuż przed meczem psuje skład”. Resolution: zmienione — rezygnacja tylko do granicy czasowej.
- FR-009: Użytkownik może zobaczyć „Moje spotkania”: utworzone przez siebie oraz te, do których się zgłosił, ze statusem zgłoszenia. Priority: must-have
  > Socrates: Counter-argument considered: „status widać też w szczegółach ogłoszenia”. Resolution: bez zmian.
- FR-010: Organizator może zaakceptować lub odrzucić zgłoszenie do swojego ogłoszenia. Priority: must-have
  > Socrates: Wynika bezpośrednio z decyzji przy FR-007 (akceptacja zapisów); bez osobnego kontrargumentu.

## User Stories

### US-01: Zgłoszenie i akceptacja udziału

- **Given** zalogowany użytkownik i nadchodzące ogłoszenie z wolnym miejscem
- **When** użytkownik zgłasza chęć udziału, a organizator akceptuje zgłoszenie
- **Then** oboje widzą go na liście uczestników, a liczba wolnych miejsc spada o 1

## Business Logic

Aplikacja prowadzi zgłoszenie od chęci udziału do potwierdzonego miejsca: przyjmuje je tylko na nadchodzące wydarzenie, pozwala organizatorowi zaakceptować je wyłącznie przy wolnym miejscu i blokuje zmiany oraz rezygnacje po granicy czasowej.

Wejścia: ogłoszenie z datą i godziną wydarzenia oraz limitem osób; zgłoszenia użytkowników; decyzje organizatora (akceptacja / odrzucenie); bieżący czas. Zgłoszenie przechodzi przez stany: oczekuje → zaakceptowane albo odrzucone; zaakceptowany uczestnik może zrezygnować. Miejsce w limicie zajmuje wyłącznie zaakceptowane zgłoszenie — gdy brak wolnych miejsc, kolejnego zgłoszenia nie da się zaakceptować; rezygnacja zwalnia miejsce.

Granica czasowa wynosi 12 h przed wydarzeniem i jest wspólna: po niej autor nie może edytować ogłoszenia, a uczestnik nie może zrezygnować. Odwołanie ogłoszenia przez autora jest możliwe zawsze, a uczestnicy widzą status „odwołane”. Na wydarzenia, które już się odbyły, nie można się zgłaszać i nie pojawiają się one na liście.

## Non-Functional Requirements

- Wszystkie funkcje są w pełni używalne na ekranie smartfona o szerokości od ok. 360 px, bez przewijania w poziomie.
- Adres e-mail i dane kontaktowe użytkownika nie są widoczne dla innych użytkowników ani gości; inni widzą wyłącznie imię lub nick.

## Product framing

- product_type: web-app (aplikacja webowa, używana także na telefonie)
- target_scale: users: small (Ty i garstka osób), qps: low, data_volume: small
- timeline_budget: mvp_weeks: 3, hard_deadline: 2026-11-04, after_hours_only: false (własny czas, pełne dni)
- Uwaga ze skali x100: ręczna akceptacja zgłoszeń przestaje wystarczać przy tysiącach użytkowników; w przyszłości potrzebny byłby np. tryb automatycznej akceptacji.

## Non-Goals

- Stałe grupy i cykliczne spotkania: MVP obsługuje tylko jednorazowe ogłoszenia (etap „chaosu”); etap „regularności” z wizji to kolejna wersja.

## Open Questions (running)

1. **Co faktycznie robią dziś osoby bez towarzystwa do aktywności?** Obraz „rezygnuje / ćwiczy sam” jest założeniem, niezweryfikowanym na konkretnych osobach. — Owner: user.
2. **Jaka metoda logowania?** (e-mail + hasło / Google / link e-mail bez hasła) — Owner: user. Do rozstrzygnięcia przy wyborze stacku.
3. **Czat, mapy/odległość, powiadomienia, oceny uczestników: w MVP czy nie?** Nie zostały wykluczone jako non-goals ani dodane jako FR. Kandydaci na jedno rozszerzenie po MVP (okolica / powiadomienia / automatyczne testy i wdrożenie). — Owner: user. Do decyzji po działającym MVP.

## Quality cross-check

Status: accepted (2026-10-08). Access Control, Business Logic, project artifacts, timeline-cost (3 tygodnie) i Non-Goals obecne. Uwaga: Non-Goals zawiera jedną pozycję; czat, mapy, powiadomienia i oceny są otwartym pytaniem nr 3, nie częścią MVP.
