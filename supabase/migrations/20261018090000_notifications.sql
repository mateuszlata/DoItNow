-- Powiadomienia: ustawienia użytkownika (rodzaj × sposób) i skrzynka nadawcza.
-- Zdarzenia zapisują triggery na tabelach (zgłoszenia, spotkania, czat), więc nic nie umyka niezależnie od tego,
-- która funkcja zmieniła stan (np. awans z rezerwy po czyjejś rezygnacji). Osoba, która wykonała akcję, nie dostaje
-- powiadomienia o własnym działaniu. Wysyłką (e-mail, telefon) zajmuje się serwer aplikacji.

create table public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  -- Moje spotkania (organizator): ktoś dołączył, zgłosił się, zrezygnował
  activity_email boolean not null default true,
  activity_push boolean not null default true,
  -- Mój udział: akceptacja, odrzucenie, awans z rezerwy, usunięcie
  status_email boolean not null default true,
  status_push boolean not null default true,
  -- Zmiany w spotkaniu: odwołanie, nowy termin lub miejsce
  changes_email boolean not null default true,
  changes_push boolean not null default true,
  -- Przypomnienie dzień przed spotkaniem
  reminder_email boolean not null default true,
  reminder_push boolean not null default true,
  -- Nowe wiadomości na czacie (zbiorczo)
  chat_email boolean not null default false,
  chat_push boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

create policy "notification_settings_select_own"
  on public.notification_settings for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "notification_settings_insert_own"
  on public.notification_settings for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "notification_settings_update_own"
  on public.notification_settings for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Skrzynka nadawcza: jedno powiadomienie = jeden wiersz; stan wysyłki osobno dla każdego sposobu
