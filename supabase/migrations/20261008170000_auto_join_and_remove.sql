-- Dołączanie bez akceptacji (domyślnie) z przełącznikiem "wymagaj akceptacji" oraz usuwanie
-- uczestnika przez organizatora. Ogłoszenia sprzed tej zmiany zachowują akceptację organizatora.
alter table public.events add column requires_approval boolean not null default true;
alter table public.events alter column requires_approval set default false;

alter table public.participations drop constraint participations_status_check;
alter table public.participations
  add constraint participations_status_check
    check (status in ('pending', 'accepted', 'reserve', 'rejected', 'withdrawn', 'removed'));

-- Goście widzą, czy dołączenie jest natychmiastowe.
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
    e.requires_approval
  from public.events e
  where e.status = 'active' and e.starts_at > now();

-- FR-007: bez wymaganej akceptacji zgłoszenie od razu trafia do składu, a gdy jest pełny — na listę
-- rezerwową; gdy i ona jest pełna, zgłoszenie jest odrzucane (EVENT_FULL). Z akceptacją czeka jak dotąd.
create or replace function public.request_to_join(p_event_id uuid)
returns public.participations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_row public.participations;
  v_accepted integer;
  v_reserve integer;
  v_status text := 'pending';
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.organizer_id = v_uid then
    raise exception 'OWN_EVENT';
  end if;
  if v_event.status <> 'active' then
    raise exception 'EVENT_CANCELLED';
  end if;
  if v_event.starts_at <= now() then
    raise exception 'EVENT_STARTED';
  end if;

  select * into v_row from public.participations
  where event_id = p_event_id and user_id = v_uid
  for update;
  if found then
    if v_row.status = 'rejected' then
      raise exception 'ALREADY_REJECTED';
    elsif v_row.status = 'removed' then
      raise exception 'ALREADY_REMOVED';
    elsif v_row.status <> 'withdrawn' then
      raise exception 'ALREADY_REQUESTED';
    end if;
  end if;

  if not v_event.requires_approval then
    select count(*) filter (where status = 'accepted'), count(*) filter (where status = 'reserve')
      into v_accepted, v_reserve
    from public.participations where event_id = p_event_id;
    if v_accepted < v_event.spots then
      v_status := 'accepted';
    elsif v_reserve < v_event.reserve_spots then
      v_status := 'reserve';
    else
      raise exception 'EVENT_FULL';
    end if;
  end if;

  if v_row.id is not null then
    update public.participations
    set status = v_status, stay_confirmed = null, updated_at = now()
    where id = v_row.id
    returning * into v_row;
  else
    insert into public.participations (event_id, user_id, status)
    values (p_event_id, v_uid, v_status)
    returning * into v_row;
  end if;
  return v_row;
end;
$$;

-- Organizator usuwa uczestnika (ze składu, rezerwy lub oczekujących) do startu spotkania.
-- Usunięta osoba nie może zgłosić się ponownie; zwolnione miejsce zajmuje pierwsza osoba z rezerwy.
create function public.remove_participant(p_participation_id uuid)
returns public.participations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.participations;
  v_event public.events;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_row from public.participations where id = p_participation_id;
  if not found then
    raise exception 'PARTICIPATION_NOT_FOUND';
  end if;

  select * into v_event from public.events where id = v_row.event_id for update;
  if v_event.organizer_id <> v_uid then
    raise exception 'NOT_ORGANIZER';
  end if;
  if v_event.status <> 'active' then
    raise exception 'EVENT_CANCELLED';
  end if;
  if v_event.starts_at <= now() then
    raise exception 'EVENT_STARTED';
  end if;

  select * into v_row from public.participations where id = p_participation_id for update;
  if v_row.status not in ('pending', 'accepted', 'reserve') then
    raise exception 'NOT_PARTICIPATING';
  end if;

  update public.participations set status = 'removed', updated_at = now()
  where id = v_row.id
  returning * into v_row;

  perform public.settle_event(v_event.id);
  return v_row;
end;
$$;

revoke execute on function public.remove_participant(uuid) from public, anon;
grant execute on function public.remove_participant(uuid) to authenticated;

-- Edycja z przełącznikiem akceptacji. Wyłączenie akceptacji nie rusza oczekujących zgłoszeń:
-- organizator nadal może je rozpatrzyć.
drop function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision, integer, integer);

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
  p_requires_approval boolean
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
      requires_approval = p_requires_approval
  where id = p_event_id;

  perform public.settle_event(p_event_id);
  select * into v_event from public.events where id = p_event_id;
  return v_event;
exception
  when check_violation then
    raise exception 'INVALID_DATA';
end;
$$;

revoke execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision, integer, integer, boolean) from public, anon;
grant execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision, integer, integer, boolean) to authenticated;
