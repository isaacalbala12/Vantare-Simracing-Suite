-- #1610 / VANTA-29. LOCAL review candidate, no activation/deployment.
-- Extends #1535 contributions. Intake/#1594 integration is a separate adapter.
begin;
set local lock_timeout = '5s';
-- Legacy text RPC has no consent parameter. It cannot remain a bypass.
revoke execute on function public.testing_contribution_submit(uuid,text,text,text) from authenticated,service_role;
alter table public.testing_contributions drop constraint testing_contributions_channel_check;
alter table public.testing_contributions add constraint testing_contributions_channel_check
  check(channel in ('nightly','testers','master'));
alter table public.testing_contributions drop constraint testing_contributions_state_check;
alter table public.testing_contributions add constraint testing_contributions_state_check
  check(state in ('received','reviewing','accepted','declined','spam','fixed'));
create table public.testing_report_followup (
  contribution_id uuid primary key references public.testing_contributions(id) on delete cascade,
  credit boolean not null default false,
  consent boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  notice_read_at timestamptz,
  fixed_version text check(fixed_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.-]+)?$' and length(fixed_version)<=60),
  reviewed_title text check(length(trim(reviewed_title)) between 1 and 120),
  reviewed_summary text check(length(trim(reviewed_summary)) between 1 and 200),
  check ((fixed_version is null) = (reviewed_title is null)),
  check ((fixed_version is null) = (reviewed_summary is null))
);
alter table public.testing_report_followup enable row level security;
alter table public.testing_report_followup force row level security;
revoke all on public.testing_report_followup from public,anon,authenticated;
grant select on public.testing_report_followup to authenticated;
create policy testing_report_followup_own on public.testing_report_followup for select to authenticated
  using(exists(select 1 from public.testing_contributions c where c.id=contribution_id and c.account_id=auth.uid()));
-- Existing accepted reports need an acknowledgeable durable record too.
insert into public.testing_report_followup(contribution_id) select id from public.testing_contributions;
drop policy testing_contributions_read on public.testing_contributions;
create policy testing_contributions_read on public.testing_contributions for select to authenticated
  using(account_id=auth.uid());

-- Applies also to legacy/v2 submission: direct clients cannot bypass quotas.
create function private.testing_report_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare t timestamptz:=clock_timestamp();
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'testing_report_read_committed_required' using errcode='25001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text,1610));
  if exists(select 1 from public.testing_contributions where id=new.id) then return new; end if;
  -- now() is the transaction start: an old transaction must not age new reports.
  t:=clock_timestamp();
  new.created_at:=t;
  if length(new.title)>120 or length(new.body)>1000
    or octet_length(new.title)>480 or octet_length(new.body)>4000 then
    raise exception 'testing_report_size' using errcode='22023'; end if;
  if (select count(*) from public.testing_contributions where account_id=new.account_id and created_at>t-interval '1 day')>=5
    or (select count(*) from public.testing_contributions where account_id=new.account_id and created_at>t-interval '7 days')>=20 then
    raise exception 'testing_report_rate_limit' using errcode='54000'; end if;
  return new;
end $$;
revoke all on function private.testing_report_limit() from public,anon,authenticated,service_role;
create trigger testing_report_limit before insert on public.testing_contributions
  for each row execute function private.testing_report_limit();
create function private.testing_report_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state is distinct from old.state then
    insert into public.testing_report_followup(contribution_id) values(new.id) on conflict do nothing;
    update public.testing_report_followup set updated_at=clock_timestamp() where contribution_id=new.id;
    if new.state='fixed' and not exists(select 1 from public.testing_report_followup where contribution_id=new.id and fixed_version is not null) then
      raise exception 'testing_report_fix_requires_review' using errcode='22023'; end if;
  end if;
  return new;
end $$;
revoke all on function private.testing_report_status() from public,anon,authenticated,service_role;
create trigger testing_report_status after update of state on public.testing_contributions
  for each row execute function private.testing_report_status();

-- #1602 counts accepted rows. A subsequent fix still consumes that human
-- acceptance; enforce the same UTC budgets at the shared state boundary.
create function private.testing_report_acceptance_limit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.state='accepted' and old.state is distinct from 'accepted' then
    if current_setting('transaction_isolation') <> 'read committed' then
      raise exception 'testing_review_read_committed_required' using errcode='25000'; end if;
    perform pg_advisory_xact_lock(hashtextextended(new.account_id::text,1594));
    if exists(select 1 from public.testing_contributions x
      where x.account_id=new.account_id and x.id<>new.id and x.state in ('accepted','fixed')
        and (x.created_at at time zone 'UTC')::date=(new.created_at at time zone 'UTC')::date)
      or (select count(*) from public.testing_contributions x
        where x.account_id=new.account_id and x.id<>new.id and x.state in ('accepted','fixed')
          and date_trunc('week',x.created_at at time zone 'UTC')=date_trunc('week',new.created_at at time zone 'UTC'))>=2 then
      raise exception 'testing_acceptance_limit' using errcode='23514'; end if;
  end if;
  return new;
