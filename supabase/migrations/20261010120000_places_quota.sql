-- Liczniki zapytań do Google Places: budżet kroczący w ramach darmowej puli miesięcznej
-- i limit na użytkownika na godzinę. Tabele bez polityk RLS — zmieniają je tylko funkcje poniżej.

create table public.api_usage_daily (
  day date not null,
  api text not null check (api in ('autocomplete', 'details')),
  count integer not null default 0,
  primary key (day, api)
);

create table public.api_usage_user_hourly (
  user_id uuid not null references auth.users (id) on delete cascade,
  hour timestamptz not null,
  count integer not null default 0,
  primary key (user_id, hour)
);

alter table public.api_usage_daily enable row level security;
alter table public.api_usage_user_hourly enable row level security;

-- Identyfikator miejsca Google przy obiekcie: współrzędne z Google wolno trzymać najwyżej 30 dni,
-- więc zapisujemy też identyfikator, żeby je odświeżać.
alter table public.venues add column google_place_id text check (char_length(google_place_id) <= 300);

/**
 * Zużywa jedno zapytanie danego rodzaju, jeśli mieści się w dzisiejszym przydziale i limicie użytkownika.
 * Dzisiejszy przydział = (limit miesięczny − zużyte w tym miesiącu przed dziś) ÷ dni do końca miesiąca
 * łącznie z dzisiejszym (czas polski). Zwraca 'ok', 'daily' (wyczerpany przydział dnia) albo 'user'.
 */
create function public.consume_places_quota(p_api text, p_monthly_limit integer, p_user_hourly_limit integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_month_start date := date_trunc('month', v_today)::date;
  v_days_left integer := ((date_trunc('month', v_today) + interval '1 month')::date - v_today);
  v_used_before integer;
  v_used_today integer;
  v_allowed integer;
  v_hour timestamptz := date_trunc('hour', now());
  v_user_count integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_api not in ('autocomplete', 'details') then
    raise exception 'INVALID_DATA';
  end if;

  -- Równoległe zapytania liczone po kolei, żeby nie przekroczyć przydziału.
  perform pg_advisory_xact_lock(hashtext('places_quota:' || p_api));

  select coalesce(sum(count), 0) into v_used_before
  from public.api_usage_daily
  where api = p_api and day >= v_month_start and day < v_today;
  select coalesce(count, 0) into v_used_today
  from public.api_usage_daily where api = p_api and day = v_today;
  v_used_today := coalesce(v_used_today, 0);
  v_allowed := greatest(p_monthly_limit - v_used_before, 0) / v_days_left;
  if v_used_today >= v_allowed then
    return 'daily';
  end if;

  select count into v_user_count
  from public.api_usage_user_hourly where user_id = v_uid and hour = v_hour;
  if coalesce(v_user_count, 0) >= p_user_hourly_limit then
    return 'user';
  end if;

  insert into public.api_usage_daily (day, api, count) values (v_today, p_api, 1)
  on conflict (day, api) do update set count = public.api_usage_daily.count + 1;
  insert into public.api_usage_user_hourly (user_id, hour, count) values (v_uid, v_hour, 1)
  on conflict (user_id, hour) do update set count = public.api_usage_user_hourly.count + 1;
  return 'ok';
end;
$$;

/** Zużycie w bieżącym miesiącu i dziś oraz dzisiejszy przydział — do strony statystyk. */
create function public.places_quota_stats(p_monthly_limit integer)
returns table (api text, used_month integer, used_today integer, allowed_today integer, days_left integer)
language sql
security definer
set search_path = ''
stable
as $$
  with t as (
    select
      (now() at time zone 'Europe/Warsaw')::date as today,
      date_trunc('month', (now() at time zone 'Europe/Warsaw')::date)::date as month_start
  ), apis(api) as (values ('autocomplete'), ('details'))
  select
    a.api,
    coalesce((select sum(d.count) from public.api_usage_daily d, t
              where d.api = a.api and d.day >= t.month_start), 0)::integer as used_month,
    coalesce((select d.count from public.api_usage_daily d, t
              where d.api = a.api and d.day = t.today), 0)::integer as used_today,
    (greatest(p_monthly_limit - coalesce((select sum(d.count) from public.api_usage_daily d, t
              where d.api = a.api and d.day >= t.month_start and d.day < t.today), 0), 0)
      / ((date_trunc('month', t.today) + interval '1 month')::date - t.today))::integer as allowed_today,
    ((date_trunc('month', t.today) + interval '1 month')::date - t.today)::integer as days_left
  from apis a, t;
$$;

revoke execute on function public.consume_places_quota(text, integer, integer) from public, anon;
grant execute on function public.consume_places_quota(text, integer, integer) to authenticated;
revoke execute on function public.places_quota_stats(integer) from public, anon;
grant execute on function public.places_quota_stats(integer) to authenticated;
