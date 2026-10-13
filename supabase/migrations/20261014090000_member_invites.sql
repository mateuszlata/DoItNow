-- Zaproszenia od każdego gracza: organizator i osoby w składzie mają własny link i własną pulę miejsc
-- dla znajomych spoza Metando. events.guest_count = suma pul (potwierdzeni + „?”), events.guest_confirmed =
-- potwierdzeni („Będę”). `spots` nadal oznacza miejsca do obsadzenia w Metando: rezerwacja miejsca dla gościa
-- to spots - 1 i guest_count + 1, zwolnienie — odwrotnie (z awansem rezerwy przez settle_event).

alter table public.events
  add column members_can_invite boolean not null default true,
  add column guest_confirmed integer not null default 0 check (guest_confirmed >= 0);

-- Minimum osób dotyczy całego składu (z gośćmi spoza Metando), a nie tylko miejsc w aplikacji.
alter table public.events drop constraint events_min_people_range;
alter table public.events add constraint events_min_people_range check (
  min_people is null
  or (min_people >= 1 and min_people <= spots + guest_count + case when organizer_plays then 1 else 0 end)
);

create table public.guest_invites (
  event_id uuid not null references public.events (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  -- zarezerwowane miejsca tego zapraszającego (potwierdzeni + oczekujący)
  reserved integer not null default 0 check (reserved between 0 and 49),
  created_at timestamptz not null default now(),
  primary key (event_id, inviter_id)
);

alter table public.guest_invites enable row level security;

-- Własny link widzi zapraszający, a wszystkie — organizator (pule innych członkowie widzą przez event_guest_groups).
create policy "guest_invites_select_own_or_organizer"
  on public.guest_invites for select
  to authenticated
  using (
    inviter_id = (select auth.uid())
    or exists (select 1 from public.events e where e.id = event_id and e.organizer_id = (select auth.uid()))
  );

alter table public.invite_responses add column inviter_id uuid references auth.users (id) on delete set null;

-- Przeniesienie dotychczasowych linków organizatorów.
insert into public.guest_invites (event_id, inviter_id, token, reserved)
select i.event_id, e.organizer_id, i.token, e.guest_count
from public.event_invites i join public.events e on e.id = i.event_id;

-- Pule organizatorów bez linku (goście wpisani w formularzu przed zaproszeniami).
insert into public.guest_invites (event_id, inviter_id, token, reserved)
select e.id, e.organizer_id, encode(extensions.gen_random_bytes(24), 'hex'), e.guest_count
from public.events e
where e.guest_count > 0 and not exists (select 1 from public.guest_invites g where g.event_id = e.id);

update public.invite_responses r set inviter_id = e.organizer_id from public.events e where e.id = r.event_id;
update public.events e set guest_confirmed = (
  select count(*) from public.invite_responses r where r.event_id = e.id and r.answer = 'yes'
);

drop function public.create_event_invite(uuid);
drop function public.get_invite(text, text);
drop function public.respond_to_invite(text, text, text, text);
drop function public.remove_invite_response(uuid);
drop function public.release_stale_invites();
drop function public.release_guest_seat(uuid);
drop function public.invite_yes_count(uuid);
drop table public.event_invites;

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
    e.guest_confirmed
  from public.events e
  where e.status = 'active' and e.starts_at > now();

-- Zmiana puli zapraszającego o `p_delta` miejsc (bez sprawdzania uprawnień — wołają ją funkcje poniżej).
create function public.shift_guest_seats(p_event_id uuid, p_inviter uuid, p_delta integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_delta = 0 then
    return;
  end if;
  update public.guest_invites set reserved = reserved + p_delta where event_id = p_event_id and inviter_id = p_inviter;
  update public.events
  set spots = spots - p_delta, guest_count = guest_count + p_delta
  where id = p_event_id;
  if p_delta < 0 then
    perform public.settle_event(p_event_id);
  end if;
end;
$$;

create function public.inviter_confirmed(p_event_id uuid, p_inviter uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.invite_responses
  where event_id = p_event_id and inviter_id = p_inviter and answer = 'yes';
$$;

create function public.refresh_guest_confirmed(p_event_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.events
  set guest_confirmed = (
    select count(*) from public.invite_responses where event_id = p_event_id and answer = 'yes'
  )
  where id = p_event_id;
$$;

-- Członek składu ustawia, ilu znajomych zaprasza; zwraca jego link.
create function public.set_my_invites(p_event_id uuid, p_count integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_row public.guest_invites;
  v_confirmed integer;
  v_accepted integer;
  v_delta integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.status <> 'active' or v_event.starts_at <= now() then
    raise exception 'EVENT_CLOSED';
  end if;
  if v_event.organizer_id <> v_uid then
    if not exists (
      select 1 from public.participations where event_id = p_event_id and user_id = v_uid and status = 'accepted'
    ) then
      raise exception 'NOT_IN_SQUAD';
    end if;
    if not v_event.members_can_invite then
      raise exception 'INVITES_DISABLED';
    end if;
  end if;
  if p_count is null or p_count < 0 or p_count > 49 then
    raise exception 'INVALID_COUNT';
  end if;

  select * into v_row from public.guest_invites where event_id = p_event_id and inviter_id = v_uid;
  if not found then
    insert into public.guest_invites (event_id, inviter_id, token, reserved)
    values (p_event_id, v_uid, encode(extensions.gen_random_bytes(24), 'hex'), 0)
    returning * into v_row;
  end if;

  v_confirmed := public.inviter_confirmed(p_event_id, v_uid);
  if p_count < v_confirmed then
    raise exception 'BELOW_CONFIRMED';
  end if;
  v_delta := p_count - v_row.reserved;
  if v_delta > 0 then
    v_accepted := public.accepted_count(v_event);
    -- Zawsze zostaje co najmniej jedno miejsce do obsadzenia w Metando.
    if v_event.spots - v_accepted < v_delta or v_event.spots - v_delta < 1 then
      raise exception 'NO_FREE_SPOTS';
    end if;
  end if;
  perform public.shift_guest_seats(p_event_id, v_uid, v_delta);
  return v_row.token;
end;
$$;

-- Karta zaproszenia dla osoby bez konta.
create function public.get_invite(p_token text, p_device text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.guest_invites;
  v_event public.events;
  v_accepted integer;
  v_mine jsonb;
  v_inviter text;
begin
  select * into v_invite from public.guest_invites where token = p_token;
  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  select * into v_event from public.events where id = v_invite.event_id;
  v_accepted := public.accepted_count(v_event);
  select display_name into v_inviter from public.profiles where id = v_invite.inviter_id;
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
    'organizer_name', coalesce(v_inviter, 'Organizator'),
    'team_size', v_event.spots + (case when v_event.organizer_plays then 1 else 0 end) + v_event.guest_count,
    'taken', v_accepted + (case when v_event.organizer_plays then 1 else 0 end) + v_event.guest_confirmed,
    'invited_pending', greatest(v_invite.reserved - public.inviter_confirmed(v_event.id, v_invite.inviter_id), 0),
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
  v_invite public.guest_invites;
  v_event public.events;
  v_name text := btrim(coalesce(p_name, ''));
  v_hash text;
  v_previous public.invite_responses;
  v_total integer;
  v_pending integer;
  v_accepted integer;
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

  select * into v_invite from public.guest_invites where token = p_token;
  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status <> 'active' or v_event.starts_at <= now() then
    raise exception 'EVENT_CLOSED';
  end if;

  v_hash := encode(extensions.digest(p_device, 'sha256'), 'hex');
  select * into v_previous from public.invite_responses where event_id = v_event.id and device_hash = v_hash;
  select count(*) into v_total from public.invite_responses where event_id = v_event.id;
  if v_previous.id is null and v_total >= 60 then
    raise exception 'INVITE_LIMIT';
  end if;
  -- Ta sama osoba odpowiadająca z linku innego zapraszającego: najpierw zwalniamy jej wcześniejsze „Będę”.
  if v_previous.answer = 'yes' and v_previous.inviter_id is distinct from v_invite.inviter_id then
    perform public.shift_guest_seats(v_event.id, v_previous.inviter_id, -1);
    v_previous.answer := null;
  end if;

  select * into v_invite from public.guest_invites where token = p_token;
  v_pending := greatest(v_invite.reserved - public.inviter_confirmed(v_event.id, v_invite.inviter_id), 0);

  if p_answer = 'yes' and v_previous.answer is distinct from 'yes' then
    if v_pending = 0 then
      -- Brak „?” w puli zapraszającego — bierzemy wolne miejsce z Metando (zostaje co najmniej jedno).
      select * into v_event from public.events where id = v_event.id;
      v_accepted := public.accepted_count(v_event);
      if v_event.spots - v_accepted < 1 or v_event.spots <= 1 then
        raise exception 'INVITE_FULL';
      end if;
      perform public.shift_guest_seats(v_event.id, v_invite.inviter_id, 1);
    end if;
  elsif p_answer = 'no' and v_previous.answer = 'yes' then
    perform public.shift_guest_seats(v_event.id, v_invite.inviter_id, -1);
  elsif p_answer = 'no' and v_previous.answer is null and v_pending > 0 then
    -- Zaproszony odmówił — jedno „?” mniej, miejsce wraca do Metando.
    perform public.shift_guest_seats(v_event.id, v_invite.inviter_id, -1);
  end if;

  insert into public.invite_responses (event_id, inviter_id, name, answer, device_hash)
  values (v_event.id, v_invite.inviter_id, v_name, p_answer, v_hash)
  on conflict (event_id, device_hash) do update
    set name = excluded.name, answer = excluded.answer, inviter_id = excluded.inviter_id, updated_at = now();
  perform public.refresh_guest_confirmed(v_event.id);
  return p_answer;
end;
$$;

-- Usunięcie odpowiedzi: zapraszający (swoich gości) albo organizator (wszystkich).
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
  if v_response.inviter_id is distinct from auth.uid()
    and not exists (select 1 from public.events where id = v_response.event_id and organizer_id = auth.uid()) then
    raise exception 'NOT_ALLOWED';
  end if;
  delete from public.invite_responses where id = p_response_id;
  if v_response.answer = 'yes' and v_response.inviter_id is not null then
    perform public.shift_guest_seats(v_response.event_id, v_response.inviter_id, -1);
  end if;
  perform public.refresh_guest_confirmed(v_response.event_id);
end;
$$;

-- Zwolnienie wszystkich „?” zapraszającego (np. gdy odchodzi ze składu); potwierdzeni goście zostają.
create function public.release_pending_invites(p_event_id uuid, p_inviter uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
begin
  select reserved - public.inviter_confirmed(p_event_id, p_inviter) into v_pending
  from public.guest_invites where event_id = p_event_id and inviter_id = p_inviter;
  if coalesce(v_pending, 0) > 0 then
    perform public.shift_guest_seats(p_event_id, p_inviter, -v_pending);
    return v_pending;
  end if;
  return 0;
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
  v_row record;
  v_released integer := 0;
begin
  for v_row in
    select g.event_id, g.inviter_id
    from public.guest_invites g join public.events e on e.id = g.event_id
    where e.status = 'active' and e.starts_at > now() and e.starts_at - interval '12 hours' <= now()
      and g.reserved > public.inviter_confirmed(g.event_id, g.inviter_id)
  loop
    v_released := v_released + public.release_pending_invites(v_row.event_id, v_row.inviter_id);
  end loop;
  return v_released;
end;
$$;

-- Gdy gracz przestaje być w składzie (rezygnacja, usunięcie), jego „?” wracają do Metando.
create function public.release_invites_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'accepted' and new.status <> 'accepted' then
    perform public.release_pending_invites(new.event_id, new.user_id);
  end if;
  return new;
end;
$$;

create trigger participations_release_invites
  after update of status on public.participations
  for each row execute function public.release_invites_on_leave();

-- Pule zaproszeń w spotkaniu dla członków: kto zaprosił, ile zarezerwował, kto potwierdził.
create function public.event_guest_groups(p_event_id uuid)
returns table (
  inviter_id uuid,
  inviter_name text,
  reserved integer,
  confirmed text[],
  in_squad boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_event_member(p_event_id) then
    raise exception 'NOT_MEMBER';
  end if;
  return query
    select g.inviter_id,
           coalesce(p.display_name, 'Usunięte konto'),
           g.reserved,
           coalesce(
             (select array_agg(r.name order by r.created_at) from public.invite_responses r
              where r.event_id = p_event_id and r.inviter_id = g.inviter_id and r.answer = 'yes'),
             '{}'
           ),
           (exists (select 1 from public.events e where e.id = p_event_id and e.organizer_id = g.inviter_id and e.organizer_plays)
            or exists (select 1 from public.participations pa
                       where pa.event_id = p_event_id and pa.user_id = g.inviter_id and pa.status = 'accepted'))
    from public.guest_invites g
    left join public.profiles p on p.id = g.inviter_id
    where g.event_id = p_event_id and g.reserved > 0
    order by g.created_at;
end;
$$;

-- Edycja spotkania: pola formularza bez gości (pule zmienia set_my_invites). `p_guest_count` to liczba gości,
-- z którą formularz policzył `p_spots` — różnicę względem stanu w bazie odejmujemy, żeby skład miał tyle osób,
-- ile wpisał organizator.
drop function public.update_event(
  uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision,
  integer, integer, boolean, integer, uuid, integer
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
  p_guest_count integer,
  p_members_can_invite boolean
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
  v_spots integer;
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

  v_spots := p_spots - (v_event.guest_count - coalesce(p_guest_count, v_event.guest_count));
  if v_spots < 1 then
    raise exception 'SPOTS_BELOW_ACCEPTED';
  end if;

  select count(*) filter (where status = 'accepted'), count(*) filter (where status = 'reserve')
    into v_accepted, v_reserve
  from public.participations where event_id = p_event_id;
  if v_spots < v_accepted then
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
      spots = v_spots,
      description = nullif(p_description, ''),
      organizer_plays = p_organizer_plays,
      lat = p_lat,
      lng = p_lng,
      reserve_spots = p_reserve_spots,
      min_people = p_min_people,
      requires_approval = p_requires_approval,
      duration_minutes = p_duration_minutes,
      venue_id = p_venue_id,
      members_can_invite = coalesce(p_members_can_invite, true)
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

revoke execute on function public.shift_guest_seats(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.inviter_confirmed(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.refresh_guest_confirmed(uuid) from public, anon, authenticated;
revoke execute on function public.release_pending_invites(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.release_invites_on_leave() from public, anon, authenticated;
revoke execute on function public.set_my_invites(uuid, integer) from public, anon;
revoke execute on function public.remove_invite_response(uuid) from public, anon;
revoke execute on function public.event_guest_groups(uuid) from public, anon;
revoke execute on function public.update_event(
  uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision,
  integer, integer, boolean, integer, uuid, integer, boolean
) from public, anon;

grant execute on function public.set_my_invites(uuid, integer) to authenticated;
grant execute on function public.remove_invite_response(uuid) to authenticated;
grant execute on function public.event_guest_groups(uuid) to authenticated;
grant execute on function public.update_event(
  uuid, text, text, text, timestamptz, integer, text, boolean, double precision, double precision,
  integer, integer, boolean, integer, uuid, integer, boolean
) to authenticated;
-- Zaproszeni nie mają kont: karta i odpowiedź dostępne bez logowania (chroni je losowy token i Turnstile).
grant execute on function public.get_invite(text, text) to anon, authenticated;
grant execute on function public.respond_to_invite(text, text, text, text) to anon, authenticated;
grant execute on function public.release_stale_invites() to anon, authenticated;
