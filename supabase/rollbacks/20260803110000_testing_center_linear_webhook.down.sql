-- ISA-240 / TAU-07F guarded rollback. Observational delivery history must not
-- be silently discarded.

begin;

lock table public.testing_center_pauses in share row exclusive mode;

do $$
begin
  if not exists (
    select 1 from public.testing_center_pauses
    where scope = 'global' and is_paused
  ) then
    raise exception 'testing_center_linear_webhook_rollback_requires_global_pause'
      using errcode = '55000';
  end if;
  if exists (select 1 from public.testing_center_linear_webhook_deliveries)
    or exists (select 1 from public.testing_center_linear_issue_bindings)
    or exists (select 1 from public.testing_center_linear_state_mappings) then
    raise exception 'testing_center_linear_webhook_rollback_has_history'
      using errcode = '55000';
  end if;
end $$;

drop function public.testing_center_reconcile_linear_webhook(
  uuid,uuid,uuid,uuid,text,text,bigint,timestamptz,uuid,text
);
drop function public.testing_center_upsert_linear_state_mapping(
  uuid,uuid,text,text,boolean
);
drop function public.testing_center_bind_linear_issue(text,uuid,uuid,text);

drop table public.testing_center_linear_webhook_deliveries;
drop table public.testing_center_linear_reconciliations;
drop table public.testing_center_linear_state_mappings;
drop table public.testing_center_linear_issue_bindings;

commit;
