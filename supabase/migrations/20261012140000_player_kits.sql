-- Strój gracza („moje barwy”) jako avatar: wzór, dwa kolory i numer albo inicjały.
-- Widoczny dla zalogowanych tak jak nick (profile czytają zalogowani); zmienia go tylko właściciel (profiles_update_own).
-- Puste kolumny = strój domyślny wyliczany w aplikacji z id konta (src/lib/kit.ts).

alter table public.profiles
  add column kit_pattern text check (
    kit_pattern in ('plain', 'vstripes', 'hoops', 'sash', 'halves', 'sleeves', 'pin')
  ),
  add column kit_primary text check (
    kit_primary in ('#ffffff', '#13261f', '#d62828', '#1d3557', '#7fb3e0', '#f4d03f',
                    '#2a9d55', '#7a1f3d', '#ff7a1a', '#6a3fa0', '#c9a227', '#8d99ae')
  ),
  add column kit_secondary text check (
    kit_secondary in ('#ffffff', '#13261f', '#d62828', '#1d3557', '#7fb3e0', '#f4d03f',
                      '#2a9d55', '#7a1f3d', '#ff7a1a', '#6a3fa0', '#c9a227', '#8d99ae')
  ),
  -- numer 0–99 albo 1–3 wielkie litery (inicjały)
  add column kit_label text check (kit_label ~ '^(0|[1-9][0-9]?|[A-ZĄĆĘŁŃÓŚŹŻ]{1,3})$'),
  -- strój ustawia się w całości albo wcale
  add constraint profiles_kit_complete check (
    (kit_pattern is null and kit_primary is null and kit_secondary is null and kit_label is null)
    or (kit_pattern is not null and kit_primary is not null and kit_secondary is not null and kit_label is not null)
  );

-- Czat zwraca też strój autora, żeby przy wiadomości była jego koszulka.
drop function public.list_event_messages(uuid, timestamptz);

create function public.list_event_messages(p_event_id uuid, p_after timestamptz default null)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  body text,
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
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_event_member(p_event_id) then
    raise exception 'NOT_MEMBER';
  end if;

  return query
    select m.id, m.author_id, coalesce(pr.display_name, 'Usunięte konto'),
           case when m.hidden_at is null then m.body end,
           m.created_at, m.hidden_at is not null,
           pr.kit_pattern, pr.kit_primary, pr.kit_secondary, pr.kit_label
    from public.event_messages m
    left join public.profiles pr on pr.id = m.author_id
    where m.event_id = p_event_id
      -- przy odświeżaniu: nowe wiadomości oraz te ukryte od ostatniego pobrania
      and (p_after is null or m.created_at > p_after or m.hidden_at > p_after)
    order by m.created_at
    limit 500;
end;
$$;

revoke execute on function public.list_event_messages(uuid, timestamptz) from public, anon;
grant execute on function public.list_event_messages(uuid, timestamptz) to authenticated;
