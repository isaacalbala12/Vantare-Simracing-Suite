-- VANTA-131 7a: one new write contract; the old report tables remain for admin history.
begin;
set local lock_timeout = '5s';

create table private.testing_report_v2_keys (
  account_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null check (idempotency_key ~ '^draft_[0-9a-f]{64}$'),
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  report_id uuid not null unique references public.testing_contributions(id) on delete cascade,
  primary key (account_id,idempotency_key)
);
alter table private.testing_report_v2_keys enable row level security;
alter table private.testing_report_v2_keys force row level security;
revoke all on private.testing_report_v2_keys from public,anon,authenticated,service_role;

alter table public.testing_report_followup add column report_metadata jsonb
  check (report_metadata is null or (jsonb_typeof(report_metadata)='object'
    and pg_column_size(report_metadata)<=4096));

create function private.testing_report_v2_submit(p_account uuid,p_report jsonb)
returns table(report_id uuid,report_state text,idempotent boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare
  v_id uuid;
  v_key text;
  v_variant text;
  v_digest text;
  v_existing private.testing_report_v2_keys%rowtype;
  v_fields text[] := array['contract_version','report_id','channel','title','body','consent','idempotency_key','variant'];
begin
  if p_account is null or jsonb_typeof(p_report) is distinct from 'object'
    or pg_column_size(p_report)>65536 then
    raise exception 'testing_report_v2_invalid' using errcode='22023'; end if;
  v_variant := p_report->>'variant';
  if v_variant='triage' then
    v_fields := v_fields||array['context','attachments'];
  elsif v_variant='diagnostic' then
    v_fields := v_fields||array['context'];
  elsif v_variant is distinct from 'simple' then
    raise exception 'testing_report_v2_invalid' using errcode='22023'; end if;
  if p_report->>'contract_version' is distinct from 'testing.report.v2'
    or not p_report ?& v_fields or p_report - v_fields <> '{}'::jsonb
    or (p_report->>'report_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_report->>'channel' not in ('nightly','testers','master')
    or p_report->'consent' is distinct from 'true'::jsonb
    or length(trim(p_report->>'title')) not between 1 and 120
    or length(trim(p_report->>'body')) not between 1 and 1000
    or (p_report->>'idempotency_key') !~ '^draft_[0-9a-f]{64}$'
    or (v_variant='diagnostic' and jsonb_typeof(p_report->'context') is distinct from 'object')
    or (v_variant='triage' and (jsonb_typeof(p_report->'context') is distinct from 'object'
      or jsonb_typeof(p_report->'attachments') is distinct from 'array')) then
    raise exception 'testing_report_v2_invalid' using errcode='22023'; end if;
  v_id := (p_report->>'report_id')::uuid;
  v_key := p_report->>'idempotency_key';
  v_digest := encode(public.digest(convert_to(p_report::text,'UTF8'),'sha256'),'hex');
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text||':'||v_key,0));
  select * into v_existing from private.testing_report_v2_keys
    where account_id=p_account and idempotency_key=v_key for update;
  if found then
    if v_existing.payload_digest<>v_digest or v_existing.report_id<>v_id then
      raise exception 'testing_report_v2_conflict' using errcode='23505'; end if;
    return query select c.id,c.state,true,c.created_at from public.testing_contributions c
      where c.id=v_id and c.account_id=p_account;
    if not found then raise exception 'testing_report_v2_missing' using errcode='23505'; end if;
    return;
  end if;
  if v_variant='triage' then
    perform private.testing_contribution_submit_v2_for_account(
      p_account,v_id,p_report->>'channel',p_report->>'title',p_report->>'body',
      p_report->'context',p_report->'attachments');
  end if;
  perform private.testing_report_submit_for_account(
    p_account,v_id,p_report->>'channel',p_report->>'title',p_report->>'body',true);
  if v_variant='diagnostic' then
    update public.testing_report_followup set report_metadata=p_report->'context'
      where contribution_id=v_id;
  end if;
  insert into private.testing_report_v2_keys(account_id,idempotency_key,payload_digest,report_id)
    values(p_account,v_key,v_digest,v_id);
  return query select c.id,c.state,false,c.created_at from public.testing_contributions c
    where c.id=v_id and c.account_id=p_account;
end $$;
revoke all on function private.testing_report_v2_submit(uuid,jsonb)
  from public,anon,authenticated,service_role;

create function public.testing_report_v2_submit_admitted(p_account uuid,p_report jsonb)
returns table(report_id uuid,report_state text,idempotent boolean,created_at timestamptz)
language sql security definer set search_path='' as $$
  select * from private.testing_report_v2_submit(p_account,p_report)
$$;
revoke all on function public.testing_report_v2_submit_admitted(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.testing_report_v2_submit_admitted(uuid,jsonb) to service_role;
commit;
