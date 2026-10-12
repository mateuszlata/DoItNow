-- Składy na mecz także dla koszykówki, siatkówki i gier rakietowych (tenis, badminton, tenis stołowy).
-- Ulubione pozycje osobno dla każdego sportu (tabela player_positions); kolumna profiles.football_position
-- zostaje tylko do przeniesienia danych — aplikacja czyta już player_positions.

create table public.player_positions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sport text not null,
  position text not null,
  primary key (user_id, sport),
  check (
    (sport = 'pilka-nozna' and position in ('bramka', 'obrona', 'pomoc', 'atak', 'obojetnie'))
    or (sport = 'koszykowka' and position in ('rozgrywajacy', 'skrzydlowy', 'srodkowy', 'obojetnie'))
    or (sport = 'siatkowka' and position in ('rozgrywajacy', 'przyjmujacy', 'srodkowy', 'atakujacy', 'libero', 'obojetnie'))
  )
);

alter table public.player_positions enable row level security;

-- Pozycje widzą zalogowani (potrzebne w składach na mecz); zmienia je tylko właściciel.
create policy "player_positions_select_authenticated"
  on public.player_positions for select
  to authenticated
  using (true);

create policy "player_positions_insert_own"
  on public.player_positions for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "player_positions_update_own"
  on public.player_positions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "player_positions_delete_own"
  on public.player_positions for delete
  to authenticated
  using (user_id = (select auth.uid()));

insert into public.player_positions (user_id, sport, position)
select id, 'pilka-nozna', football_position from public.profiles where football_position is not null
on conflict do nothing;

-- Składy dla kolejnych sportów: ta sama funkcja, szersza lista sportów.
create or replace function public.set_event_lineup(
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
  if v_event.sport not in ('pilka-nozna', 'koszykowka', 'siatkowka', 'tenis', 'badminton', 'tenis-stolowy') then
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