end $$;
revoke all on function private.testing_report_acceptance_limit() from public,anon,authenticated,service_role;
create trigger testing_report_acceptance_limit before update of state on public.testing_contributions
  for each row execute function private.testing_report_acceptance_limit();

create function public.testing_report_submit(p_id uuid,p_channel text,p_title text,p_body text,p_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  if p_consent is distinct from true or p_id is null or p_channel not in ('nightly','testers','master') then
    raise exception 'testing_report_consent_required' using errcode='22023'; end if;
  insert into public.testing_contributions(id,account_id,channel,title,body)
    values(p_id,auth.uid(),p_channel,p_title,p_body) on conflict(id) do nothing;
  if not exists(select 1 from public.testing_contributions where id=p_id and account_id=auth.uid()
    and channel=p_channel and title=p_title and body=p_body) then
    raise exception 'testing_report_conflict' using errcode='23505'; end if;
  insert into public.testing_report_followup(contribution_id,consent) values(p_id,true)
    on conflict(contribution_id) do update set consent=true;
end $$;
create function public.testing_report_credit(p_id uuid,p_consent boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_consent is null or not exists(select 1 from public.testing_contributions
    where id=p_id and account_id=auth.uid()) then raise exception 'testing_report_denied' using errcode='42501'; end if;
  insert into public.testing_report_followup(contribution_id,credit) values(p_id,p_consent)
    on conflict(contribution_id) do update set credit=p_consent;
end $$;
create function public.testing_report_notice_read(p_id uuid,p_updated_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.testing_contributions
    where id=p_id and account_id=auth.uid()) then raise exception 'testing_report_denied' using errcode='42501'; end if;
  -- A delayed acknowledgement cannot hide a newer accepted/fixed transition.
  update public.testing_report_followup set notice_read_at=updated_at
    where contribution_id=p_id and updated_at=p_updated_at;
end $$;
create function public.testing_participation_current_v2(p_channel text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'questionnaires',case when public.testing_center_can_view_channel(p_channel)
      then public.testing_participation_current(p_channel)->'questionnaires' else '[]'::jsonb end,
    'contributions',coalesce((select jsonb_agg(to_jsonb(t)) from (
      select c.id,c.title,''::text as body,c.state,coalesce(f.credit,false) as credit,
        coalesce(f.updated_at,c.created_at) as updated_at,f.fixed_version,
        c.state in ('accepted','fixed') and (f.notice_read_at is null or f.notice_read_at<f.updated_at) as notice
      from public.testing_contributions c left join public.testing_report_followup f on f.contribution_id=c.id
      where c.account_id=auth.uid()
      order by c.created_at desc,c.id limit 20) t),'[]'::jsonb));
end $$;
-- Does not accept triage proposals and cannot accept an unreviewed report.
create function public.testing_report_fixed(p_id uuid,p_version text,p_reviewed_title text,p_reviewed_summary text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.testing_contributions%rowtype;
begin
  if auth.uid() is null or public.testing_center_current_role() is distinct from 'owner' then
    raise exception 'testing_owner_required' using errcode='42501'; end if;
  select * into c from public.testing_contributions where id=p_id for update;
  if not found or c.state not in ('accepted','fixed') then raise exception 'testing_report_not_accepted' using errcode='55000'; end if;
  if p_version is null or p_reviewed_title is null or p_reviewed_summary is null then
    raise exception 'testing_report_review_required' using errcode='22023'; end if;
  if c.state='fixed' then
    if not exists(select 1 from public.testing_report_followup where contribution_id=p_id and fixed_version=p_version
      and reviewed_title=p_reviewed_title and reviewed_summary=p_reviewed_summary) then
      raise exception 'testing_report_fix_conflict' using errcode='23505'; end if;
    return;
  end if;
  insert into public.testing_report_followup(contribution_id,fixed_version,reviewed_title,reviewed_summary)
    values(p_id,p_version,p_reviewed_title,p_reviewed_summary) on conflict(contribution_id) do update
    set fixed_version=p_version,reviewed_title=p_reviewed_title,reviewed_summary=p_reviewed_summary;
  update public.testing_contributions set state='fixed' where id=p_id;
end $$;
create function public.testing_report_patch_candidates(p_version text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.testing_center_current_role() is distinct from 'owner' then
    raise exception 'testing_owner_required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'summary',f.reviewed_summary,'credit',f.credit) order by c.id)
    from public.testing_contributions c join public.testing_report_followup f on f.contribution_id=c.id
    where c.state='fixed' and f.fixed_version=p_version),'[]'::jsonb);
end $$;
revoke all on function public.testing_report_submit(uuid,text,text,text,boolean),public.testing_report_credit(uuid,boolean),
  public.testing_report_notice_read(uuid,timestamptz),public.testing_participation_current_v2(text),
  public.testing_report_fixed(uuid,text,text,text),public.testing_report_patch_candidates(text) from public,anon,service_role;
grant execute on function public.testing_report_submit(uuid,text,text,text,boolean),public.testing_report_credit(uuid,boolean),
  public.testing_report_notice_read(uuid,timestamptz),public.testing_participation_current_v2(text),
  public.testing_report_fixed(uuid,text,text,text),public.testing_report_patch_candidates(text) to authenticated;
commit;
