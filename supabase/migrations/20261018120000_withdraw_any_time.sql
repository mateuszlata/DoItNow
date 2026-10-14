-- Rezygnacja zawsze możliwa (aż do startu): zakaz nie sprawi, że ktoś przyjdzie, a zwolnione miejsce
-- od razu zajmuje rezerwa, organizator dostaje powiadomienie. Próg 12 h zostaje tylko dla edycji spotkania.
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

  update public.participations
  set status = 'withdrawn', updated_at = now()
  where id = v_row.id
  returning * into v_row;

  perform public.settle_event(p_event_id);
  return v_row;
end;
$$;
