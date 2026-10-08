-- Organizator w składzie i pinezka na mapie.
-- `spots` nadal oznacza liczbę miejsc do obsadzenia (bez organizatora); skład to
-- spots + 1, gdy organizator bierze udział. Współrzędne są opcjonalne i — jak dokładne
-- miejsce — widoczne tylko dla zalogowanych (FR-001), więc nie trafiają do events_public.

alter table public.events
  add column organizer_plays boolean not null default true,
  add column lat double precision,
  add column lng double precision,
  add constraint events_location_pair check ((lat is null) = (lng is null)),
  add constraint events_location_range check (
    lat is null or (lat between -90 and 90 and lng between -180 and 180)
  );

create or replace view public.events_public as
  select
    e.id, e.sport, e.area, e.starts_at, e.spots,
    (select count(*)::integer from public.participations p
     where p.event_id = e.id and p.status = 'accepted') as accepted_count,
    e.organizer_plays
  from public.events e
  where e.status = 'active' and e.starts_at > now();

-- Nowa sygnatura funkcji edycji (udział organizatora i pinezka); reguły bez zmian.
drop function public.update_event(uuid, text, text, text, timestamptz, integer, text);

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
  p_lng double precision
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

  select count(*) into v_accepted from public.participations
  where event_id = p_event_id and status = 'accepted';
  if p_spots < v_accepted then
    raise exception 'SPOTS_BELOW_ACCEPTED';
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
      lng = p_lng
  where id = p_event_id
  returning * into v_event;
  return v_event;
exception
  when check_violation then
    raise exception 'INVALID_DATA';
end;
$$;

revoke execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision) from public, anon;
grant execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision) to authenticated;
