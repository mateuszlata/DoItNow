-- Filtr wulgaryzmów: wiadomości czatu i nicki z wulgaryzmem lub obelgą nie przechodzą.
-- Lista słów jest w tabeli (dopisanie słowa to jedno polecenie SQL, bez wdrażania aplikacji). Tekst jest
-- najpierw ujednolicany: małe litery, bez polskich znaków, cyfry i znaki udające litery („kurw4”, „j3b”),
-- bez kropek i myślników w środku słowa („k.u.r.w.a”), z rozstrzelonymi literami złączonymi („k u r w a”)
-- i ze zredukowanymi powtórzeniami („kuuurwa”). Zablokowanych wiadomości nie zapisujemy.
-- Do tego wiadomość zgłoszona przez 3 różne osoby ukrywa się sama, do decyzji administratora.

create table public.blocked_words (
  pattern text primary key check (pattern ~ '^[a-z]+$'),
  -- contains: rdzeń w dowolnym miejscu słowa (odmiana, przedrostki); prefix: początek słowa;
  -- word: całe słowo (gdy rdzeń bywa częścią zwykłych słów)
  match text not null check (match in ('contains', 'prefix', 'word'))
);

-- Bez polityk: listę czytają tylko funkcje poniżej, a zmienia ją administrator w SQL.
alter table public.blocked_words enable row level security;

insert into public.blocked_words (pattern, match) values
  ('kurw', 'contains'), ('kurew', 'contains'), ('kurf', 'contains'),
  ('korwa', 'contains'), ('korwo', 'contains'), ('korwy', 'contains'),
  ('chuj', 'contains'), ('huj', 'contains'),
  ('pizd', 'contains'),
  ('jeb', 'contains'),
  ('pierdol', 'contains'), ('pierdal', 'contains'),
  ('kutas', 'contains'), ('fiut', 'contains'),
  ('dziwk', 'contains'),
  -- „ruchac” tylko jako całe słowo: rdzeń jest też w „ruchach”
  ('ruchac', 'word'), ('ruchan', 'contains'), ('ruchaj', 'contains'), ('ruchal', 'contains'),
  ('wyruch', 'contains'), ('poruch', 'contains'), ('zaruch', 'contains'),
  ('gowno', 'contains'), ('gowna', 'contains'), ('gownian', 'contains'), ('gowien', 'contains'),
  ('cipa', 'prefix'), ('cipy', 'prefix'), ('cipe', 'prefix'), ('cipo', 'prefix'), ('cipk', 'prefix'),
  ('cipi', 'prefix'),
  ('cwel', 'contains'), ('czarnuch', 'contains'),
  ('ciota', 'word'), ('cioto', 'word'), ('cioty', 'word'),
  ('suka', 'word'), ('suko', 'word'),
  ('fuck', 'contains'), ('bitch', 'contains'), ('nigg', 'contains'), ('fagot', 'contains'),
  ('whore', 'contains'), ('shit', 'prefix'), ('cunt', 'word');

-- Słowa tekstu po ujednoliceniu (opis na górze pliku).
create function public.normalized_words(p_text text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := lower(coalesce(p_text, ''));
  v_word text;
  v_run text := '';
  v_words text[] := '{}';
begin
  v_text := translate(v_text, 'ąćęłńóśźżäöü', 'acelnoszzaou');
  v_text := translate(v_text, '013457@$!|', 'oieastasii');
  -- kropki, myślniki itp. między literami: „k.u.r.w.a” → „kurwa”
  v_text := regexp_replace(v_text, '([a-z])[._~''"`-]+(?=[a-z])', '\1', 'g');
  foreach v_word in array regexp_split_to_array(v_text, '[^a-z]+') loop
    continue when v_word = '';
    v_word := regexp_replace(v_word, '(.)\1+', '\1', 'g');
    -- pojedyncze litery w ciągu łączymy („k u r w a”), od 3 liter, żeby nie sklejać „i”, „w”, „z”
    if char_length(v_word) = 1 then
      v_run := v_run || v_word;
      continue;
    end if;
    if char_length(v_run) >= 3 then
      v_words := v_words || regexp_replace(v_run, '(.)\1+', '\1', 'g');
    end if;
    v_run := '';
    v_words := v_words || v_word;
  end loop;
  if char_length(v_run) >= 3 then
    v_words := v_words || regexp_replace(v_run, '(.)\1+', '\1', 'g');
  end if;
  return v_words;
end;
$$;

-- Czy tekst przechodzi przez filtr. Dostępna także bez konta: formularz rejestracji sprawdza nick przed wysłaniem.
create function public.is_text_clean(p_text text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from unnest(public.normalized_words(p_text)) as w(word)
    join public.blocked_words b
      on (b.match = 'contains' and position(b.pattern in w.word) > 0)
      or (b.match = 'prefix' and starts_with(w.word, b.pattern))
      or (b.match = 'word' and w.word = b.pattern)
  );
$$;

-- Wiadomość czatu: jak dotąd, a do tego filtr wulgaryzmów (przed limitem, żeby odrzucone próby go nie zużywały).
create or replace function public.post_event_message(p_event_id uuid, p_body text)
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
  if not public.is_text_clean(v_body) then
    raise exception 'MESSAGE_BLOCKED';
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

-- Nicki: nowe i zmieniane muszą przejść przez filtr (istniejących nie ruszamy).
create function public.check_display_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.display_name is distinct from old.display_name)
     and not public.is_text_clean(new.display_name) then
    raise exception 'NICK_BLOCKED';
  end if;
  return new;
