-- Statystyki zużycia puli Google widzi tylko administrator (strona /admin/places); innym zwraca pusty wynik.
create or replace function public.places_quota_stats(p_monthly_limit integer)
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
  from apis a, t
  where public.is_admin();
$$;
