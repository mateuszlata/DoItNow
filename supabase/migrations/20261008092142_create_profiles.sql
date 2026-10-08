-- Profile użytkowników z nickiem (FR-006). Inni użytkownicy widzą tylko nick, nigdy e-mail.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Nicki widzą tylko zalogowani użytkownicy.
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Każdy zmienia wyłącznie własny profil.
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Brak polityki insert: profil tworzy wyłącznie poniższy trigger.

-- Tworzy profil przy rejestracji z nicku przekazanego w metadanych konta.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nick text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if char_length(nick) < 2 then
    nick := 'Użytkownik';
  end if;
  insert into public.profiles (id, display_name) values (new.id, left(nick, 30));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Konta założone przed tą migracją dostają nick zastępczy.
insert into public.profiles (id, display_name)
select id, 'Użytkownik' from auth.users
on conflict (id) do nothing;

-- Pozwala pobrać nick organizatora razem z ogłoszeniem.
alter table public.events
  add constraint events_organizer_profile_fkey
  foreign key (organizer_id) references public.profiles (id) on delete cascade;
