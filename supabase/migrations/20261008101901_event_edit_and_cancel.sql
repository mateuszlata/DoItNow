-- Edycja i odwołanie ogłoszenia (FR-004).
-- Reguły z PRD: autor może edytować ogłoszenie najpóźniej 12 h przed wydarzeniem
-- i odwołać je w każdej chwili; uczestnicy widzą status „odwołane”.
-- Dodatkowo: limit osób nie może spaść poniżej liczby zaakceptowanych uczestników.
--
-- Tabela events nie ma polityki update, więc zmiany są możliwe wyłącznie przez te funkcje.

create function public.update_event(
  p_event_id uuid,
  p_sport text,
  p_area text,
  p_place text,
  p_starts_at timestamptz,
  p_spots integer,
  p_description text
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

  -- Blokada szereguje edycję z decyzjami organizatora (decide_participation blokuje ten sam wiersz),
  -- więc liczba zaakceptowanych nie zmieni się w trakcie sprawdzania limitu.
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
  -- Granica liczona od dotychczasowego terminu, żeby nie dało się jej obejść zmianą daty.
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
      description = nullif(p_description, '')
  where id = p_event_id
  returning * into v_event;
  return v_event;
exception
  when check_violation then
    raise exception 'INVALID_DATA';
end;
$$;

create function public.cancel_event(p_event_id uuid)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
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

  update public.events set status = 'cancelled' where id = p_event_id returning * into v_event;
  return v_event;
end;
$$;

revoke execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text) from public, anon;
revoke execute on function public.cancel_event(uuid) from public, anon;
grant execute on function public.update_event(uuid, text, text, text, timestamptz, integer, text) to authenticated;
grant execute on function public.cancel_event(uuid) to authenticated;
