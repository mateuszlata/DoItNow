-- Ulubione sporty użytkownika („W co grasz?”): domyślny filtr listy ogłoszeń i podstawa przyszłych powiadomień.
-- Osobna tabela zamiast kolumny w profiles, bo profile czytają wszyscy zalogowani, a preferencje widzi tylko właściciel.
-- Brak wiersza = jeszcze nie pytaliśmy; pusta tablica = „interesuje mnie wszystko”.

create table public.user_sport_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  sports text[] not null check (
    sports <@ array[
      'pilka-nozna', 'koszykowka', 'siatkowka', 'tenis', 'badminton',
      'bieganie', 'rower', 'squash', 'tenis-stolowy', 'inne'
    ]::text[]
  ),
  updated_at timestamptz not null default now()
);

alter table public.user_sport_preferences enable row level security;

create policy "user_sport_preferences_select_own"
  on public.user_sport_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "user_sport_preferences_insert_own"
  on public.user_sport_preferences for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "user_sport_preferences_update_own"
  on public.user_sport_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
