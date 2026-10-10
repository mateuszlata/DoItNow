-- Panel zarządcy terenu, etap 2: potwierdzanie terminów na obiekcie.
-- Każde spotkanie na obiekcie czeka na decyzję zarządcy; zmiana obiektu, terminu, czasu trwania
-- albo sportu przywraca oczekiwanie. Odrzucony termin nie blokuje obiektu dla innych.

alter table public.events
  add column venue_status text check (venue_status in ('pending', 'approved', 'rejected')),
  add column venue_decided_at timestamptz,
  add column venue_note text check (char_length(venue_note) <= 300);

update public.events set venue_status = 'pending' where venue_id is not null;

alter table public.events
  add constraint events_venue_status_consistent
    check ((venue_id is null) = (venue_status is null));

-- Odrzucone terminy nie zajmują obiektu.
alter table public.events drop constraint events_venue_no_overlap;
alter table public.events
  add constraint events_venue_no_overlap
    exclude using gist (venue_id with =, tstzrange(starts_at, ends_at) with &&)
    where (venue_id is not null and status <> 'cancelled' and venue_status <> 'rejected');

-- Reguły obiektu jak dotąd, a dodatkowo: nowa rezerwacja (albo zmieniona) czeka na zarządcę.
create or replace function public.apply_venue_rules()
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
    new.venue_status := null;
    new.venue_decided_at := null;
    new.venue_note := null;
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
  new.venue_status := 'pending';
  new.venue_decided_at := null;
  new.venue_note := null;
  return new;
end;
$$;

-- Decyzja zarządcy o terminie: tylko zarządca obiektu, tylko przed startem aktywnego spotkania.
-- Potwierdzony termin można jeszcze odrzucić (np. awaria obiektu), odrzuconego nie da się przywrócić —
-- organizator musi zmienić termin lub obiekt.
create function public.decide_venue_booking(p_event_id uuid, p_approve boolean, p_note text default null)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_manager uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  select manager_id into v_manager from public.venues where id = v_event.venue_id;
  if v_manager is null or v_manager <> v_uid then
    raise exception 'NOT_VENUE_MANAGER';
  end if;
  if v_event.status = 'cancelled' then
    raise exception 'EVENT_CANCELLED';
  end if;
  if v_event.starts_at <= now() then
    raise exception 'EVENT_STARTED';
  end if;
  if v_event.venue_status = 'rejected' or (p_approve and v_event.venue_status = 'approved') then
    raise exception 'BOOKING_ALREADY_DECIDED';
  end if;

  update public.events
  set venue_status = case when p_approve then 'approved' else 'rejected' end,
      venue_decided_at = now(),
      venue_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
  where id = p_event_id
  returning * into v_event;
  return v_event;
end;
$$;

revoke execute on function public.decide_venue_booking(uuid, boolean, text) from public, anon;
grant execute on function public.decide_venue_booking(uuid, boolean, text) to authenticated;

-- Goście widzą, czy obiekt potwierdził termin.
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
    e.venue_status
  from public.events e
  where e.status = 'active' and e.starts_at > now();
