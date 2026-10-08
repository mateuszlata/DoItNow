-- Lista rezerwowa jest widoczna dla zalogowanych tak jak skład (nicki w okienkach składu, FR-006);
-- oczekujące i pozostałe zgłoszenia nadal widzi tylko ich autor i organizator.
drop policy "participations_select_visible" on public.participations;

create policy "participations_select_visible"
  on public.participations for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or status in ('accepted', 'reserve')
    or exists (
      select 1 from public.events e
      where e.id = participations.event_id and e.organizer_id = (select auth.uid())
    )
  );
