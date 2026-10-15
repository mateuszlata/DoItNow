-- Pytania do organizatora: zalogowany użytkownik (także spoza składu) pyta, organizator odpowiada,
-- a pytania z odpowiedzią widzi każdy przy spotkaniu (także bez konta) — bez nicku pytającego.
-- Pytania bez odpowiedzi widzą tylko organizator i autor. Tabela nie ma polityk; wszystko idzie przez funkcje.

create table public.event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 3 and 500),
  created_at timestamptz not null default now(),
  answer text check (char_length(answer) between 1 and 1000),
  answered_at timestamptz,
  -- ukryte przez organizatora, autora albo administratora — znika dla wszystkich
  hidden_at timestamptz
);

create index event_questions_event_idx on public.event_questions (event_id, created_at);
create index event_questions_author_idx on public.event_questions (author_id, created_at);

alter table public.event_questions enable row level security;

-- Pytanie: nie organizator, spotkanie aktywne i nadchodzące; filtr wulgaryzmów i limity przeciw zalewaniu.
create function public.ask_event_question(p_event_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.organizer_id = v_uid then
    raise exception 'OWN_EVENT';
  end if;
  if v_event.status <> 'active' or v_event.starts_at <= now() then
    raise exception 'EVENT_CLOSED';
  end if;
  if char_length(v_body) < 3 then
    raise exception 'QUESTION_TOO_SHORT';
  end if;
  if char_length(v_body) > 500 then
    raise exception 'QUESTION_TOO_LONG';
  end if;
  if not public.is_text_clean(v_body) then
    raise exception 'MESSAGE_BLOCKED';
  end if;
  -- Najwyżej 3 pytania na godzinę do jednego spotkania i 20 na dobę w całym serwisie od jednej osoby.
  if (select count(*) from public.event_questions
      where author_id = v_uid and event_id = p_event_id and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.event_questions
         where author_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.event_questions (event_id, author_id, body)
  values (p_event_id, v_uid, v_body)
  returning id into v_id;
  perform public.queue_notification(v_event.organizer_id, p_event_id, 'activity', 'question',
    jsonb_build_object('question', left(v_body, 200)));
  return v_id;
end;
$$;

-- Odpowiedź (albo jej poprawka) — tylko organizator; pytający dostaje powiadomienie przy pierwszej odpowiedzi.
create function public.answer_event_question(p_question_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_question public.event_questions;
  v_answer text := btrim(coalesce(p_answer, ''));
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_question from public.event_questions where id = p_question_id for update;
  if not found or v_question.hidden_at is not null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;
  if not exists (select 1 from public.events where id = v_question.event_id and organizer_id = v_uid) then
    raise exception 'NOT_ORGANIZER';
  end if;
  if char_length(v_answer) = 0 then
    raise exception 'ANSWER_EMPTY';
  end if;
  if char_length(v_answer) > 1000 then
    raise exception 'ANSWER_TOO_LONG';
  end if;
  if not public.is_text_clean(v_answer) then
    raise exception 'MESSAGE_BLOCKED';
  end if;
  update public.event_questions
  set answer = v_answer, answered_at = coalesce(answered_at, now())
  where id = p_question_id;
  if v_question.answered_at is null then
    perform public.queue_notification(v_question.author_id, v_question.event_id, 'status', 'answered',
      jsonb_build_object('question', left(v_question.body, 200)));
  end if;
end;
$$;

-- Ukrycie pytania: organizator spotkania, autor albo administrator.
create function public.hide_event_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_question public.event_questions;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into v_question from public.event_questions where id = p_question_id for update;
  if not found then
    raise exception 'QUESTION_NOT_FOUND';
  end if;
  if v_question.author_id <> v_uid
     and not exists (select 1 from public.events where id = v_question.event_id and organizer_id = v_uid)
     and not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.event_questions set hidden_at = coalesce(hidden_at, now()) where id = p_question_id;
end;
$$;

-- Pytania przy spotkaniu: odpowiedziane widzi każdy; bez odpowiedzi — organizator (wszystkie) i autor (swoje).
create function public.list_event_questions(p_event_id uuid)
returns table (
  id uuid,
  body text,
  answer text,
  created_at timestamptz,
  answered_at timestamptz,
  mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.body, q.answer, q.created_at, q.answered_at, q.author_id = auth.uid()
  from public.event_questions q
  join public.events e on e.id = q.event_id
  where q.event_id = p_event_id
    and q.hidden_at is null
    and (q.answered_at is not null or q.author_id = auth.uid() or e.organizer_id = auth.uid())
  order by q.answered_at is null desc, coalesce(q.answered_at, q.created_at) desc
  limit 100;
$$;

revoke execute on function public.ask_event_question(uuid, text) from public, anon;
revoke execute on function public.answer_event_question(uuid, text) from public, anon;
revoke execute on function public.hide_event_question(uuid) from public, anon;
revoke execute on function public.list_event_questions(uuid) from public;
grant execute on function public.ask_event_question(uuid, text) to authenticated;
grant execute on function public.answer_event_question(uuid, text) to authenticated;
grant execute on function public.hide_event_question(uuid) to authenticated;
grant execute on function public.list_event_questions(uuid) to anon, authenticated;
