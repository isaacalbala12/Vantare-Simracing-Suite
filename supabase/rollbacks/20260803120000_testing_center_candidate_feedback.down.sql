-- ISA-241 / TAU-07G guarded rollback. New votes, dossiers and owner decisions
-- are durable history and cannot be discarded silently.

begin;

lock table public.testing_center_pauses in share row exclusive mode;

do $$
begin
  if not exists (
    select 1 from public.testing_center_pauses
    where scope='global' and is_paused
  ) then
    raise exception 'testing_center_feedback_rollback_requires_global_pause'
      using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_validation_snapshots)
    or exists(select 1 from public.testing_center_codex_dossier_snapshots)
    or exists(select 1 from public.testing_center_owner_dispositions) then
    raise exception 'testing_center_feedback_rollback_has_history'
      using errcode='55000';
  end if;
end $$;

drop function public.testing_center_record_owner_disposition(
  text,text,text,text,text,text,text,uuid
);
drop function public.testing_center_record_codex_dossier(text,jsonb,text,text,text,text);
drop function public.testing_center_record_validation_projection(jsonb,text,text,text,text,uuid);

drop table public.testing_center_owner_dispositions;
drop table public.testing_center_codex_dossier_snapshots;
drop table public.testing_center_validation_snapshots;

alter table public.testing_center_validations
  drop constraint testing_center_validations_decision_check,
  drop constraint testing_center_validations_reason_check,
  add constraint testing_center_validations_decision_check check (
    decision in ('accepted','rejected')
  ),
  add constraint testing_center_validations_reason_check check (
    (decision='accepted' and rejection_reason is null)
    or (decision='rejected' and rejection_reason in (
      'still_fails','regression','incomplete_fix','new_failure','other'
    ))
  );

grant execute on function public.testing_center_validate_candidate(
  text,text,text,text,text,text
) to authenticated;

commit;
