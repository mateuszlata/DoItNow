---
project: "DoItNow"
version: 1
status: draft
created: 2026-10-08
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: false
---

## Vision & Problem Statement

Dorośli, którzy chcą uprawiać aktywność fizyczną (jazda na rowerze, piłka nożna, koszykówka), często nie mają z kim: znajomości z młodych lat zanikły albo znajomych chętnych na daną aktywność jest za mało. Gdy taka osoba chce się poruszać, rezygnuje i zostaje w domu albo ćwiczy sama, co przy grach zespołowych w praktyce oznacza rezygnację. Kosztem jest brak ruchu, gorsze zdrowie i zanikające kontakty towarzyskie.

Wgląd: spotkania zaczynają się od przypadkowej grupy chętnych na konkretny termin, a z czasem przekształcają się w stałą grupę, która spotyka się regularnie („od chaosu do porządku i regularności”). Pierwsza wersja obsługuje tylko pierwszy etap: jednorazowe ogłoszenia; stałe grupy są celem kolejnych wersji. Przy skali 100 razy większej ręczna akceptacja zgłoszeń przestaje wystarczać — w przyszłości potrzebny byłby np. tryb automatycznej akceptacji.

## User & Persona

### Primary persona

Dorosły mieszkaniec jednego miasta, który chce uprawiać konkretną aktywność (np. rower, piłka nożna, koszykówka), ale nie ma wystarczająco wielu chętnych znajomych. Sięga po produkt, gdy chce się poruszać w określonym czasie i szuka osób, które dołączą.

## Success Criteria

### Primary

- Organizator tworzy ogłoszenie, inna zalogowana osoba znajduje je na liście i dołącza, a obie strony widzą listę uczestników i liczbę wolnych miejsc.

### Secondary

- Przynajmniej jedno prawdziwe ogłoszenie osiąga limit uczestników.

### Guardrails

- Prywatność danych kontaktowych: e-mail i dane użytkownika nie są widoczne publicznie, w tym dla gości.

## User Stories

### US-01: Zgłoszenie i akceptacja udziału

- **Given** zalogowany użytkownik i nadchodzące ogłoszenie z wolnym miejscem
- **When** użytkownik zgłasza chęć udziału, a organizator akceptuje zgłoszenie
- **Then** oboje widzą go na liście uczestników, a liczba wolnych miejsc spada o 1

## Functional Requirements

### Konto i dostęp

- FR-001: Gość może przeglądać listę ogłoszeń bez logowania, widząc sport, dzień i ogólną lokalizację; dokładne miejsce i uczestnicy są widoczne dopiero po zalogowaniu. Priority: must-have
  > Socrates: Counter-argument considered: „obcy widzą, kiedy i gdzie ktoś będzie”. Resolution: zmienione — gość widzi tylko ogólne informacje, szczegóły po zalogowaniu.
- FR-002: Użytkownik może założyć konto i zalogować się. Priority: must-have
  > Socrates: Counter-argument considered: „reset hasła to dodatkowa praca”. Resolution: bez zmian — konto jest niezbędne do przypisania ogłoszeń i zapisów.

### Ogłoszenia

- FR-003: Użytkownik może utworzyć ogłoszenie: sport ze stałej listy, miejsce, data i godzina, liczba osób w całym składzie, informacja, czy organizator bierze udział (domyślnie tak — zajmuje wtedy jedno miejsce), opcjonalny opis od organizatora. Priority: must-have
  > Zmiana 2026-10-08 (feedback użytkownika): „11 z 11” było mylące, bo organizator też gra; skład liczony jest łącznie z organizatorem („11 z 12”).
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

### Mapa

- FR-011: Organizator może zaznaczyć miejsce spotkania pinezką na mapie (opcjonalnie); zalogowany użytkownik widzi mapę z pinezką w szczegółach ogłoszenia i rozwijaną pod kartą na liście oraz może otworzyć nawigację do miejsca. Goście nie widzą pinezki (jak dokładnego miejsca, FR-001). Priority: nice-to-have (dodane 2026-10-08)
  > Socrates: Wynika bezpośrednio z decyzji przy FR-007 (akceptacja zapisów); bez osobnego kontrargumentu.

## Non-Functional Requirements

- Wszystkie funkcje są w pełni używalne na ekranie smartfona o szerokości od ok. 360 px, bez przewijania w poziomie.
- Adres e-mail i dane kontaktowe użytkownika nie są widoczne dla innych użytkowników ani gości; inni widzą wyłącznie imię lub nick.

## Business Logic

