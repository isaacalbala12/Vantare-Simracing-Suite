-- #1608 R9: trusted server UUIDs use private parameters, never synthetic JWTs.
-- Keep the public identity boundary and all submission ACLs unchanged.
begin;
set local lock_timeout='5s';

create function private.testing_contribution_submit_for_account(p_account uuid,p_id uuid, p_channel text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  -- Same UUID lock as deletion, before membership/row locks; recheck after wait.
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted'; end if;
  if not exists(select 1 from public.testing_center_memberships m where m.user_id=p_account and m.active
      and ((m.role in ('owner','primary_tester') and p_channel in ('nightly','testers'))
        or (m.role='tester' and p_channel='testers'))) then
    raise exception 'testing_membership_required' using errcode = '42501';
  end if;
  insert into public.testing_contributions(id,account_id,channel,title,body)
    values(p_id,p_account,p_channel,p_title,p_body) on conflict(id) do nothing;
  -- A retry with the same UUID must represent the same payload and account.
  if not exists(select 1 from public.testing_contributions where id = p_id and account_id = p_account
    and channel = p_channel and title = p_title and body = p_body) then
    raise exception 'testing_contribution_conflict' using errcode = '23505';
  end if;
end $$;

revoke all on function private.testing_contribution_submit_for_account(uuid,uuid,text,text,text) from public,anon,authenticated,service_role,vantare_triage;

create function private.testing_contribution_submit_v2_for_account(p_account uuid,p_id uuid, p_channel text, p_title text,
  p_body text, p_context jsonb, p_attachments jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.testing_contribution_context%rowtype; a jsonb; items jsonb; accepted_at timestamptz;
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  -- Same UUID lock as deletion, before membership/row locks; recheck after wait.
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted'; end if;
  perform 1 from public.testing_center_memberships where user_id = p_account and active
    and ((role in ('owner','primary_tester') and p_channel in ('nightly','testers'))
      or (role = 'tester' and p_channel = 'testers')) for share;
  if not found then
    raise exception 'testing_membership_required' using errcode = '42501'; end if;
  if p_context is null or jsonb_typeof(p_context) <> 'object'
    or p_context - array['app_version','app_channel','game','game_version','system','telemetry_summary','posthog_session_id','consent'] <> '{}'::jsonb
    or not (p_context ?& array['app_version','app_channel','game','system','consent'])
    or jsonb_typeof(p_context->'app_version') <> 'string' or jsonb_typeof(p_context->'app_channel') <> 'string'
    or jsonb_typeof(p_context->'game') <> 'string' or p_context->>'app_channel' is distinct from p_channel
    or (p_context ? 'game_version' and jsonb_typeof(p_context->'game_version') not in ('string','null'))
    or (p_context ? 'posthog_session_id' and jsonb_typeof(p_context->'posthog_session_id') not in ('string','null'))
    or jsonb_typeof(p_context->'consent') <> 'object' then
    raise exception 'testing_context_invalid' using errcode = '22023'; end if;
  a := p_context->'consent'; items := a->'items';
  if a - array['version','items','accepted_at'] <> '{}'::jsonb
    or a->>'version' is distinct from 'triage-v2' or jsonb_typeof(items) is distinct from 'array'
    or jsonb_typeof(a->'accepted_at') is distinct from 'string' then
    raise exception 'testing_consent_required' using errcode = '22023'; end if;
  if jsonb_array_length(items) > 5 or exists(select 1 from jsonb_array_elements(items) x where
    jsonb_typeof(x.value) <> 'string' or x.value #>> '{}' not in
    ('system','telemetry_summary','app_log','telemetry_fragment','posthog_session'))
    or (select count(*) <> count(distinct value) from jsonb_array_elements(items)) then
    raise exception 'testing_consent_invalid' using errcode = '22023'; end if;
  accepted_at := (a->>'accepted_at')::timestamptz;
  if not isfinite(accepted_at) or accepted_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'testing_consent_invalid' using errcode = '22023'; end if;
  if (not items ? 'system' and p_context->'system' <> '{}'::jsonb)
    or (not items ? 'telemetry_summary' and coalesce(p_context->'telemetry_summary','null'::jsonb) <> 'null'::jsonb)
    or (not items ? 'posthog_session' and coalesce(p_context->'posthog_session_id','null'::jsonb) <> 'null'::jsonb) then
    raise exception 'testing_unconsented_data' using errcode = '22023'; end if;
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'testing_attachments_invalid' using errcode = '22023'; end if;
  if jsonb_array_length(p_attachments) > 2 then raise exception 'testing_attachments_invalid' using errcode = '22023'; end if;
  for a in select value from jsonb_array_elements(p_attachments) loop
    if jsonb_typeof(a) <> 'object' or a - array['kind','content','sha256'] <> '{}'::jsonb
      or not (a ?& array['kind','content','sha256'])
      or exists(select 1 from jsonb_each(a) x where jsonb_typeof(x.value) <> 'string')
      or not items ? (a->>'kind') then
      raise exception 'testing_attachments_invalid' using errcode = '22023'; end if;
  end loop;
  -- Parent lock also serializes retries and review against this upload.
  perform private.testing_contribution_submit_for_account(p_account,p_id,p_channel,p_title,p_body);
  perform 1 from public.testing_contributions where id = p_id for update;
  select * into v from public.testing_contribution_context where contribution_id = p_id;
  if found then
    if (to_jsonb(v) - 'contribution_id') is distinct from jsonb_build_object(
      'app_version',p_context->'app_version','app_channel',p_context->'app_channel',
      'game',p_context->'game','game_version',p_context->'game_version','system',p_context->'system',
      'telemetry_summary',nullif(p_context->'telemetry_summary','null'::jsonb),
      'posthog_session_id',p_context->'posthog_session_id','consent',p_context->'consent')
      or (select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'content',content,'sha256',sha256) order by kind),'[]'::jsonb)
        from public.testing_contribution_attachments where contribution_id = p_id)
        is distinct from (select coalesce(jsonb_agg(value order by value->>'kind'),'[]'::jsonb) from jsonb_array_elements(p_attachments)) then
      raise exception 'testing_contribution_conflict' using errcode = '23505'; end if;
    return;
  end if;
  if exists(select 1 from public.testing_contribution_reviews where contribution_id = p_id)
    or exists(select 1 from public.testing_contributions where id = p_id and state <> 'received') then
    raise exception 'testing_contribution_conflict' using errcode = '23505'; end if;
  insert into public.testing_contribution_context values (p_id,p_context->>'app_version',p_channel,
    p_context->>'game',p_context->>'game_version',p_context->'system',
    nullif(p_context->'telemetry_summary','null'::jsonb),p_context->>'posthog_session_id',p_context->'consent');
  insert into public.testing_contribution_attachments
    select p_id,value->>'kind',value->>'content',value->>'sha256' from jsonb_array_elements(p_attachments);
