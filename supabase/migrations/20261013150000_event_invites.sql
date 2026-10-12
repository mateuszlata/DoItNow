-- Zaproszenia bez logowania: organizator rezerwuje `guest_count` miejsc dla znajomych spoza Metando i wysyła
-- jeden link. Zaproszeni odpowiadają „Będę” / „Nie będę” (imię + identyfikator urządzenia z ciasteczka).
-- Miejsca: guest_count = potwierdzeni („Będę”) + oczekujący („?”). „Nie będę” i automatyczne zwolnienie
-- nieodpowiedzianych 12 h przed startem oddają miejsce graczom z Metando (spots + 1, guest_count - 1).

create table public.event_invites (
  event_id uuid primary key references public.events (id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  created_at timestamptz not null default now()
);

alter table public.event_invites enable row level security;

-- Link widzi tylko organizator (tworzy go funkcja create_event_invite).
create policy "event_invites_select_organizer"
  on public.event_invites for select
  to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.organizer_id = (select auth.uid())));

create table public.invite_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  answer text not null check (answer in ('yes', 'no')),
  -- skrót identyfikatora urządzenia (ciasteczko), żeby ta sama osoba mogła zmienić odpowiedź
  device_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, device_hash)
);

create index invite_responses_event_idx on public.invite_responses (event_id);

alter table public.invite_responses enable row level security;

-- Imiona zaproszonych widzą członkowie spotkania; zapisy wyłącznie przez funkcje poniżej.
create policy "invite_responses_select_members"
  on public.invite_responses for select
  to authenticated
  using (public.is_event_member(event_id));

