-- Restore the pre-step-3 simple report channel rule; no user rows are removed.
begin;
set local lock_timeout = '5s';
create or replace function private.testing_report_submit_for_account(
  p_account uuid,p_id uuid,p_channel text,p_title text,p_body text,p_consent boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted'; end if;
  if p_consent is distinct from true or p_id is null or p_channel not in ('nightly','testers','master') then
    raise exception 'testing_report_consent_required' using errcode='22023'; end if;
  insert into public.testing_contributions(id,account_id,channel,title,body)
    values(p_id,p_account,p_channel,p_title,p_body) on conflict(id) do nothing;
  if not exists(select 1 from public.testing_contributions where id=p_id and account_id=p_account
    and channel=p_channel and title=p_title and body=p_body) then
    raise exception 'testing_report_conflict' using errcode='23505'; end if;
  insert into public.testing_report_followup(contribution_id,consent) values(p_id,true)
    on conflict(contribution_id) do update set consent=true;
end $$;
commit;
