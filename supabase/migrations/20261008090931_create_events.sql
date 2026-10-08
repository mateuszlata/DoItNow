-- Ogłoszenia o wspólnej aktywności (FR-001, FR-003, FR-005).
-- Lista sportów musi być zgodna z src/lib/sports.ts.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sport text not null check (
    sport in (
      'pilka-nozna', 'koszykowka', 'siatkowka', 'tenis', 'badminton',
      'bieganie', 'rower', 'squash', 'tenis-stolowy', 'inne'
    )
  ),
  -- ogólna lokalizacja, widoczna także dla gości
  area text not null check (char_length(area) between 2 and 80),
  -- dokładne miejsce, widoczne tylko dla zalogowanych
  place text not null check (char_length(place) between 2 and 200),
  starts_at timestamptz not null,
  -- liczba potrzebnych osób, bez organizatora
  spots integer not null check (spots between 1 and 50),
  description text check (char_length(description) <= 1000),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);

create index events_upcoming_idx on public.events (starts_at) where status = 'active';
create index events_organizer_idx on public.events (organizer_id);

alter table public.events enable row level security;

-- Pełne dane ogłoszeń widzą tylko zalogowani użytkownicy.
create policy "events_select_authenticated"
  on public.events for select
  to authenticated
  using (true);

-- Ogłoszenie tworzy się tylko we własnym imieniu i tylko na przyszły termin.
create policy "events_insert_own_future"
  on public.events for insert
  to authenticated
  with check (organizer_id = (select auth.uid()) and starts_at > now());

-- Goście nie mają dostępu do tabeli; widzą ograniczony widok nadchodzących,
-- aktywnych ogłoszeń bez dokładnego miejsca, opisu i autora (FR-001).
-- Widok działa z uprawnieniami właściciela, więc omija RLS tabeli celowo
-- i wystawia wyłącznie wymienione kolumny.
create view public.events_public as
  select id, sport, area, starts_at, spots
  from public.events
  where status = 'active' and starts_at > now();

revoke all on public.events_public from anon, authenticated;
grant select on public.events_public to anon, authenticated;
