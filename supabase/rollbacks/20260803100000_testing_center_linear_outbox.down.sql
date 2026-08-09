-- ISA-239 / TAU-07E guarded rollback. It is intentionally unavailable once a
-- Linear dry-run, ambiguity or post-cutover issue exists.

begin;

lock table public.testing_center_pauses in share row exclusive mode;
lock table public.testing_center_effect_outbox in access exclusive mode;

do $$
begin
  if not exists (
    select 1 from public.testing_center_pauses
    where scope = 'global' and is_paused
  ) then
    raise exception 'testing_center_linear_rollback_requires_global_pause'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_effect_outbox
    where effect_type = 'linear_issue_create'
      and state in ('claimed', 'completed', 'dry_run_completed', 'needs_owner')
  ) then
    raise exception 'testing_center_linear_rollback_irreversible_state'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.testing_center_effect_outbox as linear
    where linear.effect_type = 'linear_issue_create'
      and not exists (
        select 1 from public.testing_center_effect_supersessions as supersession
        where supersession.superseded_by_effect_id = linear.effect_id
      )
  ) then
    raise exception 'testing_center_linear_rollback_post_cutover_effect'
      using errcode = '55000';
  end if;
end
$$;

drop trigger if exists testing_center_effect_outbox_selected_destination
  on public.testing_center_effect_outbox;
drop trigger if exists testing_center_issue_destinations_validate
  on public.testing_center_issue_destinations;

update public.testing_center_effect_outbox as legacy
set state = supersession.prior_state,
  attempt_count = supersession.prior_attempt_count,
  last_error_code = supersession.prior_last_error_code,
  next_attempt_at = supersession.prior_next_attempt_at,
  lease_token = supersession.prior_lease_token,
  lease_expires_at = supersession.prior_lease_expires_at,
  lease_owner = null,
  updated_at = supersession.prior_updated_at
from public.testing_center_effect_supersessions as supersession
where legacy.effect_id = supersession.legacy_effect_id;

drop table public.testing_center_issue_destinations;
drop table public.testing_center_linear_projection_snapshots;
drop table public.testing_center_effect_supersessions;

delete from public.testing_center_effect_outbox
where effect_type = 'linear_issue_create';

drop function public.testing_center_record_linear_ambiguity(text,text,bigint);
drop function public.testing_center_fail_linear_effect(text,text,bigint,text);
drop function public.testing_center_complete_linear_dry_run(text,text,bigint,text,jsonb,text,text);
drop function public.testing_center_claim_linear_effect(text,text,integer);
drop function public.testing_center_prepare_linear_projection(text);
drop function public.testing_center_enforce_selected_effect();
drop function public.testing_center_validate_issue_destination();

drop table public.testing_center_build_identities;

alter table public.testing_center_effect_outbox
  drop constraint testing_center_effect_outbox_issue_type_key,
  drop constraint testing_center_effect_outbox_lease_owner_check,
  drop constraint testing_center_effect_outbox_fencing_check,
  drop constraint testing_center_effect_outbox_key_check,
  drop constraint testing_center_effect_outbox_type_check,
  drop constraint testing_center_effect_outbox_state_check,
  drop column lease_owner,
  drop column fencing_token,
  add constraint testing_center_effect_outbox_key_check check (
    effect_key ~ '^github_issue_create:[a-z0-9_]{1,255}$'
  ),
  add constraint testing_center_effect_outbox_type_check check (
    effect_type = 'github_issue_create'
  ),
  add constraint testing_center_effect_outbox_state_check check (
    state in ('pending', 'claimed', 'completed', 'failed')
  ),
  add constraint testing_center_effect_outbox_technical_issue_id_key
    unique (technical_issue_id),
  add constraint testing_center_effect_outbox_primary_report_id_key
    unique (primary_report_id);

grant select, insert, update, delete on table public.testing_center_effect_outbox
to service_role;

do $$
declare
  v_definition text;
begin
  select metadata_value into strict v_definition
  from public.testing_center_linear_migration_metadata
  where metadata_key = 'legacy_triage_function';
  execute v_definition;
end
$$;

grant execute on function public.testing_center_triage_report(text) to service_role;
grant execute on function public.testing_center_claim_github_effect(text,uuid,integer)
  to service_role;
grant execute on function public.testing_center_assert_github_effect_unpaused(text,uuid)
  to service_role;
grant execute on function public.testing_center_complete_github_effect(text,uuid,bigint,text)
  to service_role;
grant execute on function public.testing_center_fail_github_effect(text,uuid,text)
  to service_role;
grant execute on function public.testing_center_reconcile_github_effect(text,bigint,text)
  to service_role;

comment on function public.testing_center_triage_report(text) is
  'TAU-05A server-only completeness, exact-compatible dedupe and GitHub issue-create reservation.';

drop table public.testing_center_linear_migration_metadata;

commit;
