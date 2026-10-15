-- #1627 R4: una decisión de contribución es final; no hay reapertura implícita.
begin;
alter table public.testing_center_reports drop constraint testing_center_reports_state_check;
alter table public.testing_center_reports add constraint testing_center_reports_state_check
 check(state in ('draft','submitted','validated','duplicate_linked','incomplete','closed','in_review','rejected','fixed','spam'));

-- Restore already-recorded decisions, not new acceptances. Keep every other
-- trigger active; this transaction rolls back both repair and trigger state on error.
alter table public.testing_contributions disable trigger testing_report_acceptance_limit;
-- This audit restores historical decisions, including erased reviewers. The
-- table DDL lock excludes concurrent audit writers until commit. Suspend only
-- its account-write barrier, retaining append-only/RLS and restoring it below.
alter table public.admin_audit_log disable trigger a_account_write_barrier;
with candidates as materialized (
 select c.id,c.state old_state,r.decision,r.reviewer from public.testing_contributions c
 join public.testing_contribution_reviews r on r.contribution_id=c.id
 where c.state is distinct from r.decision and not (r.decision='accepted' and c.state='fixed')
), repaired as (
 update public.testing_contributions c set state=r.decision from candidates r where c.id=r.id
 returning c.id,r.old_state,r.decision,r.reviewer
)
-- Original reviewer identifies the durable decision being restored, not a new
-- human action. The repair marker distinguishes this migration in the audit.
insert into public.admin_audit_log(actor_account_id,action,target,before_value,after_value)
 select reviewer,'set_report_status',id::text,jsonb_build_object('status',old_state),
 jsonb_build_object('status',decision,'repair','native_admin_final_decision_r4') from repaired;
alter table public.admin_audit_log enable trigger a_account_write_barrier;
alter table public.testing_contributions enable trigger testing_report_acceptance_limit;

create or replace function private.testing_contribution_review_as(p_reviewer uuid,p_id uuid,p_decision text,p_note text,p_proposal jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.testing_contributions%rowtype; r public.testing_contribution_reviews%rowtype; t timestamptz;
begin
  if p_reviewer is null then raise exception 'testing_owner_required' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('accepted','declined','spam')
    or p_note is null or length(trim(p_note)) not between 1 and 1000
    or (p_proposal is not null and not private.testing_proposal_valid(p_proposal)) then
    raise exception 'testing_review_invalid' using errcode = '22023'; end if;
  if p_decision = 'accepted' and current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'testing_review_read_committed_required' using errcode = '25000'; end if;
  select * into c from public.testing_contributions where id = p_id for update;
  if not found then raise exception 'testing_contribution_missing' using errcode = 'P0002'; end if;
  select * into r from public.testing_contribution_reviews where contribution_id = p_id;
  if found then
    if r.reviewer = p_reviewer and r.decision = p_decision and r.note = p_note and r.proposal is not distinct from p_proposal and (c.state=p_decision or (p_decision='accepted' and c.state='fixed')) then return; end if;
    raise exception 'testing_review_conflict' using errcode = '23505'; end if;
  if c.state not in ('received','reviewing') then raise exception 'testing_review_conflict' using errcode = '23505'; end if;
  -- Serializes acceptance for different contributions of one account.
  perform pg_advisory_xact_lock(hashtextextended(c.account_id::text,1594));
  t := c.created_at;
  if p_decision = 'accepted' and (
    exists(select 1 from public.testing_contributions x where x.account_id = c.account_id and (x.state in ('accepted','fixed') or exists(select 1 from public.testing_contribution_reviews quota_review where quota_review.contribution_id=x.id and quota_review.decision='accepted'))
      and (x.created_at at time zone 'UTC')::date = (t at time zone 'UTC')::date)
    or (select count(*) from public.testing_contributions x where x.account_id = c.account_id and (x.state in ('accepted','fixed') or exists(select 1 from public.testing_contribution_reviews quota_review where quota_review.contribution_id=x.id and quota_review.decision='accepted'))
      and date_trunc('week',x.created_at at time zone 'UTC') = date_trunc('week',t at time zone 'UTC')) >= 2) then
    raise exception 'testing_acceptance_limit' using errcode = '23514'; end if;
  insert into public.testing_contribution_reviews(contribution_id,reviewer,decision,note,model_verdict,model_confidence,proposal,model)
    values(p_id,p_reviewer,p_decision,p_note,p_proposal->>'verdict',(p_proposal->>'confidence')::double precision,p_proposal,case when p_proposal is null then 'human' else 'opencode-go/deepseek-v4.1-flash' end);
  update public.testing_contributions set state = p_decision where id = p_id;
end $$;

create or replace function private.native_admin_review_report(p_actor uuid,p_id uuid,p_status text,p_version text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.testing_contributions%rowtype;
begin
 perform private.native_admin_require_owner(p_actor);
 select * into c from public.testing_contributions where id=p_id for update;
 if not found then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
 if p_status in ('validated','rejected','spam','closed','duplicate_linked','incomplete') then
  perform private.testing_contribution_review_as(p_actor,p_id,case p_status when 'validated' then 'accepted' when 'spam' then 'spam' else 'declined' end,p_note,null);
 elsif p_status='fixed' then
  if c.state not in ('accepted','fixed') then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
  insert into public.testing_report_followup(contribution_id,fixed_version,reviewed_title,reviewed_summary)
   values(p_id,p_version,c.title,left(c.title,200)) on conflict(contribution_id) do update
    set fixed_version=excluded.fixed_version,reviewed_title=excluded.reviewed_title,reviewed_summary=excluded.reviewed_summary;
  update public.testing_contributions set state='fixed' where id=p_id;
 elsif p_status in ('submitted','in_review') then
  if c.state not in ('received','reviewing') or exists(select 1 from public.testing_contribution_reviews where contribution_id=p_id) then
   raise exception 'testing_review_conflict' using errcode='23505'; end if;
  update public.testing_contributions set state=case p_status when 'submitted' then 'received' else 'reviewing' end where id=p_id;
 else raise exception 'native_admin_invalid' using errcode='22023'; end if;
 insert into public.testing_report_followup(contribution_id,reject_reason) values(p_id,case when p_status in ('rejected','spam') then p_note else null end)
  on conflict(contribution_id) do update set reject_reason=excluded.reject_reason;
end $$;
-- Historical report decisions are final too (enforced by the admin dispatcher).
commit;
