-- Wysyłka maili odporna na usunięcie konta w trakcie przygotowania paczki (wcześniej błąd klucza obcego
-- przy tokenie „wypisz się” przerywał całe uruchomienie zadania).

create or replace function public.claim_notification_emails(p_secret text, p_limit integer default 50)
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

  -- Konto usunięte w trakcie (np. równolegle z wysyłką) nie może wyłożyć całej paczki:
  -- jego powiadomienia znikają kaskadowo, a bez tokenu i tak nie wejdą do wyniku poniżej.
  begin
    insert into public.email_unsubscribe_tokens (user_id)
    select distinct n.user_id from public.notifications n
    where n.email_status = 'pending'
      and exists (select 1 from auth.users u where u.id = n.user_id)
    on conflict (user_id) do nothing;
  exception
    when foreign_key_violation then null;
  end;

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
