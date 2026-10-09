-- Panel zarządcy terenu, etap 1: obiekty z cennikiem i godzinami otwarcia, czas trwania spotkań,
-- koszt spotkania na obiekcie oraz pilnowanie godzin otwarcia i kolizji terminów.

create extension if not exists btree_gist with schema extensions;

-- Obiekt (orlik, hala, korty) zarządzany przez użytkownika, który go dodał.
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  area text not null check (char_length(area) between 2 and 80),
  address text not null check (char_length(address) between 2 and 200),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  sports text[] not null check (
    cardinality(sports) >= 1
    and sports <@ array[
      'pilka-nozna', 'koszykowka', 'siatkowka', 'tenis', 'badminton',
      'bieganie', 'rower', 'squash', 'tenis-stolowy', 'inne'
    ]::text[]
  ),
  -- cena za godzinę w groszach
  price_per_hour_cents integer not null check (price_per_hour_cents between 0 and 1000000),
  created_at timestamptz not null default now()
);

create index venues_manager_idx on public.venues (manager_id);

-- Godziny otwarcia: jedno okno na dzień tygodnia (1 = poniedziałek … 7 = niedziela, czas lokalny).
create table public.venue_hours (
  venue_id uuid not null references public.venues (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens time not null,
  closes time not null,
  primary key (venue_id, weekday),
  check (closes > opens)
);

alter table public.venues enable row level security;
alter table public.venue_hours enable row level security;

-- Obiekty i ich godziny widzą wszyscy zalogowani (wybór obiektu w ogłoszeniu); zmienia je tylko zarządca.
create policy "venues_select_authenticated"
  on public.venues for select
  to authenticated
  using (true);

create policy "venues_insert_own"
  on public.venues for insert
  to authenticated
  with check (manager_id = (select auth.uid()));

create policy "venues_update_own"
  on public.venues for update
  to authenticated
  using (manager_id = (select auth.uid()))
  with check (manager_id = (select auth.uid()));

create policy "venues_delete_own"
  on public.venues for delete
  to authenticated
  using (manager_id = (select auth.uid()));

create policy "venue_hours_select_authenticated"
  on public.venue_hours for select
  to authenticated
  using (true);

create policy "venue_hours_insert_own"
  on public.venue_hours for insert
  to authenticated
  with check (exists (
    select 1 from public.venues v where v.id = venue_id and v.manager_id = (select auth.uid())
  ));

create policy "venue_hours_update_own"
  on public.venue_hours for update
  to authenticated
  using (exists (
    select 1 from public.venues v where v.id = venue_id and v.manager_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.venues v where v.id = venue_id and v.manager_id = (select auth.uid())
  ));

create policy "venue_hours_delete_own"
  on public.venue_hours for delete
  to authenticated
  using (exists (
    select 1 from public.venues v where v.id = venue_id and v.manager_id = (select auth.uid())
  ));

-- Czas trwania każdego spotkania (dotychczasowe dostają 90 minut) i opcjonalny obiekt z kosztem.
alter table public.events
  add column duration_minutes integer not null default 90 check (duration_minutes between 15 and 720),
  -- koniec spotkania ustawia wyzwalacz (kolumna generowana nie może dodawać przedziału do daty ze strefą)
  add column ends_at timestamptz,
  add column venue_id uuid references public.venues (id) on delete set null,
  -- koszt całego spotkania w groszach, liczony z cennika obiektu w chwili zapisu
  add column cost_cents integer check (cost_cents >= 0);

update public.events set ends_at = starts_at + duration_minutes * interval '1 minute';
alter table public.events alter column ends_at set not null;

-- Dwa nieodwołane spotkania na tym samym obiekcie nie mogą na siebie nachodzić.
alter table public.events
  add constraint events_venue_no_overlap
    exclude using gist (venue_id with =, tstzrange(starts_at, ends_at) with &&)
    where (venue_id is not null and status <> 'cancelled');

-- Koniec spotkania z czasu trwania oraz reguły spotkania na obiekcie: sport z oferty obiektu, termin w godzinach otwarcia (czas lokalny),
-- położenie z obiektu i koszt z cennika. Sprawdzane przy dodaniu i przy zmianie obiektu lub terminu.
create function public.apply_venue_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue public.venues;
  v_local timestamp;
  v_end_offset interval;
begin
  new.ends_at := new.starts_at + new.duration_minutes * interval '1 minute';
  if new.venue_id is null then
    new.cost_cents := null;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.venue_id = old.venue_id
     and new.starts_at = old.starts_at
     and new.duration_minutes = old.duration_minutes
     and new.sport = old.sport then
    return new;
  end if;

  select * into v_venue from public.venues where id = new.venue_id;
  if not found then
    raise exception 'VENUE_NOT_FOUND';
  end if;
  if not (new.sport = any (v_venue.sports)) then
    raise exception 'VENUE_SPORT';
  end if;

  v_local := new.starts_at at time zone 'Europe/Warsaw';
  v_end_offset := (v_local + new.duration_minutes * interval '1 minute') - date_trunc('day', v_local);
  if not exists (
    select 1 from public.venue_hours h
    where h.venue_id = new.venue_id
      and h.weekday = extract(isodow from v_local)
      and h.opens <= v_local::time
      and v_end_offset <= h.closes - time '00:00'
  ) then
    raise exception 'VENUE_CLOSED';
  end if;

  new.lat := v_venue.lat;
  new.lng := v_venue.lng;
  new.cost_cents := round(v_venue.price_per_hour_cents * new.duration_minutes / 60.0);
  return new;
end;
$$;

revoke execute on function public.apply_venue_rules() from public, anon, authenticated;

create trigger events_apply_venue_rules
  before insert or update on public.events
  for each row execute function public.apply_venue_rules();

-- Goście widzą też czas trwania i koszt (bez danych obiektu).
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
    e.cost_cents
  from public.events e
  where e.status = 'active' and e.starts_at > now();

-- Edycja z czasem trwania i obiektem.
drop function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision, integer, integer, boolean);

