-- Zajawka czatu dla osób bez konta: kształt rozmowy zamiast treści. Kto pisał (numer osoby i jej koszulka —
-- bez nicku), kiedy i jak długa była wiadomość. Treść tylko wiadomości organizatora i tylko dla gościa ze
-- składu (odpowiedział „Będę”), bo tam są ustalenia (miejsce, godzina). Pełny czat — po założeniu konta.
-- Zastępuje dotychczasowy odczyt całego czatu przez gości (guest_event_messages).

drop function public.guest_event_messages(uuid, text, timestamptz);

create function public.event_chat_preview(p_event_id uuid, p_device text default null)
returns table (
  id uuid,
  author_key integer,
  from_organizer boolean,
  body text,
  length integer,
  created_at timestamptz,
  hidden boolean,
  kit_pattern text,
  kit_primary text,
  kit_secondary text,
  kit_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event public.events;
  v_response public.invite_responses;
  v_guest boolean := false;
begin
  select * into v_event from public.events where id = p_event_id;
  -- Zajawka tylko dla spotkań widocznych publicznie (aktywne, nadchodzące).
  if not found or v_event.status <> 'active' or v_event.starts_at <= now() then
    return;
  end if;
  v_response := public.guest_response(p_event_id, p_device);
  v_guest := v_response.id is not null and v_response.answer = 'yes';

  return query
    with recent as (
      select m.* from public.event_messages m
      where m.event_id = p_event_id
      order by m.created_at desc
      limit 40
    )
    select
      r.id,
      -- numer osoby w kolejności pierwszej wypowiedzi (zamiast nicku i id konta)
      (dense_rank() over (order by first_at.at, r.author_id))::integer,
      r.author_id = v_event.organizer_id,
      case when v_guest and r.author_id = v_event.organizer_id and r.hidden_at is null then r.body end,
      case when r.hidden_at is null then char_length(r.body) else 0 end,
      r.created_at,
      r.hidden_at is not null,
      pr.kit_pattern, pr.kit_primary, pr.kit_secondary, pr.kit_label
    from recent r
    join lateral (
      select min(x.created_at) as at from recent x where x.author_id = r.author_id
    ) first_at on true
    left join public.profiles pr on pr.id = r.author_id
    order by r.created_at;
end;
$$;

revoke execute on function public.event_chat_preview(uuid, text) from public;
grant execute on function public.event_chat_preview(uuid, text) to anon, authenticated;
