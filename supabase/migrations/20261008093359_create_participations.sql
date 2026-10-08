-- Zgłoszenia na ogłoszenia i ich przebieg (FR-007, FR-008, FR-010).
-- Reguła biznesowa z PRD: zgłoszenie przechodzi oczekuje -> zaakceptowane | odrzucone,
-- miejsce zajmuje tylko zaakceptowane zgłoszenie, a zaakceptowany uczestnik może
-- zrezygnować najpóźniej 12 h przed wydarzeniem.
--
-- Tabelę zmieniają wyłącznie funkcje poniżej (brak polityk insert/update/delete),
-- więc reguł nie da się obejść bezpośrednim zapytaniem.

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index participations_user_idx on public.participations (user_id);
create index participations_event_status_idx on public.participations (event_id, status);

alter table public.participations enable row level security;

-- Zaakceptowanych uczestników widzą wszyscy zalogowani (FR-006); pozostałe zgłoszenia
-- widzi tylko ich autor i organizator ogłoszenia.
create policy "participations_select_visible"
  on public.participations for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or status = 'accepted'
    or exists (
      select 1 from public.events e
      where e.id = participations.event_id and e.organizer_id = (select auth.uid())
    )
  );

-- Liczniki jako pola wyliczane (dostępne w zapytaniach jako kolumny ogłoszenia).
-- Działają z uprawnieniami wywołującego, więc pending_count widzi tylko organizator.
create function public.accepted_count(e public.events)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.participations p
  where p.event_id = e.id and p.status = 'accepted';
$$;

create function public.pending_count(e public.events)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer from public.participations p
  where p.event_id = e.id and p.status = 'pending';
$$;

-- Widok dla gości dostaje liczbę zajętych miejsc (bez danych uczestników).
create or replace view public.events_public as
  select
    e.id, e.sport, e.area, e.starts_at, e.spots,
    (select count(*)::integer from public.participations p
     where p.event_id = e.id and p.status = 'accepted') as accepted_count
  from public.events e
  where e.status = 'active' and e.starts_at > now();

-- Błędy zgłaszane przez funkcje to stałe kody; aplikacja tłumaczy je na komunikaty.

-- FR-007: zgłoszenie chęci udziału.
create function public.request_to_join(p_event_id uuid)
returns public.participations
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

  select * into v_event from public.events where id = p_event_id;
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
    if v_row.status = 'withdrawn' then
      update public.participations
      set status = 'pending', updated_at = now()
      where id = v_row.id
      returning * into v_row;
      return v_row;
    elsif v_row.status = 'rejected' then
      raise exception 'ALREADY_REJECTED';
    else
      raise exception 'ALREADY_REQUESTED';
    end if;
  end if;

  insert into public.participations (event_id, user_id)
  values (p_event_id, v_uid)
  returning * into v_row;
  return v_row;
exception
  when unique_violation then
    raise exception 'ALREADY_REQUESTED';
end;
$$;

-- FR-010: decyzja organizatora. Blokada wiersza ogłoszenia szereguje decyzje dla
-- tego samego ogłoszenia, więc równoczesne akceptacje nie przekroczą limitu miejsc.
create function public.decide_participation(p_participation_id uuid, p_accept boolean)
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

  -- Ponowny odczyt po blokadzie: status mógł się zmienić w międzyczasie.
  select * into v_row from public.participations where id = p_participation_id for update;
  if v_row.status <> 'pending' then
    raise exception 'NOT_PENDING';
  end if;

  if p_accept then
    select count(*) into v_accepted from public.participations
    where event_id = v_event.id and status = 'accepted';
    if v_accepted >= v_event.spots then
      raise exception 'EVENT_FULL';
    end if;
  end if;

  update public.participations
  set status = case when p_accept then 'accepted' else 'rejected' end, updated_at = now()
  where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

-- FR-008: rezygnacja. Zaakceptowany uczestnik może zrezygnować najpóźniej 12 h przed
-- wydarzeniem; oczekujące zgłoszenie można wycofać do startu, bo nie zajmuje miejsca.
create function public.withdraw_participation(p_event_id uuid)
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

  select * into v_row from public.participations
  where event_id = p_event_id and user_id = v_uid
  for update;
  if not found or v_row.status not in ('pending', 'accepted') then
    raise exception 'NOT_PARTICIPATING';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if v_event.starts_at <= now() then
    raise exception 'EVENT_STARTED';
  end if;
  if v_row.status = 'accepted' and now() > v_event.starts_at - interval '12 hours' then
    raise exception 'WITHDRAW_DEADLINE_PASSED';
  end if;

  update public.participations
  set status = 'withdrawn', updated_at = now()
  where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.request_to_join(uuid) from public, anon;
revoke execute on function public.decide_participation(uuid, boolean) from public, anon;
revoke execute on function public.withdraw_participation(uuid) from public, anon;
grant execute on function public.request_to_join(uuid) to authenticated;
grant execute on function public.decide_participation(uuid, boolean) to authenticated;
grant execute on function public.withdraw_participation(uuid) to authenticated;
