-- Filtr „W pobliżu” na liście spotkań także dla niezalogowanych: publiczny widok dostaje położenie
-- zaokrąglone do 0,01° (ok. 1 km) — tyle, co i tak zdradza nazwa okolicy; dokładne miejsce i współrzędne
-- nadal widzą tylko zalogowani.

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
    round(e.lng::numeric, 2)::double precision as approx_lng
  from public.events e
  where e.status = 'active' and e.starts_at > now();
