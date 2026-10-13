-- Gość bez konta, który powiedział „Będę”, a potem założył konto i dołącza: jego miejsce gościa przechodzi
-- na konto (zamiast zajmować drugie miejsce). Zwolnienie miejsca gościa i zapis do składu dzieją się w jednej
-- transakcji, więc nikt z rezerwy nie wskoczy w międzyczasie; błąd przy zapisie przywraca miejsce gościa.
-- Spotkania z akceptacją organizatora: miejsce gościa zostaje do decyzji organizatora (zwykłe zgłoszenie).

create function public.join_event_claiming_guest(p_event_id uuid, p_device text)
returns public.participations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_response public.invite_responses;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  v_response := public.guest_response(p_event_id, p_device);
  if v_response.id is not null and v_response.answer = 'yes'
    and v_event.status = 'active' and v_event.starts_at > now()
    and not v_event.requires_approval
    and v_event.organizer_id <> v_uid
    and not exists (
      select 1 from public.participations
      where event_id = p_event_id and user_id = v_uid and status in ('pending', 'accepted', 'reserve')
    )
  then
    delete from public.invite_responses where id = v_response.id;
    if v_response.inviter_id is not null then
      update public.guest_invites set reserved = greatest(reserved - 1, 0)
      where event_id = p_event_id and inviter_id = v_response.inviter_id;
    end if;
    -- Bez settle_event: zwolnione miejsce zajmie zaraz ta sama osoba (już z kontem).
    update public.events
    set spots = spots + 1, guest_count = greatest(guest_count - 1, 0)
    where id = p_event_id;
    perform public.refresh_guest_confirmed(p_event_id);
  end if;

  return public.request_to_join(p_event_id);
end;
$$;

revoke execute on function public.join_event_claiming_guest(uuid, text) from public, anon;
grant execute on function public.join_event_claiming_guest(uuid, text) to authenticated;
