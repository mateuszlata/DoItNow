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

- FR-007: Zalogowany użytkownik może dołączyć do ogłoszenia. Domyślnie dołączenie jest natychmiastowe (skład, a gdy pełny — lista rezerwowa); organizator może przy ogłoszeniu włączyć „Wymagaj mojej akceptacji”, wtedy zgłoszenie oczekuje na jego decyzję. Priority: must-have
  > Zmiana 2026-10-08 (feedback z testów): ręczna akceptacja hamowała spontaniczne spotkania; domyślnie dołączenie jest automatyczne, a ochronę przed niechcianymi osobami daje FR-016 (usuwanie) i opcjonalny przełącznik akceptacji.
  > Socrates: Counter-argument considered: „dołączyć może każdy, także nieodpowiednia osoba”. Resolution: zmienione — zapis wymaga akceptacji organizatora; miejsce w limicie zajmuje dopiero zaakceptowane zgłoszenie.
- FR-008: Uczestnik może zrezygnować z udziału najpóźniej 12 h przed wydarzeniem. Priority: must-have
  > Socrates: Counter-argument considered: „rezygnacja tuż przed meczem psuje skład”. Resolution: zmienione — rezygnacja tylko do granicy czasowej.
- FR-009: Użytkownik może zobaczyć „Moje spotkania”: utworzone przez siebie oraz te, do których się zgłosił, ze statusem zgłoszenia. Priority: must-have
  > Socrates: Counter-argument considered: „status widać też w szczegółach ogłoszenia”. Resolution: bez zmian.
- FR-010: Organizator może zaakceptować lub odrzucić zgłoszenie do swojego ogłoszenia. Priority: must-have

### Skład, rezerwa i przekazanie spotkania (dodane 2026-10-08, feedback użytkownika)

- FR-012: Szczegóły ogłoszenia pokazują skład jako okienka: zielone — zajęte (z nickiem, organizator z dopiskiem), pomarańczowe — wolne, czerwone — lista rezerwowa. Goście widzą tylko kolory, bez nicków. Priority: nice-to-have
- FR-013: Organizator może ustawić minimalną liczbę osób (łącznie z sobą, jeśli gra); karta i szczegóły pokazują, ilu osób brakuje albo że spotkanie dojdzie do skutku. Aplikacja tylko informuje — nie odwołuje spotkania automatycznie. Priority: nice-to-have
- FR-014: Organizator może ustawić długość listy rezerwowej. Gdy skład jest pełny, akceptacja zgłoszenia dopisuje osobę do rezerwy; gdy w składzie zwolni się miejsce, pierwsza osoba z rezerwy (najdłużej czekająca) wskakuje automatycznie. Rezerwę można opuścić do startu. Priority: nice-to-have
- FR-015: Gdy organizator odwołuje spotkanie z zaakceptowanymi uczestnikami, spotkanie nie znika: jego miejsce się zwalnia (może je zająć rezerwa), a zaakceptowani dostają w aplikacji pytanie „Zostaję / Rezygnuję” (do startu). Pierwsza osoba, która zostaje, przejmuje organizację; gdy wszyscy zrezygnują, spotkanie jest odwołane. Bez zaakceptowanych uczestników odwołanie działa jak dotąd. Priority: nice-to-have
- FR-016: Organizator może do startu usunąć uczestnika ze składu, rezerwy lub oczekujących; zwolnione miejsce zajmuje pierwsza osoba z rezerwy, a usunięta osoba nie może ponownie dołączyć do tego spotkania. Priority: must-have
- FR-017: Ogłoszenie ma czas trwania (domyślnie 90 minut); lista i szczegóły pokazują godziny od–do. Priority: must-have
- FR-018: Zarządca terenu (każdy zalogowany, który doda obiekt) prowadzi w „Moich obiektach” obiekty z nazwą, adresem i pinezką, sportami, ceną za godzinę i godzinami otwarcia w tygodniu. Priority: nice-to-have
- FR-019: Organizator może wybrać obiekt w ogłoszeniu: miejsce i pinezka pochodzą z obiektu, termin musi mieścić się w godzinach otwarcia i nie może nachodzić na inne nieodwołane spotkanie na tym obiekcie, sport musi być w ofercie obiektu. Koszt spotkania = cena za godzinę × czas trwania, dzielony równo na miejsca w składzie i pokazywany na osobę. Priority: nice-to-have
  > Zmiana 2026-10-09 (feedback z testów): panel zarządcy terenu z opłatami, etap 1 z 3. Etap 2 — kalendarz zarządcy i akceptacja terminów; etap 3 — płatności online w trybie testowym (Stripe) i rozliczenia.
- FR-020: Zarządca obiektu widzi w kalendarzu rezerwacji nadchodzące spotkania na swoich obiektach i potwierdza albo odrzuca termin (z powodem widocznym dla organizatora). Nowy albo zmieniony (termin, czas trwania, sport, obiekt) termin czeka na decyzję; odrzucony termin zwalnia obiekt dla innych; potwierdzenie można odwołać do startu. Status rezerwacji widać na karcie i w szczegółach, a liczba terminów czekających na decyzję trafia do znaczka przy nicku zarządcy. Priority: nice-to-have
  > Decyzja 2026-10-10: płatności (etap 3 panelu zarządcy) odłożone całkowicie — koszt obiektu jest tylko informacją, rozliczenia odbywają się poza aplikacją. Do rozważenia później: przedpłata przez polskiego operatora z obsługą platform i BLIK, model „wszystko albo nic” przy minimum osób.

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

### Pomysł do zweryfikowania: tokeny Metando i kaucja za obecność (2026-10-10)

Użytkownik doładowuje konto w Metando (np. 30–50 zł przez BLIK) i płaci tokenami wyłącznie za usługi samego Metando — nigdy za obiekt (wtedy byłaby to usługa płatnicza wymagająca licencji). Najmocniejszy wariant: kaucja za obecność — przy dołączeniu blokowany jest 1 token, który wraca po spotkaniu, a przepada przy niestawieniu się bez rezygnacji. Inne możliwe zastosowania: wyróżnienie ogłoszenia, spotkania cykliczne, pakiet premium. Do sprawdzenia przed budową: czy gracze i organizatorzy by z tego skorzystali (rozmowy z kilkunastoma osobami), VAT i paragony od doładowań, regulamin ważności tokenów i zwrot niewykorzystanych środków (UOKiK), rozliczanie przedpłat. Owner: user.