create function public.update_event(
  p_event_id uuid,
  p_sport text,
  p_area text,
  p_place text,
  p_starts_at timestamptz,
  p_spots integer,
  p_description text,
  p_organizer_plays boolean,
  p_lat double precision,
  p_lng double precision,
  p_reserve_spots integer,
  p_min_people integer,
  p_requires_approval boolean,
  p_duration_minutes integer,
  p_venue_id uuid
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_accepted integer;
  v_reserve integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.organizer_id <> v_uid then
    raise exception 'NOT_ORGANIZER';
  end if;
  if v_event.status <> 'active' then
    raise exception 'EVENT_CANCELLED';
  end if;
  if now() > v_event.starts_at - interval '12 hours' then
    raise exception 'EDIT_DEADLINE_PASSED';
  end if;
  if p_starts_at <= now() then
    raise exception 'STARTS_IN_PAST';
  end if;

  select count(*) filter (where status = 'accepted'), count(*) filter (where status = 'reserve')
    into v_accepted, v_reserve
  from public.participations where event_id = p_event_id;
  if p_spots < v_accepted then
    raise exception 'SPOTS_BELOW_ACCEPTED';
  end if;
  if p_reserve_spots < v_reserve then
    raise exception 'RESERVE_BELOW_COUNT';
  end if;

  update public.events
  set sport = p_sport,
      area = p_area,
      place = p_place,
      starts_at = p_starts_at,
      spots = p_spots,
      description = nullif(p_description, ''),
      organizer_plays = p_organizer_plays,
      lat = p_lat,
      lng = p_lng,
      reserve_spots = p_reserve_spots,
      min_people = p_min_people,
      requires_approval = p_requires_approval,
      duration_minutes = p_duration_minutes,
      venue_id = p_venue_id
  where id = p_event_id;

  perform public.settle_event(p_event_id);
  select * into v_event from public.events where id = p_event_id;
  return v_event;
exception
  when check_violation then
    raise exception 'INVALID_DATA';
  when exclusion_violation then
    raise exception 'VENUE_BUSY';
end;
$$;

revoke execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision, integer, integer, boolean, integer, uuid) from public, anon;
grant execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision, integer, integer, boolean, integer, uuid) to authenticated;
