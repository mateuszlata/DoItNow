# Metando — meet and do

Metando łączy dorosłych w jednym mieście, którzy chcą w danym terminie uprawiać sport albo inną aktywność, ale brakuje im ludzi. Organizator wystawia ogłoszenie („piłka nożna, sobota 18:00, Orlik na Mokotowie, brakuje 5 osób”), a inni dołączają jednym kliknięciem. Zarządcy obiektów (szkoły, hale, korty) dodają swoje obiekty z cennikiem i godzinami otwarcia oraz potwierdzają terminy w kalendarzu rezerwacji.

Produkcja: https://doitnow.doitnow-app.workers.dev

## Co potrafi

- **Ogłoszenia** z terminem, czasem trwania, składem (z grającym organizatorem lub bez), minimum osób, ławką rezerwowych, mapą z pinezką i opisem.
- **Dołączanie** od razu albo po akceptacji organizatora; organizator może usuwać uczestników. Rezerwa wskakuje automatycznie na zwolnione miejsce.
- **Rezygnacja** do 12 h przed startem; **odwołanie z przekazaniem** — po rezygnacji organizatora uczestnicy decydują, czy grają dalej, a pierwsza osoba, która zostaje, przejmuje organizację.
- **Skład jako koszulki z numerami** dopasowane do sportu (koszulka, polo, kolarska, numer startowy).
- **Lista z filtrami** (sport, dziś / jutro / weekend, dzień) i mapą na każdej karcie.
- **Obiekty zarządców**: cennik za godzinę, godziny otwarcia, koszt spotkania dzielony na osobę, pilnowanie godzin otwarcia i kolizji terminów, **kalendarz rezerwacji** z potwierdzaniem i odrzucaniem terminów.
- **Wyszukiwarka adresów** z podpowiedziami Google Places (przez serwer, w darmowej puli z budżetem kroczącym) i zapasowo OpenStreetMap.
- **Usuwanie konta** przez użytkownika (RODO).
- **Składy na mecz** (piłka nożna): pionowe boisko z graczami w ich barwach, ulubiona pozycja w profilu, podział na dwie drużyny według pozycji lub losowo z podpowiedziami przy konfliktach, ręczna zamiana graczy i animacja przefarbowania na kolory drużyn; ustawia organizator, widzą członkowie spotkania.
- **Panel administratora** (`/admin`): użytkownicy i aktywność, spotkania i odsetek pełnych składów, wykresy z 30 dni, lejek i powroty, sporty, dni i godziny, mapa spotkań, obiekty, moderacja zgłoszeń i limit Google. Dostęp: konta z tabeli `admins`.
- **Moje barwy**: kreator stroju (wzór, dwa kolory, numer albo inicjały) jako avatar w składzie, czacie i na górnym pasku; bez ustawienia — stały strój wyliczony z id konta.
- **Moje sporty**: wybór ulubionych sportów („W co grasz?”) jako domyślny filtr listy; lista pozwala wybrać kilka sportów naraz.
- **Czat w wydarzeniu** dla organizatora, składu i rezerwy: usuwanie własnych wiadomości, ukrywanie przez organizatora, zgłaszanie do moderacji (`/admin/reports` dla kont z tabeli `admins`), limit 10 wiadomości na minutę.
- **Regulamin i polityka prywatności** (`/regulamin`, `/prywatnosc`) z akceptacją przy rejestracji; zaakceptowana wersja trafia do metadanych konta. Dane operatora w `src/lib/legal.ts`.
- **Ochrona rejestracji przed botami** (Cloudflare Turnstile, token sprawdzany na serwerze).

Płatności w aplikacji są świadomie odłożone — koszt obiektu jest informacją, rozliczenia odbywają się poza Metando (zob. `context/foundation/prd.md`).

## Stos

Astro 7 (SSR) + React 19 (wyspy) + TypeScript + Tailwind 4 · Supabase (Postgres, RLS, logowanie) · Cloudflare Workers · Leaflet + OpenStreetMap · Google Places API (New) · Vitest + Playwright · GitHub Actions.

Reguły biznesowe (limity miejsc, rezerwa, granice 12 h, przekazanie organizacji, reguły obiektów, decyzje zarządców, budżet zapytań do Google) są egzekwowane w funkcjach i wyzwalaczach Postgresa w `supabase/migrations/`, a nie tylko w aplikacji.

## Uruchomienie lokalne

Wymagania: Node.js 22.14 (`.nvmrc`), Docker (dla lokalnego Supabase).

```bash
npm install
```

```bash
npx supabase start
```

Skopiuj `.env.example` do `.env` i `.dev.vars`, wpisz `SUPABASE_URL` i klucz publishable z wyniku `npx supabase status`. Opcjonalnie `GOOGLE_MAPS_API_KEY` (bez niego wyszukiwarka adresów używa OpenStreetMap) `TURNSTILE_SITE_KEY` i `TURNSTILE_SECRET_KEY` (ochrona rejestracji przed botami; bez nich formularz działa bez widgetu).

```bash
npm run dev
```

## Testy

| Polecenie                          | Co sprawdza                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                         | testy jednostkowe i integracyjne na lokalnym Supabase (reguły w bazie, RLS, obiekty, rezerwacje, budżet Google, usuwanie konta)            |
| `npm run test:e2e`                 | Playwright na buildzie produkcyjnym (`astro preview`, port 4322): zgłoszenie i akceptacja, dołączanie bez akceptacji i usuwanie uczestnika |
| `npm run smoke`                    | szybki test logowania na działającym serwerze (`BASE_URL`)                                                                                 |
| `npm run lint` / `npx astro check` | ESLint z regułami typów i sprawdzenie typów                                                                                                |

CI (`.github/workflows/ci.yml`) uruchamia lint, typy, build, testy z lokalnym Supabase, smoke i e2e przy każdym pushu na `main`, a wdrożenie na Cloudflare — gdy w repozytorium są sekrety `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`.

## Wdrożenie

1. Migracje bazy: `npx supabase db push` na projekt w chmurze (zawsze **przed** wdrożeniem kodu, który z nich korzysta).
2. Sekrety Workera: `npx wrangler secret put SUPABASE_URL`, `SUPABASE_KEY`, opcjonalnie `GOOGLE_MAPS_API_KEY`, `TURNSTILE_SITE_KEY` i `TURNSTILE_SECRET_KEY`.
3. `npm run build && npx wrangler deploy`.

## Dokumentacja projektu

- `context/foundation/prd.md` — wymagania produktu (FR-001…FR-020), decyzje i otwarte pytania.
- `context/foundation/tech-stack.md`, `context/foundation/infrastructure.md` — wybór stosu i platformy z rejestrem ryzyk.
- `CLAUDE.md` — zasady pracy dla agentów AI w tym repozytorium.
