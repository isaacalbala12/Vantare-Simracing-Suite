-- Pre-activation rollback only. Never discard consent, notices, credit or fixes.
begin;
set local lock_timeout='5s';
lock table public.testing_contributions,public.testing_report_followup in access exclusive mode;
do $$begin
 if exists(select 1 from public.testing_report_followup where activity or consent or credit
     or notice_read_at is not null or fixed_version is not null
     or reviewed_title is not null or reviewed_summary is not null)
   or exists(select 1 from public.testing_contributions where channel='master' or state='fixed') then
   raise exception 'testing_followup_rollback_requires_data_preservation' using errcode='55000';
 end if;
end$$;
drop trigger testing_report_limit on public.testing_contributions;
drop trigger testing_report_status on public.testing_contributions;
drop trigger testing_report_acceptance_limit on public.testing_contributions;
drop trigger testing_report_activity on public.testing_report_followup;
drop function private.testing_report_limit(),private.testing_report_status(),private.testing_report_acceptance_limit();
drop function private.testing_report_activity();
drop function public.testing_report_submit(uuid,text,text,text,boolean),public.testing_report_credit(uuid,boolean),
 public.testing_report_notice_read(uuid,timestamptz),public.testing_participation_current_v2(text),
 public.testing_report_fixed(uuid,text,text,text),public.testing_report_patch_candidates(text);
drop table public.testing_report_followup;
alter table public.testing_contributions drop constraint testing_contributions_channel_check;
alter table public.testing_contributions add constraint testing_contributions_channel_check check(channel in ('nightly','testers'));
-- Preserve #1602's spam state if that dependency is already present.
alter table public.testing_contributions drop constraint testing_contributions_state_check;
do $$begin
 if to_regclass('public.testing_contribution_reviews') is null then
   alter table public.testing_contributions add constraint testing_contributions_state_check check(state in ('received','reviewing','accepted','declined'));
 else
   alter table public.testing_contributions add constraint testing_contributions_state_check check(state in ('received','reviewing','accepted','declined','spam'));
 end if;
end$$;
drop policy testing_contributions_read on public.testing_contributions;
create policy testing_contributions_read on public.testing_contributions for select to authenticated
 using(account_id=auth.uid() and public.testing_center_can_view_channel(channel));
grant execute on function public.testing_contribution_submit(uuid,text,text,text) to authenticated;
commit;
