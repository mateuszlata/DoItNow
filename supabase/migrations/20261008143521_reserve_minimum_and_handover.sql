-- Lista rezerwowa, minimalna liczba osób i przekazanie spotkania uczestnikom.
--
-- Rezerwa: gdy skład jest pełny, akceptacja organizatora dopisuje osobę do rezerwy (do limitu
-- `reserve_spots`). Gdy zwalnia się miejsce w składzie, pierwsza osoba z rezerwy wskakuje sama.
-- Minimum: `min_people` (opcjonalne) to liczba osób w składzie łącznie z grającym organizatorem,
-- potrzebna, żeby spotkanie się odbyło. Aplikacja tylko informuje, ile brakuje.
-- Odwołanie: jeśli organizator odwołuje spotkanie z zaakceptowanymi uczestnikami, spotkanie przechodzi
-- w stan `organizer_left` zamiast znikać. Zaakceptowani dostają pytanie, czy zostają; pierwsza osoba,
-- która zostaje, przejmuje organizację. Gdy nikt nie zostanie, spotkanie jest odwołane.

alter table public.events drop constraint events_status_check;
alter table public.events
  add constraint events_status_check check (status in ('active', 'organizer_left', 'cancelled')),
  add column reserve_spots integer not null default 0 check (reserve_spots between 0 and 50),
  add column min_people integer,
  -- Moment odwołania przez pierwotnego organizatora; od tej chwili uczestnicy dostają pytanie.
  add column handover_at timestamptz,
  add constraint events_min_people_range check (
    min_people is null or (min_people >= 1 and min_people <= spots + case when organizer_plays then 1 else 0 end)
  );

alter table public.participations drop constraint participations_status_check;
alter table public.participations
  add constraint participations_status_check
    check (status in ('pending', 'accepted', 'reserve', 'rejected', 'withdrawn')),
  -- Odpowiedź zaakceptowanego uczestnika po odwołaniu przez organizatora (null = brak odpowiedzi).
  add column stay_confirmed boolean;

create function public.reserve_count(e public.events)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.participations p
  where p.event_id = e.id and p.status = 'reserve';
$$;

-- Goście widzą też limit rezerwy i jej zajętość oraz minimum (bez danych osób).
create or replace view public.events_public as
  select
    e.id, e.sport, e.area, e.starts_at, e.spots,
    (select count(*)::integer from public.participations p
     where p.event_id = e.id and p.status = 'accepted') as accepted_count,
    e.organizer_plays,
    e.reserve_spots,
    (select count(*)::integer from public.participations p
     where p.event_id = e.id and p.status = 'reserve') as reserve_count,
    e.min_people
  from public.events e
  where e.status = 'active' and e.starts_at > now();

-- Porządkuje stan po zwolnieniu miejsc: przesuwa rezerwę do składu (najdłużej czekający pierwszy),
-- a spotkanie bez organizatora i bez uczestników oznacza jako odwołane. Funkcja wewnętrzna.
create function public.settle_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_accepted integer;
  v_next uuid;
begin
  select * into v_event from public.events where id = p_event_id;
  loop
    select count(*) into v_accepted from public.participations
    where event_id = p_event_id and status = 'accepted';
    exit when v_accepted >= v_event.spots;
    select id into v_next from public.participations
    where event_id = p_event_id and status = 'reserve'
    order by updated_at, id
    limit 1;
    exit when v_next is null;
    update public.participations set status = 'accepted', updated_at = now() where id = v_next;
  end loop;

  if v_event.status = 'organizer_left' and v_accepted = 0 then
    update public.events set status = 'cancelled' where id = p_event_id;
  end if;
end;
$$;

revoke execute on function public.settle_event(uuid) from public, anon, authenticated;

-- FR-010 z rezerwą: akceptacja trafia do składu, a gdy jest pełny — do rezerwy (do jej limitu).
create or replace function public.decide_participation(p_participation_id uuid, p_accept boolean)
returns public.participations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.participations;
  v_event public.events;
  v_accepted integer;
  v_reserve integer;
  v_status text;
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
  if v_row.status <> 'pending' then
    raise exception 'NOT_PENDING';
  end if;

  if p_accept then
    select count(*) filter (where status = 'accepted'), count(*) filter (where status = 'reserve')
      into v_accepted, v_reserve
    from public.participations where event_id = v_event.id;
    if v_accepted < v_event.spots then
      v_status := 'accepted';
    elsif v_reserve < v_event.reserve_spots then
      v_status := 'reserve';
    else
      raise exception 'EVENT_FULL';
    end if;
  else
    v_status := 'rejected';
  end if;

  update public.participations set status = v_status, updated_at = now()
  where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

