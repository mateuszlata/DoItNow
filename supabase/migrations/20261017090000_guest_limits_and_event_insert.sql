-- Ochrona przed zalewaniem składów fałszywymi gośćmi, niezależna od Turnstile (który działa tylko w naszym API):
-- najwyżej 30 nowych odpowiedzi gości na spotkanie i 200 w całym serwisie na godzinę. Dotyczy każdej drogi
-- zapisu (zaproszenie osobiste, dołączenie ze strony spotkania); zmiana własnej odpowiedzi nie jest liczona.
-- Do tego nowe spotkania zawsze startują od czystego stanu: bez gości, aktywne, bez przekazania organizacji —
-- nawet gdy ktoś wstawi wiersz bezpośrednio przez API bazy z pominięciem formularza.

create index invite_responses_created_idx on public.invite_responses (created_at);

create function public.limit_guest_responses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ta sama osoba (urządzenie) zmienia odpowiedź — nie jest nową odpowiedzią.
  if exists (
    select 1 from public.invite_responses
    where event_id = new.event_id and device_hash = new.device_hash
  ) then
    return new;
  end if;
  if (select count(*) from public.invite_responses
      where event_id = new.event_id and created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.invite_responses
         where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'GUEST_RATE_LIMIT';
  end if;
  return new;
end;
$$;

create trigger invite_responses_limit
  before insert on public.invite_responses
  for each row execute function public.limit_guest_responses();

create function public.clean_new_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'active';
  new.guest_count := 0;
  new.guest_confirmed := 0;
  new.handover_at := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger events_clean_new
  before insert on public.events
  for each row execute function public.clean_new_event();

revoke execute on function public.limit_guest_responses() from public, anon, authenticated;
revoke execute on function public.clean_new_event() from public, anon, authenticated;
