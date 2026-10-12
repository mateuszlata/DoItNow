-- Statystyki serwisu dla panelu administratora (/admin). Tylko konta z tabeli public.admins.
-- Zwraca dane zbiorcze; szczegóły pojedynczych osób nie są tu potrzebne (minimalizacja danych, RODO).
-- „Udział w spotkaniu” = organizator albo osoba przyjęta do składu (także jeśli później zrezygnowała po fakcie startu).

create function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'Europe/Warsaw';
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  with
  activity as (
    -- kto, w którym spotkaniu i kiedy brał udział
    select e.organizer_id as user_id, e.id as event_id, e.starts_at
    from public.events e
    where e.status <> 'cancelled'
    union
    select p.user_id, p.event_id, e.starts_at
    from public.participations p
    join public.events e on e.id = p.event_id
    where p.status = 'accepted' and e.status <> 'cancelled'
  ),
  per_user as (
    select u.id,
           count(distinct a.event_id) as events,
           count(distinct date_trunc('week', a.starts_at)) as weeks
    from auth.users u
    left join activity a on a.user_id = u.id
    group by u.id
  ),
  fill_times as (
    -- czas od utworzenia ogłoszenia do zapełnienia składu (ostatnia przyjęta osoba)
    select e.id, max(p.updated_at) - e.created_at as took
    from public.events e
    join public.participations p on p.event_id = e.id and p.status = 'accepted'
    where e.status <> 'cancelled'
    group by e.id, e.created_at, e.spots
    having count(*) >= e.spots
  ),
  days as (
    select generate_series(
      (now() at time zone v_tz)::date - 29,
      (now() at time zone v_tz)::date,
      interval '1 day'
    )::date as day
  )
  select jsonb_build_object(
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'new_today', (select count(*) from auth.users where (created_at at time zone v_tz)::date = (now() at time zone v_tz)::date),
      'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days')
    ),
    'events', jsonb_build_object(
      'total', (select count(*) from public.events),
      'upcoming', (select count(*) from public.events where status = 'active' and starts_at > now()),
      'cancelled', (select count(*) from public.events where status = 'cancelled'),
      'played', (select count(*) from public.events where status <> 'cancelled' and starts_at <= now()),
      'filled_pct', (
        select round(100.0 * count(*) filter (where public.accepted_count(ev) >= ev.spots) / nullif(count(*), 0))
        from public.events ev where ev.status <> 'cancelled' and ev.starts_at <= now()
      ),
      'avg_fill_hours', (select round(extract(epoch from avg(took)) / 3600.0, 1) from fill_times),
      'joins', (select count(*) from public.participations where status in ('accepted', 'reserve')),
      'messages', (select count(*) from public.event_messages),
      'venue_events', (select count(*) from public.events where venue_id is not null and status <> 'cancelled'),
      'venue_approved', (select count(*) from public.events where venue_status = 'approved' and status <> 'cancelled'),
      'venue_revenue_cents', (
        select coalesce(sum(cost_cents), 0) from public.events
        where venue_status = 'approved' and status <> 'cancelled' and starts_at <= now()
      )
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'signups', (select count(*) from auth.users u where (u.created_at at time zone v_tz)::date = d.day),
        'events', (select count(*) from public.events e where (e.created_at at time zone v_tz)::date = d.day),
        'joins', (select count(*) from public.participations p where (p.created_at at time zone v_tz)::date = d.day),
        'messages', (select count(*) from public.event_messages m where (m.created_at at time zone v_tz)::date = d.day)
      ) order by d.day)
      from days d
    ),
    'sports', (
      select coalesce(jsonb_agg(jsonb_build_object('sport', sport, 'events', events, 'players', players) order by events desc), '[]')
      from (
        select e.sport, count(*) as events,
               sum(public.accepted_count(e) + case when e.organizer_plays then 1 else 0 end) as players
        from public.events e where e.status <> 'cancelled'
        group by e.sport
      ) s
    ),
    'weekdays', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'events', n) order by dow), '[]')
      from (
        select extract(isodow from starts_at at time zone v_tz)::int as dow, count(*) as n
        from public.events where status <> 'cancelled' group by 1
      ) w
    ),
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', hour, 'events', n) order by hour), '[]')
      from (
        select extract(hour from starts_at at time zone v_tz)::int as hour, count(*) as n
        from public.events where status <> 'cancelled' group by 1
      ) h
    ),
    'areas', (
      select coalesce(jsonb_agg(jsonb_build_object('area', area, 'events', n) order by n desc), '[]')
      from (
        select area, count(*) as n from public.events where status <> 'cancelled'
        group by area order by count(*) desc limit 12
      ) a
    ),
    'pins', (
      select coalesce(jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng, 'sport', sport)), '[]')
      from (
        select lat, lng, sport from public.events
        where lat is not null and lng is not null and status <> 'cancelled'
          and starts_at > now() - interval '90 days'
        order by starts_at desc limit 500
      ) p
    ),
    'venues', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', name, 'area', area, 'events', events, 'approved', approved, 'revenue_cents', revenue
      ) order by events desc), '[]')
      from (
        select v.name, v.area,
               count(e.id) filter (where e.status <> 'cancelled') as events,
               count(e.id) filter (where e.venue_status = 'approved' and e.status <> 'cancelled') as approved,
               coalesce(sum(e.cost_cents) filter (
                 where e.venue_status = 'approved' and e.status <> 'cancelled' and e.starts_at <= now()
               ), 0) as revenue
        from public.venues v
        left join public.events e on e.venue_id = v.id
        group by v.id, v.name, v.area
      ) v
    ),
    'funnel', jsonb_build_object(
      'registered', (select count(*) from per_user),
      'played_1', (select count(*) from per_user where events >= 1),
      'played_2', (select count(*) from per_user where events >= 2),
      'regular', (select count(*) from per_user where events >= 4),
      'returning_weeks', (select count(*) from per_user where weeks >= 2)
    ),
    'adoption', jsonb_build_object(
      'kits', (select count(*) from public.profiles where kit_pattern is not null),
      'favorites', (select count(*) from public.user_sport_preferences where cardinality(sports) > 0),
      'top_pattern', (
        select kit_pattern from public.profiles where kit_pattern is not null
        group by kit_pattern order by count(*) desc limit 1
      ),
      'top_color', (
        select kit_primary from public.profiles where kit_primary is not null
        group by kit_primary order by count(*) desc limit 1
      )
    ),
    'moderation', jsonb_build_object(
      'open_reports', (select count(distinct message_id) from public.event_message_reports where resolved_at is null)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;