-- FR-008 z rezerwą: rezerwa i oczekujące zgłoszenia nie zajmują miejsca, więc można je wycofać do startu.
-- Rezygnacja zaakceptowanego zwalnia miejsce dla pierwszej osoby z rezerwy.
create or replace function public.withdraw_participation(p_event_id uuid)
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

  select * into v_event from public.events where id = p_event_id for update;
  select * into v_row from public.participations
  where event_id = p_event_id and user_id = v_uid
  for update;
  if not found or v_row.status not in ('pending', 'accepted', 'reserve') then
    raise exception 'NOT_PARTICIPATING';
  end if;
  if v_event.starts_at <= now() then
    raise exception 'EVENT_STARTED';
  end if;
  if v_row.status = 'accepted' and v_event.status = 'active' and v_event.handover_at is null
     and now() > v_event.starts_at - interval '12 hours' then
    raise exception 'WITHDRAW_DEADLINE_PASSED';
  end if;

  update public.participations
  set status = 'withdrawn', updated_at = now()
  where id = v_row.id
  returning * into v_row;

  perform public.settle_event(p_event_id);
  return v_row;
end;
$$;

-- FR-004: odwołanie. Bez zaakceptowanych uczestników spotkanie znika jak dotąd; z uczestnikami
-- przechodzi w `organizer_left`: miejsce organizatora się zwalnia, a uczestnicy dostają pytanie.
create or replace function public.cancel_event(p_event_id uuid)
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
  if v_event.starts_at <= now() then
    raise exception 'EVENT_STARTED';
  end if;

  select count(*) into v_accepted from public.participations
  where event_id = p_event_id and status = 'accepted';

  if v_accepted = 0 then
    update public.events set status = 'cancelled' where id = p_event_id returning * into v_event;
    return v_event;
  end if;

  update public.events
  set status = 'organizer_left',
      handover_at = now(),
      spots = spots + case when organizer_plays then 1 else 0 end,
      organizer_plays = false
  where id = p_event_id;
  update public.participations set stay_confirmed = null
  where event_id = p_event_id and status = 'accepted';

  perform public.settle_event(p_event_id);
  select * into v_event from public.events where id = p_event_id;
  return v_event;
end;
$$;

-- Odpowiedź zaakceptowanego uczestnika na odwołanie przez organizatora.
-- „Zostaję”: pierwsza taka osoba przejmuje organizację (gra dalej, więc jej miejsce w składzie zostaje).
-- „Rezygnuję”: zwalnia miejsce dla rezerwy; bez granicy 12 h, bo to organizator zmienił plany.
create function public.respond_to_cancellation(p_event_id uuid, p_stay boolean)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_row public.participations;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.handover_at is null or v_event.status = 'cancelled' then
    raise exception 'NO_HANDOVER';
  end if;
  if v_event.starts_at <= now() then
    raise exception 'EVENT_STARTED';
  end if;

  select * into v_row from public.participations
  where event_id = p_event_id and user_id = v_uid and status = 'accepted'
  for update;
  if not found or v_row.stay_confirmed is not null then
    raise exception 'NOT_ASKED';
  end if;

  if not p_stay then
    update public.participations set status = 'withdrawn', stay_confirmed = false, updated_at = now()
    where id = v_row.id;
    perform public.settle_event(p_event_id);
  elsif v_event.status = 'organizer_left' then
    -- Przejęcie organizacji: zgłoszenie zamienia się w miejsce grającego organizatora.
    delete from public.participations where id = v_row.id;
    update public.events
    set organizer_id = v_uid,
        organizer_plays = true,
        spots = spots - 1,
        status = 'active'
    where id = p_event_id;
  else
    update public.participations set stay_confirmed = true, updated_at = now() where id = v_row.id;
  end if;

  select * into v_event from public.events where id = p_event_id;
  return v_event;
end;
$$;

-- Edycja z nowymi polami (limit rezerwy, minimum); po zwiększeniu składu rezerwa wskakuje sama.
drop function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision);

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
  p_min_people integer
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
      min_people = p_min_people
  where id = p_event_id;

  perform public.settle_event(p_event_id);
  select * into v_event from public.events where id = p_event_id;
  return v_event;
exception
  when check_violation then
    raise exception 'INVALID_DATA';
end;
$$;

revoke execute on function public.respond_to_cancellation(uuid, boolean) from public, anon;
grant execute on function public.respond_to_cancellation(uuid, boolean) to authenticated;
revoke execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision, integer, integer) from public, anon;
grant execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision, integer, integer) to authenticated;
