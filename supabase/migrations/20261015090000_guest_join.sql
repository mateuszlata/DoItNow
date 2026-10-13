-- Dołączanie bez konta prosto ze strony spotkania (link „Udostępnij”, nie tylko osobiste zaproszenie).
-- Gość podaje imię i odpowiada „Będę” — zajmuje jedno wolne miejsce jako gość organizatora (ta sama pula
-- co zaproszenia organizatora). Rozpoznajemy go po identyfikatorze urządzenia (w bazie tylko skrót), więc
-- może zmienić zdanie. Po „Będę” widzi spotkanie jak członek składu (miejsce, skład), a czat tylko czyta —
-- pisanie wymaga konta. Spotkania z akceptacją organizatora wymagają konta.

-- Odpowiedź gościa (po urządzeniu) w spotkaniu; null, gdy brak.
create function public.guest_response(p_event_id uuid, p_device text)
returns public.invite_responses
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.invite_responses
  where event_id = p_event_id
    and p_device is not null and char_length(p_device) between 16 and 100
    and device_hash = encode(extensions.digest(p_device, 'sha256'), 'hex');
$$;

create function public.join_event_as_guest(p_event_id uuid, p_device text, p_name text, p_answer text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_name text := btrim(coalesce(p_name, ''));
  v_previous public.invite_responses;
  v_token text;
  v_total integer;
begin
  if p_answer not in ('yes', 'no') then
    raise exception 'INVALID_ANSWER';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_device is null or char_length(p_device) not between 16 and 100 then
    raise exception 'INVALID_DEVICE';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.status <> 'active' or v_event.starts_at <= now() then
    raise exception 'EVENT_CLOSED';
  end if;

  v_previous := public.guest_response(p_event_id, p_device);
  -- Już odpowiadał (z czyjegoś linku albo stąd) — zmiana odpowiedzi przez pulę tej samej osoby zapraszającej.
  if v_previous.id is not null and v_previous.inviter_id is not null then
    select token into v_token from public.guest_invites
    where event_id = p_event_id and inviter_id = v_previous.inviter_id;
    if v_token is not null then
      return public.respond_to_invite(v_token, p_device, v_name, p_answer);
    end if;
  end if;

  if v_event.requires_approval then
    raise exception 'APPROVAL_REQUIRED';
  end if;
  -- „Nie będę” bez wcześniejszego „Będę” niczego nie zmienia.
  if p_answer = 'no' and v_previous.answer is distinct from 'yes' then
    return 'no';
  end if;
  if v_previous.id is not null then
    -- Pula zapraszającego zniknęła (usunięte konto) — aktualizujemy samą odpowiedź.
    update public.invite_responses set name = v_name, answer = p_answer, updated_at = now() where id = v_previous.id;
    perform public.refresh_guest_confirmed(p_event_id);
    return p_answer;
  end if;

  select count(*) into v_total from public.invite_responses where event_id = p_event_id;
  if v_total >= 60 then
    raise exception 'INVITE_LIMIT';
  end if;
  -- Ostatnie wolne miejsce zostaje dla graczy z kontem (zawsze co najmniej jedno miejsce w Metando).
  if v_event.spots - public.accepted_count(v_event) < 1 or v_event.spots <= 1 then
    raise exception 'GUEST_FULL';
  end if;

  insert into public.guest_invites (event_id, inviter_id, token, reserved)
  values (p_event_id, v_event.organizer_id, encode(extensions.gen_random_bytes(24), 'hex'), 0)
  on conflict (event_id, inviter_id) do nothing;
  perform public.shift_guest_seats(p_event_id, v_event.organizer_id, 1);
  insert into public.invite_responses (event_id, inviter_id, name, answer, device_hash)
  values (p_event_id, v_event.organizer_id, v_name, 'yes', encode(extensions.digest(p_device, 'sha256'), 'hex'));
  perform public.refresh_guest_confirmed(p_event_id);
  return 'yes';
end;
$$;

-- Spotkanie oczami gościa, który odpowiedział „Będę”: wydarzenie, organizator, skład, rezerwa i pule gości.
-- Dla innych urządzeń zwraca null (przypadkowy odwiedzający widzi tylko publiczny widok).
create function public.guest_event_view(p_event_id uuid, p_device text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_response public.invite_responses;
  v_event public.events;
begin
  v_response := public.guest_response(p_event_id, p_device);
  if v_response.id is null or v_response.answer <> 'yes' then
    return null;
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'event', to_jsonb(v_event),
    'me', jsonb_build_object('name', v_response.name, 'inviter_id', v_response.inviter_id),
    'organizer', (
      select jsonb_build_object(
        'display_name', pr.display_name, 'kit_pattern', pr.kit_pattern, 'kit_primary', pr.kit_primary,
        'kit_secondary', pr.kit_secondary, 'kit_label', pr.kit_label
      )
      from public.profiles pr where pr.id = v_event.organizer_id
    ),
    'participations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'user_id', p.user_id, 'status', p.status, 'stay_confirmed', p.stay_confirmed,
        'profile', jsonb_build_object(
          'display_name', pr.display_name, 'kit_pattern', pr.kit_pattern, 'kit_primary', pr.kit_primary,
          'kit_secondary', pr.kit_secondary, 'kit_label', pr.kit_label
        )
      ) order by p.updated_at, p.id)
      from public.participations p
      left join public.profiles pr on pr.id = p.user_id
      where p.event_id = p_event_id and p.status in ('accepted', 'reserve')
    ), '[]'::jsonb),
    'guest_groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'inviter_id', g.inviter_id,
        'inviter_name', coalesce(pr.display_name, 'Usunięte konto'),
        'reserved', g.reserved,
        'confirmed', coalesce(
          (select to_jsonb(array_agg(r.name order by r.created_at)) from public.invite_responses r
           where r.event_id = p_event_id and r.inviter_id = g.inviter_id and r.answer = 'yes'),
          '[]'::jsonb
        ),
        'in_squad', (
          (v_event.organizer_id = g.inviter_id and v_event.organizer_plays)
          or exists (select 1 from public.participations pa
                     where pa.event_id = p_event_id and pa.user_id = g.inviter_id and pa.status = 'accepted')
        )
      ) order by g.created_at)
      from public.guest_invites g
      left join public.profiles pr on pr.id = g.inviter_id
      where g.event_id = p_event_id and g.reserved > 0
    ), '[]'::jsonb)
  );
