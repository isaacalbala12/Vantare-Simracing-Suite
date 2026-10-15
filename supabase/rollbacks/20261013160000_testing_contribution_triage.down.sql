-- #1594 PRE-ACTIVATION ONLY. Reviewed recovery/forward fix once any new data exists.
-- Stop consumers and unregister any cron job BEFORE rollback. Never CASCADE.
begin;
set local lock_timeout = '5s';
lock table public.testing_contributions, public.testing_contribution_context,
  public.testing_contribution_attachments, public.testing_contribution_reviews in access exclusive mode;
do $$
begin
  if exists(select 1 from public.testing_contribution_context)
    or exists(select 1 from public.testing_contribution_attachments)
    or exists(select 1 from public.testing_contribution_reviews)
    or exists(select 1 from public.testing_contributions where state='spam') then
    raise exception 'triage_rollback_requires_data_preservation';
  end if;
end $$;
drop function public.testing_contribution_submit_v2(uuid,text,text,text,jsonb,jsonb);
drop function public.testing_contribution_review(uuid,text,text,jsonb);
drop function private.testing_contribution_purge_evidence();
drop policy testing_contributions_owner on public.testing_contributions;
drop policy triage_read on public.testing_contributions;
revoke select (id,channel,title,body,state,created_at) on public.testing_contributions from vantare_triage;
drop table public.testing_contribution_reviews;
drop table public.testing_contribution_attachments;
drop table public.testing_contribution_context;
drop function private.testing_proposal_valid(jsonb);
drop function private.testing_telemetry_valid(jsonb);
drop function private.testing_system_valid(jsonb);
drop index public.testing_contributions_triage_queue;
alter table public.testing_contributions drop constraint testing_contributions_state_check;
alter table public.testing_contributions add constraint testing_contributions_state_check
  check (state in ('received','reviewing','accepted','declined'));
revoke usage on schema public from vantare_triage;
drop role vantare_triage;
commit;
