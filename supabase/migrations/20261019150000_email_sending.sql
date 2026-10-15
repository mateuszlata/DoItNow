-- Wysyłka powiadomień e-mail. Zadanie cykliczne workera (co 5 min) pobiera kolejkę funkcją claim_notification_emails,
-- wysyła maile przez Resend i zgłasza wynik funkcją finish_notification_emails. Obie wymagają sekretu workera
-- (NOTIFY_SECRET) — w bazie jest tylko jego skrót SHA-256, więc worker nie potrzebuje klucza serwisowego.
-- Link „wypisz się” w każdym mailu niesie losowy token osoby (unsubscribe_emails, dostępne bez logowania).

create table public.internal_secrets (
  name text primary key,
  digest text not null check (digest ~ '^[0-9a-f]{64}$')
);

-- Bez polityk: czytają go tylko funkcje poniżej.
alter table public.internal_secrets enable row level security;

-- Skrót sekretu workera produkcji (sam sekret jest wyłącznie w sekretach Cloudflare).
insert into public.internal_secrets (name, digest)
values ('notify', '38c2ed5424eb22b80e0a3b04f216cc99d17b547e90b102877219a9861e4ea346');

create function public.check_internal_secret(p_name text, p_secret text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_secret is null or not exists (
    select 1 from public.internal_secrets
    where name = p_name and digest = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then
    raise exception 'NOT_ALLOWED';
  end if;
end;
$$;

-- Token do wypisania się z maili, jeden na osobę (tworzony przy pierwszym mailu).
create table public.email_unsubscribe_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token uuid not null unique default gen_random_uuid()
);

alter table public.email_unsubscribe_tokens enable row level security;

-- Wysyłany mail jest „w drodze” (sending); gdy worker nie zgłosi wyniku, po 15 min wraca do kolejki.
alter table public.notifications drop constraint notifications_email_status_check;
alter table public.notifications
  add constraint notifications_email_status_check
  check (email_status in ('pending', 'sending', 'sent', 'failed', 'skipped'));
alter table public.notifications add column email_claimed_at timestamptz;

-- Pobiera paczkę maili do wysłania (najpierw kolejkuje przypomnienia). Pomija nieaktualne: starsze niż 6 h,
-- o spotkaniach, które już się zaczęły (poza odwołaniem), i osoby bez potwierdzonego adresu.
-- Czat wysyła zbiorczo: dopiero 10 min po pierwszej nowej wiadomości.
create function public.claim_notification_emails(p_secret text, p_limit integer default 50)
returns table (
  id uuid,
  email text,
  display_name text,
  category text,
  type text,
  data jsonb,
  event_id uuid,
  sport text,
  area text,
  place text,
  starts_at timestamptz,
  duration_minutes integer,
  unsubscribe_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.check_internal_secret('notify', p_secret);
  perform public.queue_reminders();

  update public.notifications n
  set email_status = 'skipped'
  from public.notifications x
  left join public.events e on e.id = x.event_id
  left join auth.users u on u.id = x.user_id
  where n.id = x.id
    and (x.email_status = 'pending'
         or (x.email_status = 'sending' and x.email_claimed_at < now() - interval '15 minutes'))
    and (x.created_at < now() - interval '6 hours'
         or (e.id is not null and e.starts_at <= now() and x.type <> 'cancelled')
         or u.email is null or u.email_confirmed_at is null);

  insert into public.email_unsubscribe_tokens (user_id)
  select distinct n.user_id from public.notifications n
  where n.email_status = 'pending'
  on conflict (user_id) do nothing;

  return query
    with picked as (
      select n.id from public.notifications n
      where (n.email_status = 'pending'
             or (n.email_status = 'sending' and n.email_claimed_at < now() - interval '15 minutes'))
        and (n.category <> 'chat' or n.created_at < now() - interval '10 minutes')
      order by n.created_at
      limit least(greatest(coalesce(p_limit, 50), 1), 100)
      for update skip locked
    ),
    claimed as (
      update public.notifications n
      set email_status = 'sending', email_claimed_at = now(), attempts = n.attempts + 1
      from picked
      where n.id = picked.id
      returning n.*
    )
    select c.id, u.email::text, p.display_name, c.category, c.type, c.data, c.event_id,
           e.sport, e.area, e.place, e.starts_at, e.duration_minutes, t.token
    from claimed c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    left join public.events e on e.id = c.event_id
    join public.email_unsubscribe_tokens t on t.user_id = c.user_id;
end;
$$;

-- Wynik wysyłki: wysłane oznaczamy, nieudane wracają do kolejki (najwyżej 3 próby).
create function public.finish_notification_emails(p_secret text, p_sent uuid[], p_failed uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_internal_secret('notify', p_secret);
  update public.notifications
  set email_status = 'sent', sent_at = now()
  where id = any(coalesce(p_sent, '{}')) and email_status = 'sending';
  update public.notifications
  set email_status = case when attempts >= 3 then 'failed' else 'pending' end
  where id = any(coalesce(p_failed, '{}')) and email_status = 'sending';
end;
$$;

-- „Wypisz się” z maila: wyłącza wszystkie powiadomienia e-mail tej osoby (telefon zostaje bez zmian).
create function public.unsubscribe_emails(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.email_unsubscribe_tokens where token = p_token;
  if not found then
    return false;
  end if;
  insert into public.notification_settings (
    user_id, activity_email, status_email, changes_email, reminder_email, chat_email, updated_at
  )
  values (v_user, false, false, false, false, false, now())
  on conflict (user_id) do update
  set activity_email = false, status_email = false, changes_email = false, reminder_email = false,
      chat_email = false, updated_at = now();
  update public.notifications set email_status = 'skipped'
  where user_id = v_user and email_status = 'pending';
  return true;
end;
$$;

revoke execute on function public.check_internal_secret(text, text) from public, anon, authenticated;
revoke execute on function public.claim_notification_emails(text, integer) from public;
revoke execute on function public.finish_notification_emails(text, uuid[], uuid[]) from public;
revoke execute on function public.unsubscribe_emails(uuid) from public;
-- Worker woła je kluczem publicznym (rola anon); dostęp otwiera dopiero właściwy sekret.
grant execute on function public.claim_notification_emails(text, integer) to anon, authenticated;
grant execute on function public.finish_notification_emails(text, uuid[], uuid[]) to anon, authenticated;
grant execute on function public.unsubscribe_emails(uuid) to anon, authenticated;