create function public.invite_yes_count(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.invite_responses where event_id = p_event_id and answer = 'yes';
$$;

-- Oddaje jedno zarezerwowane miejsce graczom z Metando (i awansuje rezerwę).
create function public.release_guest_seat(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.events
  set guest_count = guest_count - 1, spots = spots + 1
  where id = p_event_id and guest_count > 0 and spots < 50;
  perform public.settle_event(p_event_id);
end;
$$;

create function public.create_event_invite(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.organizer_id <> auth.uid() then
    raise exception 'NOT_ORGANIZER';
  end if;
  if v_event.status <> 'active' or v_event.starts_at <= now() then
    raise exception 'EVENT_CLOSED';
  end if;

  select token into v_token from public.event_invites where event_id = p_event_id;
  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.event_invites (event_id, token) values (p_event_id, v_token);
  end if;
  return v_token;
end;
$$;

-- Karta zaproszenia dla osoby bez konta: podstawowe dane spotkania, liczby i jej własna odpowiedź.
create function public.get_invite(p_token text, p_device text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_yes integer;
  v_accepted integer;
  v_mine jsonb;
  v_organizer text;
begin
  select e.* into v_event
  from public.event_invites i join public.events e on e.id = i.event_id
  where i.token = p_token;
  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  v_yes := public.invite_yes_count(v_event.id);
  v_accepted := public.accepted_count(v_event);
  select display_name into v_organizer from public.profiles where id = v_event.organizer_id;
  if p_device is not null and char_length(p_device) between 16 and 100 then
    select jsonb_build_object('name', name, 'answer', answer) into v_mine
    from public.invite_responses
    where event_id = v_event.id and device_hash = encode(extensions.digest(p_device, 'sha256'), 'hex');
  end if;

  return jsonb_build_object(
    'event_id', v_event.id,
    'sport', v_event.sport,
    'area', v_event.area,
    'starts_at', v_event.starts_at,
    'duration_minutes', v_event.duration_minutes,
    'organizer_name', coalesce(v_organizer, 'Organizator'),
    'team_size', v_event.spots + (case when v_event.organizer_plays then 1 else 0 end) + v_event.guest_count,
    'taken', v_accepted + (case when v_event.organizer_plays then 1 else 0 end) + v_yes,
    'invited_pending', greatest(v_event.guest_count - v_yes, 0),
    'free_app_spots', greatest(v_event.spots - v_accepted, 0),
    'open', v_event.status = 'active' and v_event.starts_at > now(),
    'mine', v_mine
  );
end;
$$;

create function public.respond_to_invite(p_token text, p_device text, p_name text, p_answer text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_name text := btrim(coalesce(p_name, ''));
  v_hash text;
  v_previous text;
  v_yes integer;
  v_pending integer;
  v_accepted integer;
  v_total integer;
begin
  if p_answer not in ('yes', 'no') then
    raise exception 'INVALID_ANSWER';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_device is null or char_length(p_device) not between 16 and 100 then
    raise exception 'INVALID_DEVICE';
  end if;

  select e.* into v_event
  from public.event_invites i join public.events e on e.id = i.event_id
  where i.token = p_token
  for update of e;
  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  if v_event.status <> 'active' or v_event.starts_at <= now() then
    raise exception 'EVENT_CLOSED';
  end if;

  v_hash := encode(extensions.digest(p_device, 'sha256'), 'hex');
  select answer into v_previous from public.invite_responses where event_id = v_event.id and device_hash = v_hash;
  select count(*) into v_total from public.invite_responses where event_id = v_event.id;
  if v_previous is null and v_total >= 60 then
    raise exception 'INVITE_LIMIT';
  end if;

  v_yes := public.invite_yes_count(v_event.id);
  v_pending := greatest(v_event.guest_count - v_yes, 0);
  v_accepted := public.accepted_count(v_event);

  if p_answer = 'yes' and v_previous is distinct from 'yes' then
    if v_pending = 0 then
      -- Brak zarezerwowanych „?” — bierzemy wolne miejsce z puli Metando (zostaje co najmniej jedno miejsce).
      if v_event.spots - v_accepted < 1 or v_event.spots <= 1 then
        raise exception 'INVITE_FULL';
      end if;
      update public.events set spots = spots - 1, guest_count = guest_count + 1 where id = v_event.id;
    end if;
  elsif p_answer = 'no' and v_previous = 'yes' then
    perform public.release_guest_seat(v_event.id);
  elsif p_answer = 'no' and v_previous is null and v_pending > 0 then
    -- Zaproszony odmówił — jedno „?” mniej, miejsce wraca do Metando.
    perform public.release_guest_seat(v_event.id);
  end if;

  insert into public.invite_responses (event_id, name, answer, device_hash)
  values (v_event.id, v_name, p_answer, v_hash)
  on conflict (event_id, device_hash) do update
    set name = excluded.name, answer = excluded.answer, updated_at = now();

  return p_answer;
end;
$$;

-- Organizator usuwa odpowiedź (np. pomyłka albo podszywanie się); potwierdzone miejsce wraca do Metando.
create function public.remove_invite_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response public.invite_responses;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_response from public.invite_responses where id = p_response_id;
  if not found then
    raise exception 'RESPONSE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.events where id = v_response.event_id and organizer_id = auth.uid()) then
    raise exception 'NOT_ORGANIZER';
  end if;
  delete from public.invite_responses where id = p_response_id;
  if v_response.answer = 'yes' then
    perform public.release_guest_seat(v_response.event_id);
  end if;
end;
$$;

-- Nieodpowiedziane „?” zwalniają się 12 h przed startem (wywoływane przy wejściu na listę i szczegóły).
create function public.release_stale_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_released integer := 0;
  v_pending integer;
begin
  for v_event in
    select id, guest_count from public.events
    where status = 'active' and guest_count > 0
      and starts_at > now() and starts_at - interval '12 hours' <= now()
    for update skip locked
  loop
    v_pending := v_event.guest_count - public.invite_yes_count(v_event.id);
    if v_pending > 0 then
      update public.events
      set guest_count = guest_count - v_pending, spots = least(spots + v_pending, 50)
      where id = v_event.id;
      perform public.settle_event(v_event.id);
      v_released := v_released + v_pending;
    end if;
  end loop;
  return v_released;
end;
$$;

-- Edycja: liczba zarezerwowanych miejsc nie może spaść poniżej potwierdzonych gości.
create or replace function public.update_event(
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
  if coalesce(p_guest_count, 0) < public.invite_yes_count(p_event_id) then
    raise exception 'GUESTS_BELOW_CONFIRMED';
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

revoke execute on function public.invite_yes_count(uuid) from public, anon, authenticated;
revoke execute on function public.release_guest_seat(uuid) from public, anon, authenticated;
revoke execute on function public.create_event_invite(uuid) from public, anon;
revoke execute on function public.remove_invite_response(uuid) from public, anon;
grant execute on function public.create_event_invite(uuid) to authenticated;
grant execute on function public.remove_invite_response(uuid) to authenticated;
-- Zaproszeni nie mają kont: karta zaproszenia i odpowiedź są dostępne bez logowania (chroni je losowy token
-- i Turnstile w aplikacji); zwalnianie nieodpowiedzianych miejsc jest bezpieczne do wywołania przez każdego.
grant execute on function public.get_invite(text, text) to anon, authenticated;
grant execute on function public.respond_to_invite(text, text, text, text) to anon, authenticated;
grant execute on function public.release_stale_invites() to anon, authenticated;
