-- Trasa dla sportów w ruchu (rower, bieganie): miejsce spotkania to punkt zbiórki (mapa, „W pobliżu”, pogoda),
-- a do tego cel albo pętla, dystans, tempo i opcjonalny link do trasy (Strava, Komoot, Mapy Google).
-- Cel, pętla, dystans i tempo widzi każdy (jak okolicę); link do trasy — jak dokładne miejsce — tylko zalogowani.

alter table public.events
  add column route_destination text check (char_length(route_destination) between 1 and 120),
  add column route_loop boolean not null default false,
  add column route_distance_km numeric(5, 1) check (route_distance_km > 0 and route_distance_km <= 500),
  add column route_pace text check (char_length(route_pace) between 1 and 40),
  add column route_url text check (route_url ~ '^https://' and char_length(route_url) <= 500);

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
    e.level_max,
    e.route_destination,
    e.route_loop,
    e.route_distance_km,
    e.route_pace
  from public.events e
  where e.status = 'active' and e.starts_at > now();

-- Zmiana trasy przez organizatora (formularz edycji; nowe spotkanie zapisuje trasę przy tworzeniu).
create function public.set_event_route(
  p_event_id uuid,
  p_destination text,
  p_loop boolean,
  p_distance_km numeric,
  p_pace text,
  p_url text
)
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
  update public.events
  set route_destination = case when coalesce(p_loop, false) then null else nullif(btrim(p_destination), '') end,
      route_loop = coalesce(p_loop, false),
      route_distance_km = p_distance_km,
      route_pace = nullif(btrim(p_pace), ''),
      route_url = nullif(btrim(p_url), '')
  where id = p_event_id;
exception
  when check_violation then
    raise exception 'INVALID_ROUTE';
end;
$$;

revoke execute on function public.set_event_route(uuid, text, boolean, numeric, text, text) from public, anon;
grant execute on function public.set_event_route(uuid, text, boolean, numeric, text, text) to authenticated;
