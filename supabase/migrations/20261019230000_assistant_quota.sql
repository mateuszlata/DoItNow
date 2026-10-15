-- Limity asystenta AI przy spotkaniu (każde pytanie to płatne wywołanie modelu). Na dobę (strefa Warszawy):
-- zalogowany — 20 pytań, osoba bez konta — 5 pytań na adres IP (w bazie tylko jego skrót), cały serwis — 300.
-- Nie zapisujemy treści pytań ani odpowiedzi, tylko liczniki.

create table public.assistant_usage (
  day date not null,
  -- 'user:<uuid>', 'ip:<sha256>' albo '*' (cały serwis)
  subject text not null check (char_length(subject) <= 80),
  questions integer not null default 0,
  primary key (day, subject)
);

-- Bez polityk: liczniki zmienia tylko funkcja poniżej.
alter table public.assistant_usage enable row level security;

-- Zużywa jedno pytanie; 'ok', 'user' (wyczerpany limit osoby) albo 'daily' (wyczerpany limit serwisu).
create function public.consume_assistant_quota(p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Europe/Warsaw')::date;
  v_subject text;
  v_limit integer;
  v_used integer;
begin
  if auth.uid() is not null then
    v_subject := 'user:' || auth.uid()::text;
    v_limit := 20;
  elsif p_ip_hash ~ '^[0-9a-f]{64}$' then
    v_subject := 'ip:' || p_ip_hash;
    v_limit := 5;
  else
    return 'user';
  end if;

  select questions into v_used from public.assistant_usage where day = v_day and subject = '*' for update;
  if coalesce(v_used, 0) >= 300 then
    return 'daily';
  end if;
  select questions into v_used from public.assistant_usage where day = v_day and subject = v_subject for update;
  if coalesce(v_used, 0) >= v_limit then
    return 'user';
  end if;

  insert into public.assistant_usage (day, subject, questions) values (v_day, v_subject, 1), (v_day, '*', 1)
  on conflict (day, subject) do update set questions = public.assistant_usage.questions + 1;
  -- Stare liczniki nie są potrzebne.
  delete from public.assistant_usage where day < v_day - 7;
  return 'ok';
end;
$$;

revoke execute on function public.consume_assistant_quota(text) from public;
grant execute on function public.consume_assistant_quota(text) to anon, authenticated;