end $$;

revoke all on function private.testing_contribution_submit_v2_for_account(uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role,vantare_triage;

create function private.testing_report_submit_for_account(p_account uuid,p_id uuid,p_channel text,p_title text,p_body text,p_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  -- Same UUID lock as deletion, before membership/row locks; recheck after wait.
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

revoke all on function private.testing_report_submit_for_account(uuid,uuid,text,text,text,boolean) from public,anon,authenticated,service_role,vantare_triage;

-- Keep one implementation per submission path. CREATE OR REPLACE preserves
-- the already closed public ACLs; clients still cannot call these RPCs directly.
create or replace function public.testing_contribution_submit(p_id uuid,p_channel text,p_title text,p_body text)
returns void language sql security definer set search_path='' as $$
 select private.testing_contribution_submit_for_account(private.current_account(),p_id,p_channel,p_title,p_body)
$$;
create or replace function public.testing_contribution_submit_v2(p_id uuid,p_channel text,p_title text,p_body text,p_context jsonb,p_attachments jsonb)
returns void language sql security definer set search_path='' as $$
 select private.testing_contribution_submit_v2_for_account(private.current_account(),p_id,p_channel,p_title,p_body,p_context,p_attachments)
$$;
create or replace function public.testing_report_submit(p_id uuid,p_channel text,p_title text,p_body text,p_consent boolean)
returns void language sql security definer set search_path='' as $$
 select private.testing_report_submit_for_account(private.current_account(),p_id,p_channel,p_title,p_body,p_consent)
$$;

create or replace function public.testing_report_submit_admitted(p_account uuid,p_id uuid,p_channel text,p_title text,p_body text,p_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  perform private.testing_report_submit_for_account(p_account,p_id,p_channel,p_title,p_body,p_consent);
end $$;

create or replace function public.testing_contribution_submit_admitted(p_account uuid,
  p_id uuid,p_channel text,p_title text,p_body text,p_context jsonb,p_attachments jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  if p_title is distinct from '[contenido retirado por privacidad]'
    or p_body is distinct from '[contenido retirado por privacidad]' then
    raise exception 'testing_context_invalid' using errcode='22023'; end if;
  -- Reuse membership, selected-item consent, attachment SHA and retry validation.
  -- Its parent INSERT also passes #1610's account/row quotas atomically.
  perform private.testing_contribution_submit_v2_for_account(p_account,p_id,p_channel,p_title,p_body,p_context,p_attachments);
  -- Preserve follow-up/notice/credit semantics; never overwrite credit on retry.
  perform private.testing_report_submit_for_account(p_account,p_id,p_channel,p_title,p_body,true);
end $$;

commit;