Aplikacja prowadzi zgłoszenie od chęci udziału do potwierdzonego miejsca: przyjmuje je tylko na nadchodzące wydarzenie, pozwala organizatorowi zaakceptować je wyłącznie przy wolnym miejscu i blokuje zmiany oraz rezygnacje po granicy czasowej.

Wejścia: ogłoszenie z datą i godziną wydarzenia oraz limitem osób; zgłoszenia użytkowników; decyzje organizatora (akceptacja / odrzucenie); bieżący czas. Zgłoszenie przechodzi przez stany: oczekuje → zaakceptowane albo odrzucone; zaakceptowany uczestnik może zrezygnować. Miejsce w limicie zajmuje wyłącznie zaakceptowane zgłoszenie — gdy brak wolnych miejsc, kolejnego zgłoszenia nie da się zaakceptować; rezygnacja zwalnia miejsce.

Granica czasowa wynosi 12 h przed wydarzeniem i jest wspólna: po niej autor nie może edytować ogłoszenia, a uczestnik nie może zrezygnować. Odwołanie ogłoszenia przez autora jest możliwe zawsze, a uczestnicy widzą status „odwołane”. Na wydarzenia, które już się odbyły, nie można się zgłaszać i nie pojawiają się one na liście.

## Access Control

- Model płaski: jedna rola użytkownika. Konto jest wymagane, aby tworzyć ogłoszenia oraz dołączać do nich i rezygnować.
- Tylko autor ogłoszenia może je edytować (najpóźniej 12 h przed wydarzeniem) i odwołać (w każdej chwili przed startem). Ogłoszeń nie usuwa się trwale.
- Niezalogowany gość może przeglądać listę ogłoszeń (zakres widocznych informacji: FR-001); próba utworzenia ogłoszenia lub dołączenia kieruje do logowania.
- Logowanie: e-mail + hasło (rozstrzygnięte 2026-10-08, patrz Open Questions nr 2). Potwierdzanie adresu e-mail jest na produkcji wyłączone (limit wysyłki darmowej poczty Supabase); rejestracja od razu loguje. Do przywrócenia razem z własnym serwerem SMTP.

## Non-Goals

- Stałe grupy i cykliczne spotkania: MVP obsługuje tylko jednorazowe ogłoszenia (etap „chaosu”); etap „regularności” z wizji to kolejna wersja.

## Open Questions

1. **Co faktycznie robią dziś osoby bez towarzystwa do aktywności?** Obraz „rezygnuje / ćwiczy sam” jest założeniem, niezweryfikowanym na konkretnych osobach. — Owner: user.
2. ~~**Jaka metoda logowania?**~~ — Rozstrzygnięte 2026-10-08: e-mail + hasło.
3. **Czat, mapy/odległość, powiadomienia, oceny uczestników: w MVP czy nie?** Częściowo rozstrzygnięte 2026-10-08: mapa z pinezką weszła jako FR-011. Kierunek docelowy (user): mapa wszystkich spotkań i wyszukiwanie chętnych na dany sport w okolicy (po odległości) — kolejna wersja; pinezki zapisują współrzędne, więc to rozszerzenie nie wymaga zmiany danych. Nie zostały wykluczone jako non-goals ani dodane jako FR. Kandydaci na jedno rozszerzenie po MVP (okolica / powiadomienia / automatyczne testy i wdrożenie). — Owner: user. Do decyzji po działającym MVP. (Cross-check: Non-Goals zawiera tylko jedną pozycję — ryzyko, że te funkcje wejdą do zakresu bez decyzji.)
4. ~~**Usuwanie czy odwołanie ogłoszenia?**~~ — Rozstrzygnięte 2026-10-08: autor może tylko odwołać ogłoszenie (status „odwołane” widoczny dla uczestników); trwałego usuwania nie ma. Dodatkowa reguła: limit osób nie może spaść poniżej liczby zaakceptowanych uczestników.
5. **Czy blokować nakładające się zgłoszenia jednego użytkownika?** (pytanie z pierwotnego opisu pomysłu, nierozstrzygnięte) — Owner: user. Przed implementacją FR-007.
6. **Kto będzie pierwszymi użytkownikami?** (pytanie z pierwotnego opisu pomysłu; skala ustalona jako „Ty i garstka osób”, persona: jedno miasto) — Owner: user. Przed testem kryterium Secondary.
7. **Kryteria akceptacji US-01** (np. co widzi użytkownik przy odrzuceniu, przy braku wolnych miejsc, po upływie granicy 12 h) — nieuchwycone w notatkach. — Owner: user.
