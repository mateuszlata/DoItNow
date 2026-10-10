-- Usunięcie własnego konta (RODO, prawo do usunięcia danych). Kasuje użytkownika w auth.users;
-- kaskada usuwa profil, zgłoszenia, ogłoszenia, obiekty i liczniki zapytań powiązane z kontem.
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
