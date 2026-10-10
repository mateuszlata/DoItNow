-- Czat w wydarzeniu: piszą i czytają organizator oraz osoby w składzie i na rezerwie.
-- Wszystkie operacje idą przez funkcje poniżej; tabele nie mają polityk (RLS bez polityk = brak bezpośredniego dostępu),
-- dzięki czemu treść ukrytej wiadomości nigdy nie wychodzi z bazy.

create table public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  -- ukrycie przez autora („usuń”), organizatora albo administratora; treść przestaje być wydawana
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null
);

create index event_messages_event_created_idx on public.event_messages (event_id, created_at);
create index event_messages_author_created_idx on public.event_messages (author_id, created_at);

alter table public.event_messages enable row level security;

-- Zgłoszenia wiadomości do moderacji (DSA: mechanizm zgłaszania treści).
create table public.event_message_reports (
  message_id uuid not null references public.event_messages (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (message_id, reporter_id)
);

alter table public.event_message_reports enable row level security;

-- Administratorzy serwisu (moderacja zgłoszeń). Wpisy dodaje się ręcznie w panelu Supabase (SQL).
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.admins enable row level security;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Członek czatu: organizator albo osoba w składzie lub na rezerwie.
create function public.is_event_member(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events where id = p_event_id and organizer_id = auth.uid())
    or exists (
      select 1 from public.participations
      where event_id = p_event_id and user_id = auth.uid() and status in ('accepted', 'reserve')
    );
$$;

-- Czat jest otwarty do pisania, dopóki spotkanie nie zostało odwołane i nie minęły 3 dni od jego końca.
create function public.event_chat_open(p_event public.events)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_event.status <> 'cancelled' and p_event.ends_at + interval '3 days' > now();
$$;

create function public.list_event_messages(p_event_id uuid, p_after timestamptz default null)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  body text,
  created_at timestamptz,
  hidden boolean
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
           m.created_at, m.hidden_at is not null
    from public.event_messages m
    left join public.profiles pr on pr.id = m.author_id
    where m.event_id = p_event_id
      -- przy odświeżaniu: nowe wiadomości oraz te ukryte od ostatniego pobrania
      and (p_after is null or m.created_at > p_after or m.hidden_at > p_after)
    order by m.created_at
    limit 500;
end;
$$;

create function public.post_event_message(p_event_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_body text := btrim(coalesce(p_body, ''));
  v_recent integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if not public.is_event_member(p_event_id) then
    raise exception 'NOT_MEMBER';
  end if;
  if not public.event_chat_open(v_event) then
    raise exception 'CHAT_CLOSED';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'MESSAGE_EMPTY';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  -- Limit przeciw zalewaniu czatu: 10 wiadomości na minutę na osobę.
  select count(*) into v_recent
  from public.event_messages
  where author_id = v_uid and created_at > now() - interval '1 minute';
  if v_recent >= 10 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.event_messages (event_id, author_id, body)
  values (p_event_id, v_uid, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

-- Ukrycie wiadomości: autor (usunięcie własnej), organizator spotkania albo administrator.
create function public.hide_event_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_message public.event_messages;
  v_organizer uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_message from public.event_messages where id = p_message_id for update;
  if not found then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;
  select organizer_id into v_organizer from public.events where id = v_message.event_id;

  if v_message.author_id <> v_uid and v_organizer <> v_uid and not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_message.hidden_at is not null then
    return;
  end if;

  update public.event_messages set hidden_at = now(), hidden_by = v_uid where id = p_message_id;
  update public.event_message_reports set resolved_at = now()
  where message_id = p_message_id and resolved_at is null;
end;
$$;

create function public.report_event_message(p_message_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_message public.event_messages;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_message from public.event_messages where id = p_message_id;
  if not found then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;
  if not public.is_event_member(v_message.event_id) then
    raise exception 'NOT_MEMBER';
  end if;
  if v_message.author_id = v_uid then
    raise exception 'OWN_MESSAGE';
  end if;

  insert into public.event_message_reports (message_id, reporter_id, reason)
  values (p_message_id, v_uid, nullif(left(btrim(coalesce(p_reason, '')), 500), ''))
  on conflict (message_id, reporter_id) do nothing;
end;
$$;

-- Lista otwartych zgłoszeń dla administratora.
create function public.list_message_reports()
returns table (
  message_id uuid,
  event_id uuid,
  author_name text,
  body text,
  created_at timestamptz,
  report_count bigint,
  reasons text[],
  last_reported_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
    select m.id, m.event_id, coalesce(pr.display_name, 'Usunięte konto'), m.body, m.created_at,
           count(r.*), array_remove(array_agg(r.reason), null), max(r.created_at)
    from public.event_message_reports r
    join public.event_messages m on m.id = r.message_id
    left join public.profiles pr on pr.id = m.author_id
    where r.resolved_at is null
    group by m.id, pr.display_name
    order by max(r.created_at) desc;
end;
$$;

-- Administrator zostawia wiadomość (zgłoszenie bezzasadne).
create function public.dismiss_message_reports(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.event_message_reports set resolved_at = now()
  where message_id = p_message_id and resolved_at is null;
end;
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_event_member(uuid) from public, anon;
revoke execute on function public.event_chat_open(public.events) from public, anon;
revoke execute on function public.list_event_messages(uuid, timestamptz) from public, anon;
revoke execute on function public.post_event_message(uuid, text) from public, anon;
revoke execute on function public.hide_event_message(uuid) from public, anon;
revoke execute on function public.report_event_message(uuid, text) from public, anon;
revoke execute on function public.list_message_reports() from public, anon;
revoke execute on function public.dismiss_message_reports(uuid) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_event_member(uuid) to authenticated;
grant execute on function public.event_chat_open(public.events) to authenticated;
grant execute on function public.list_event_messages(uuid, timestamptz) to authenticated;
grant execute on function public.post_event_message(uuid, text) to authenticated;
grant execute on function public.hide_event_message(uuid) to authenticated;
grant execute on function public.report_event_message(uuid, text) to authenticated;
grant execute on function public.list_message_reports() to authenticated;
grant execute on function public.dismiss_message_reports(uuid) to authenticated;
