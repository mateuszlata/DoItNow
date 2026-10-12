-- Goście organizatora: znajomi spoza Metando, dla których organizator zajmuje miejsca w składzie.
-- `spots` nadal oznacza miejsca do obsadzenia przez aplikację (limit, rezerwa i awanse działają bez zmian);
-- `guest_count` tylko dopisuje zajęte miejsca do składu: skład = spots + grający organizator + goście.

alter table public.events
  add column guest_count integer not null default 0 check (guest_count between 0 and 49);

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
    e.guest_count
  from public.events e
  where e.status = 'active' and e.starts_at > now();

-- Edycja z liczbą gości (nowy parametr na końcu; poprzednia wersja usunięta).
drop function public.update_event(
  uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision,
  integer, integer, boolean, integer, uuid
);

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
  p_venue_id uuid,
  p_guest_count integer
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
      venue_id = p_venue_id,
      guest_count = coalesce(p_guest_count, 0)
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

revoke execute on function public.update_event(
  uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision,
  integer, integer, boolean, integer, uuid, integer
) from public, anon;
grant execute on function public.update_event(
  uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision,
  integer, integer, boolean, integer, uuid, integer
) to authenticated;
