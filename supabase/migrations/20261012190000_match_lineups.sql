-- „Składy na mecz” (piłka nożna): ulubiona pozycja gracza i podział składu na dwie drużyny na boisku.
-- Składy ustawia wyłącznie organizator przez set_event_lineup; czytają je organizator i osoby w składzie lub na rezerwie.

alter table public.profiles
  add column football_position text check (football_position in ('bramka', 'obrona', 'pomoc', 'atak', 'obojetnie'));

create table public.event_lineups (
  event_id uuid primary key references public.events (id) on delete cascade,
  team_a_color text not null,
  team_b_color text not null,
  -- [{ "user_id": uuid, "team": 0|1, "slot": 0..10 }]
  assignments jsonb not null,
  updated_at timestamptz not null default now(),
  check (team_a_color <> team_b_color),
  check (team_a_color in ('#ff7a1a', '#2a9d55', '#d62828', '#1d3557', '#f4d03f', '#ffffff', '#6a3fa0', '#13261f')),
  check (team_b_color in ('#ff7a1a', '#2a9d55', '#d62828', '#1d3557', '#f4d03f', '#ffffff', '#6a3fa0', '#13261f')),
  check (jsonb_typeof(assignments) = 'array')
);

alter table public.event_lineups enable row level security;

-- Składy widzą członkowie spotkania (organizator, skład, rezerwa). Brak polityk insert/update/delete:
-- zmiany wyłącznie przez funkcje poniżej.
create policy "event_lineups_select_members"
  on public.event_lineups for select
  to authenticated
  using (public.is_event_member(event_id));

create function public.set_event_lineup(
  p_event_id uuid,
  p_team_a_color text,
  p_team_b_color text,
  p_assignments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_item jsonb;
  v_user uuid;
  v_team int;
  v_slot int;
  v_seen uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.organizer_id <> v_uid then
    raise exception 'NOT_ORGANIZER';
  end if;
  if v_event.status = 'cancelled' then
    raise exception 'EVENT_CANCELLED';
  end if;
  if v_event.sport <> 'pilka-nozna' then
    raise exception 'LINEUP_NOT_SUPPORTED';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) > 60 then
    raise exception 'INVALID_LINEUP';
  end if;

  for v_item in select * from jsonb_array_elements(p_assignments) loop
    begin
      v_user := (v_item ->> 'user_id')::uuid;
      v_team := (v_item ->> 'team')::int;
      v_slot := (v_item ->> 'slot')::int;
    exception when others then
      raise exception 'INVALID_LINEUP';
    end;
    if v_user is null or v_team not in (0, 1) or v_slot is null or v_slot not between 0 and 10 or v_user = any (v_seen) then
      raise exception 'INVALID_LINEUP';
    end if;
    -- tylko osoby grające: przyjęci do składu albo grający organizator
    if not (
      (v_user = v_event.organizer_id and v_event.organizer_plays)
      or exists (
        select 1 from public.participations
        where event_id = p_event_id and user_id = v_user and status = 'accepted'
      )
    ) then
      raise exception 'NOT_IN_SQUAD';
    end if;
    v_seen := v_seen || v_user;
  end loop;

  insert into public.event_lineups (event_id, team_a_color, team_b_color, assignments, updated_at)
  values (p_event_id, p_team_a_color, p_team_b_color, p_assignments, now())
  on conflict (event_id) do update
    set team_a_color = excluded.team_a_color,
        team_b_color = excluded.team_b_color,
        assignments = excluded.assignments,
        updated_at = now();
end;
$$;

-- „Na ławkę”: organizator usuwa podział.
create function public.clear_event_lineup(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (select 1 from public.events where id = p_event_id and organizer_id = auth.uid()) then
    raise exception 'NOT_ORGANIZER';
  end if;
  delete from public.event_lineups where event_id = p_event_id;
end;
$$;

revoke execute on function public.set_event_lineup(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.clear_event_lineup(uuid) from public, anon;
grant execute on function public.set_event_lineup(uuid, text, text, jsonb) to authenticated;
grant execute on function public.clear_event_lineup(uuid) to authenticated;