end;
$$;

-- Czat spotkania do czytania dla gościa z „Będę” (pisanie wymaga konta).
create function public.guest_event_messages(p_event_id uuid, p_device text, p_after timestamptz default null)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  body text,
  created_at timestamptz,
  hidden boolean,
  kit_pattern text,
  kit_primary text,
  kit_secondary text,
  kit_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_response public.invite_responses;
begin
  v_response := public.guest_response(p_event_id, p_device);
  if v_response.id is null or v_response.answer <> 'yes' then
    raise exception 'NOT_MEMBER';
  end if;

  return query
    select m.id, m.author_id, coalesce(pr.display_name, 'Usunięte konto'),
           case when m.hidden_at is null then m.body end,
           m.created_at, m.hidden_at is not null,
           pr.kit_pattern, pr.kit_primary, pr.kit_secondary, pr.kit_label
    from public.event_messages m
    left join public.profiles pr on pr.id = m.author_id
    where m.event_id = p_event_id
      and (p_after is null or m.created_at > p_after or m.hidden_at > p_after)
    order by m.created_at
    limit 500;
end;
$$;

revoke execute on function public.guest_response(uuid, text) from public, anon, authenticated;
revoke execute on function public.join_event_as_guest(uuid, text, text, text) from public;
revoke execute on function public.guest_event_view(uuid, text) from public;
revoke execute on function public.guest_event_messages(uuid, text, timestamptz) from public;
-- Goście nie mają kont: dostęp chroni losowy identyfikator urządzenia (httpOnly) i Turnstile przy odpowiedzi.
grant execute on function public.join_event_as_guest(uuid, text, text, text) to anon, authenticated;
grant execute on function public.guest_event_view(uuid, text) to anon, authenticated;
grant execute on function public.guest_event_messages(uuid, text, timestamptz) to anon, authenticated;