-- (null — ten sposób jest wyłączony w ustawieniach).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  -- kategoria ustawień: activity | status | changes | reminder | chat
  category text not null check (category in ('activity', 'status', 'changes', 'reminder', 'chat')),
  -- szczegółowy rodzaj, np. joined, request, withdrew, accepted, rejected, promoted, removed, cancelled, changed
  type text not null check (char_length(type) between 2 and 30),
  -- dane do treści (np. nick osoby, która dołączyła); tekst składa serwer przy wysyłce
  data jsonb not null default '{}'::jsonb,
  email_status text check (email_status in ('pending', 'sent', 'failed', 'skipped')),
  push_status text check (push_status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notifications_pending_idx on public.notifications (created_at)
  where email_status = 'pending' or push_status = 'pending';
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Własne powiadomienia można czytać (np. przyszła lista w aplikacji); zapisy wyłącznie przez funkcje i serwer.
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Dodaje powiadomienie z uwzględnieniem ustawień odbiorcy; pomija, gdy odbiorca sam wykonał akcję
-- albo nie chce żadnym sposobem. Czat: jedno oczekujące powiadomienie na osobę i spotkanie (zbiorczo).
create function public.queue_notification(
  p_user_id uuid,
  p_event_id uuid,
  p_category text,
  p_type text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.notification_settings;
  v_email boolean;
  v_push boolean;
begin
  if p_user_id is null or p_user_id = auth.uid() then
    return;
  end if;
  select * into v_settings from public.notification_settings where user_id = p_user_id;
  if not found then
    -- Domyślne ustawienia (wiersz powstaje dopiero po pierwszej zmianie w „Moje”).
    v_settings := row(p_user_id, true, true, true, true, true, true, true, true, true, false, true, now());
  end if;
  if not v_settings.enabled then
    return;
  end if;
  v_email := case p_category
    when 'activity' then v_settings.activity_email
    when 'status' then v_settings.status_email
    when 'changes' then v_settings.changes_email
    when 'reminder' then v_settings.reminder_email
    when 'chat' then v_settings.chat_email
  end;
  v_push := case p_category
    when 'activity' then v_settings.activity_push
    when 'status' then v_settings.status_push
    when 'changes' then v_settings.changes_push
    when 'reminder' then v_settings.reminder_push
    when 'chat' then v_settings.chat_push
  end;
  if not (v_email or v_push) then
    return;
  end if;
  if p_category = 'chat' and exists (
    select 1 from public.notifications
    where user_id = p_user_id and event_id = p_event_id and category = 'chat'
      and (email_status = 'pending' or push_status = 'pending')
  ) then
    return;
  end if;
  insert into public.notifications (user_id, event_id, category, type, data, email_status, push_status)
  values (
    p_user_id, p_event_id, p_category, p_type, p_data,
    case when v_email then 'pending' end,
    case when v_push then 'pending' end
  );
end;
$$;

-- Zmiany zgłoszeń: dołączenie, zgłoszenie, decyzja organizatora, awans z rezerwy, rezygnacja, usunięcie.
create function public.notify_participation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_name text;
  v_old text := case when tg_op = 'UPDATE' then old.status end;
  v_actor uuid := auth.uid();
begin
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;
  select * into v_event from public.events where id = new.event_id;
  if not found or v_event.status <> 'active' or v_event.starts_at <= now() then
    return new;
  end if;
  select display_name into v_name from public.profiles where id = new.user_id;

  -- Dla organizatora: ktoś dołączył, zgłosił się albo zrezygnował (sam).
  if v_actor = new.user_id then
    if new.status = 'pending' then
      perform public.queue_notification(v_event.organizer_id, v_event.id, 'activity', 'request', jsonb_build_object('name', v_name));
    elsif new.status = 'accepted' then
      perform public.queue_notification(v_event.organizer_id, v_event.id, 'activity', 'joined', jsonb_build_object('name', v_name));
    elsif new.status = 'reserve' then
      perform public.queue_notification(v_event.organizer_id, v_event.id, 'activity', 'reserve', jsonb_build_object('name', v_name));
    elsif new.status = 'withdrawn' and v_old in ('accepted', 'reserve') then
      perform public.queue_notification(v_event.organizer_id, v_event.id, 'activity', 'withdrew', jsonb_build_object('name', v_name));
    end if;
    return new;
  end if;

  -- Dla uczestnika: zmiana wykonana przez kogoś innego (organizator, awans po cudzej rezygnacji).
  if new.status = 'accepted' and v_old = 'reserve' then
    perform public.queue_notification(new.user_id, v_event.id, 'status', 'promoted');
  elsif new.status = 'accepted' and v_old = 'pending' then
    perform public.queue_notification(new.user_id, v_event.id, 'status', 'accepted');
  elsif new.status = 'reserve' and v_old = 'pending' then
    perform public.queue_notification(new.user_id, v_event.id, 'status', 'accepted_reserve');
  elsif new.status = 'rejected' then
    perform public.queue_notification(new.user_id, v_event.id, 'status', 'rejected');
  elsif new.status = 'removed' then
    perform public.queue_notification(new.user_id, v_event.id, 'status', 'removed');
  end if;
  return new;
end;
$$;

create trigger participations_notify
  after insert or update of status on public.participations
  for each row execute function public.notify_participation_change();

-- Zmiany spotkania: odwołanie oraz nowy termin lub miejsce — dla wszystkich w składzie, na rezerwie i oczekujących.
create function public.notify_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_user uuid;
begin
  if old.status = 'active' and new.status in ('cancelled', 'organizer_left') then
    v_type := 'cancelled';
  elsif new.status = 'active' and (
    new.starts_at is distinct from old.starts_at
    or new.place is distinct from old.place
    or new.venue_id is distinct from old.venue_id
  ) then
    v_type := 'changed';
  else
    return new;
  end if;
  if new.starts_at <= now() then
    return new;
  end if;
  for v_user in
    select user_id from public.participations
    where event_id = new.id and status in ('accepted', 'reserve', 'pending')
  loop
    perform public.queue_notification(v_user, new.id, 'changes', v_type,
      jsonb_build_object('previous_starts_at', old.starts_at));
  end loop;
  return new;
end;
$$;

create trigger events_notify
  after update on public.events
  for each row execute function public.notify_event_change();

-- Nowa wiadomość na czacie: członkowie spotkania poza autorem (zbiorczo — patrz queue_notification).
create function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_user uuid;
begin
  select * into v_event from public.events where id = new.event_id;
  if not found then
    return new;
  end if;
  for v_user in
    select v_event.organizer_id
    union
    select user_id from public.participations where event_id = new.event_id and status in ('accepted', 'reserve')
  loop
    if v_user is distinct from new.author_id then
      perform public.queue_notification(v_user, new.event_id, 'chat', 'chat');
    end if;
  end loop;
  return new;
end;
$$;

create trigger event_messages_notify
  after insert on public.event_messages
  for each row execute function public.notify_chat_message();

-- Przypomnienia dzień przed: wołane przez zaplanowane zadanie serwera; każde spotkanie przypomina tylko raz.
alter table public.events add column reminded_at timestamptz;

create function public.queue_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_user uuid;
  v_count integer := 0;
begin
  for v_event in
    select * from public.events
    where status = 'active' and reminded_at is null
      and starts_at between now() + interval '20 hours' and now() + interval '28 hours'
    for update skip locked
  loop
    for v_user in
      select v_event.organizer_id where v_event.organizer_plays
      union
      select user_id from public.participations where event_id = v_event.id and status = 'accepted'
    loop
      -- auth.uid() jest pusty w zadaniu serwera, więc nikt nie jest pomijany jako „autor”.
      perform public.queue_notification(v_user, v_event.id, 'reminder', 'reminder');
      v_count := v_count + 1;
    end loop;
    update public.events set reminded_at = now() where id = v_event.id;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.queue_notification(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_participation_change() from public, anon, authenticated;
revoke execute on function public.notify_event_change() from public, anon, authenticated;
revoke execute on function public.notify_chat_message() from public, anon, authenticated;
-- Kolejkę przypomnień i wysyłkę obsługuje serwer kluczem serwisowym.
revoke execute on function public.queue_reminders() from public, anon, authenticated;
