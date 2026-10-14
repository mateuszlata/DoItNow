-- Poziom sportowy: gracz deklaruje swój poziom osobno w każdym sporcie (1 rekreacyjnie … 4 wyczynowo),
-- organizator — zakres poziomu spotkania (puste = dla każdego). Poziom nie blokuje dołączenia; aplikacja
-- tylko ostrzega, gdy deklaracja gracza nie pasuje do zakresu.

create table public.player_levels (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sport text not null check (
    sport in (
      'pilka-nozna', 'koszykowka', 'siatkowka', 'tenis', 'badminton',
      'bieganie', 'rower', 'squash', 'tenis-stolowy', 'inne'
    )
  ),
  level smallint not null check (level between 1 and 4),
  updated_at timestamptz not null default now(),
  primary key (user_id, sport)
);

alter table public.player_levels enable row level security;

-- Poziomy widzą zalogowani (jak nicki w składach); zmienia je tylko właściciel.
create policy "player_levels_select_authenticated"
  on public.player_levels for select
  to authenticated
  using (true);

create policy "player_levels_insert_own"
  on public.player_levels for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "player_levels_update_own"
  on public.player_levels for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "player_levels_delete_own"
  on public.player_levels for delete
  to authenticated
  using (user_id = (select auth.uid()));

alter table public.events
  add column level_min smallint,
  add column level_max smallint,
  add constraint events_level_range check (
    (level_min is null and level_max is null)
    or (level_min between 1 and 4 and level_max between level_min and 4)
  );

-- Publiczny widok dostaje zakres poziomu (karta i strona spotkania dla osób bez konta).
create or replace view public.events_public as
  select
    e.id, e.sport, e.area, e.starts_at, e.spots,
    (select count(*)::integer from public.participations p
     where p.event_id = e.id and p.status = 'accepted') as accepted_count,
    e.organizer_plays,
    e.reserve_spots,
    (select count(*)::integer from public.participations p
     where p.event_id = e.id and p.status = 'reserve') as reserve_count,
    e.min_people,
    e.requires_approval,
    e.duration_minutes,
    e.cost_cents,
    e.venue_status,
    e.guest_count,
    e.guest_confirmed,
    round(e.lat::numeric, 2)::double precision as approx_lat,
    round(e.lng::numeric, 2)::double precision as approx_lng,
    e.level_min,
    e.level_max
  from public.events e
  where e.status = 'active' and e.starts_at > now();

-- Zmiana zakresu poziomu przez organizatora (formularz edycji; nowe spotkanie zapisuje zakres przy tworzeniu).
create function public.set_event_level(p_event_id uuid, p_min smallint, p_max smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.organizer_id <> auth.uid() then
    raise exception 'NOT_ORGANIZER';
  end if;
  if v_event.status <> 'active' or v_event.starts_at <= now() then
    raise exception 'EVENT_CLOSED';
  end if;
  update public.events set level_min = p_min, level_max = p_max where id = p_event_id;
exception
  when check_violation then
    raise exception 'INVALID_LEVEL';
end;
$$;

-- Rozkład zadeklarowanych poziomów w składzie (grający organizator i zaakceptowani) — same liczby, bez osób,
-- więc dostępny także dla osób bez konta przy nadchodzących spotkaniach.
create function public.event_level_mix(p_event_id uuid)
returns table (level smallint, players integer)
language sql
stable
security definer
set search_path = ''
as $$
  with event as (
    select * from public.events
    where id = p_event_id and status = 'active' and starts_at > now()
  ), squad as (
    select e.organizer_id as user_id, e.sport from event e where e.organizer_plays
    union
    select p.user_id, e.sport from public.participations p join event e on e.id = p.event_id
    where p.status = 'accepted'
  )
  select l.level, count(*)::integer
  from squad s join public.player_levels l on l.user_id = s.user_id and l.sport = s.sport
  group by l.level
  order by l.level;
$$;

revoke execute on function public.set_event_level(uuid, smallint, smallint) from public, anon;
grant execute on function public.set_event_level(uuid, smallint, smallint) to authenticated;
revoke execute on function public.event_level_mix(uuid) from public;
grant execute on function public.event_level_mix(uuid) to anon, authenticated;