end;
$$;

create trigger profiles_check_display_name
  before insert or update of display_name on public.profiles
  for each row execute function public.check_display_name();

-- Rejestracja z pominięciem formularza: nick z wulgaryzmem zastępuje „Użytkownik” (rejestracja nie może się wyłożyć).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nick text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if char_length(nick) < 2 or not public.is_text_clean(nick) then
    nick := 'Użytkownik';
  end if;
  insert into public.profiles (id, display_name) values (new.id, left(nick, 30));
  return new;
end;
$$;

-- Automatyczne ukrycie po zgłoszeniach 3 różnych osób; administrator może je cofnąć („Zostaw”).
alter table public.event_messages add column auto_hidden boolean not null default false;

create or replace function public.report_event_message(p_message_id uuid, p_reason text default null)
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

  select * into v_message from public.event_messages where id = p_message_id for update;
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

  if v_message.hidden_at is null
     and (select count(*) from public.event_message_reports
          where message_id = p_message_id and resolved_at is null) >= 3 then
    update public.event_messages set hidden_at = now(), hidden_by = null, auto_hidden = true
    where id = p_message_id;
  end if;
end;
$$;

-- Ukrycie przez autora, organizatora albo administratora; ukrycie automatyczne staje się wtedy ostateczne.
create or replace function public.hide_event_message(p_message_id uuid)
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
  if v_message.hidden_at is not null and not v_message.auto_hidden then
    return;
  end if;

  update public.event_messages
  set hidden_at = coalesce(hidden_at, now()), hidden_by = v_uid, auto_hidden = false
  where id = p_message_id;
  update public.event_message_reports set resolved_at = now()
  where message_id = p_message_id and resolved_at is null;
end;
$$;

-- „Zostaw”: zgłoszenia zamknięte, a wiadomość ukryta automatycznie wraca do czatu.
create or replace function public.dismiss_message_reports(p_message_id uuid)
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
  update public.event_messages set hidden_at = null, hidden_by = null, auto_hidden = false
  where id = p_message_id and auto_hidden;
end;
$$;

-- Lista zgłoszeń z informacją, czy wiadomość już się ukryła sama.
drop function public.list_message_reports();

create function public.list_message_reports()
returns table (
  message_id uuid,
  event_id uuid,
  author_name text,
  body text,
  created_at timestamptz,
  report_count bigint,
  reasons text[],
  last_reported_at timestamptz,
  auto_hidden boolean
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
           count(r.*), array_remove(array_agg(r.reason), null), max(r.created_at), m.auto_hidden
    from public.event_message_reports r
    join public.event_messages m on m.id = r.message_id
    left join public.profiles pr on pr.id = m.author_id
    where r.resolved_at is null
    group by m.id, pr.display_name
    order by max(r.created_at) desc;
end;
$$;

revoke execute on function public.normalized_words(text) from public, anon, authenticated;
revoke execute on function public.check_display_name() from public, anon, authenticated;
revoke execute on function public.list_message_reports() from public, anon;
revoke execute on function public.is_text_clean(text) from public;
grant execute on function public.is_text_clean(text) to anon, authenticated;
grant execute on function public.list_message_reports() to authenticated;
