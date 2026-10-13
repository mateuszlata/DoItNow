---
description: Audyt gotowości produkcyjnej Metando (kopie zapasowe, monitoring, wdrożenia, domena, awarie) — tylko raport
---

Przeprowadź audyt gotowości produkcyjnej. Najpierw przeczytaj `.claude/audyty/zasady.md` i stosuj się do niego. Nie loguj się do paneli i nie zmieniaj ustawień — tam, gdzie potrzebny jest podgląd panelu (Cloudflare, Supabase, Google Cloud), napisz właścicielowi, co dokładnie ma sprawdzić i jak.

1. **Dane i kopie zapasowe**: czy baza Supabase ma kopie (plan Free — ich brak lub ograniczenia), jak odtworzyć dane po błędzie lub skasowaniu; czy migracje dają się odtworzyć od zera na pustej bazie (`npx supabase db reset` lokalnie).
2. **Wdrożenia**: proces z `CLAUDE.md` i `.github/workflows/ci.yml` (CI bez sekretów Cloudflare, wdrożenia ręczne); kolejność migracja → kod; jak wycofać złe wdrożenie (`wrangler rollback`, wersje); co się dzieje, gdy kod wejdzie przed migracją.
3. **Monitoring i błędy**: czy ktokolwiek dowie się o awarii — logi Workera, alerty, błędy w przeglądarce użytkowników, nieudane wysyłki, wyczerpane limity (Google, Open-Meteo, Supabase). Zaproponuj minimum (darmowe).
4. **Domena i ruch**: HTTPS wymuszony („Always Use HTTPS”), przekierowanie www, DNSSEC (obecnie wyłączony po przenosinach), rekordy pocztowe pod przyszły e-mail (SPF, DKIM, DMARC), stary adres workers.dev.
5. **Sekrety**: lista sekretów Workera i ich właściciel, rotacja, co się stanie, gdy któryś wycieknie albo wygaśnie (pamiętaj o przypadku złego sekretu Turnstile, który po cichu blokował zaproszenia).
6. **Odporność**: zachowanie aplikacji, gdy padnie Supabase, Google Places, Photon, Open-Meteo, Turnstile, Cloudflare — czy strona działa dalej i mówi użytkownikowi, co się dzieje.
7. **Prawo i kontakt**: działający adres kontaktowy w dokumentach (obecnie tymczasowy Gmail), stopka z regulaminem i polityką, dane administratora.

Zakończ listą kontrolną „przed wypuszczeniem do pierwszych 100 użytkowników” z polami do odhaczenia.
