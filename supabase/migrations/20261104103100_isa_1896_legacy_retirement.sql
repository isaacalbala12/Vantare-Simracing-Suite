-- VANTA-131 / 7b final. The archive must be empty: pilot purge is an Isaac decision.
begin;
set local lock_timeout='5s';
do $role$
begin
  if not exists(select 1 from pg_roles where rolname=current_user
    and (rolsuper or rolbypassrls)) then
    raise exception 'legacy_retirement_requires_bypassrls' using errcode='42501';
  end if;
end $role$;
lock table private.testing_center_legacy_archive,
  public.testing_center_evidence_outbox,
  public.testing_center_screenshot_evidence,
  public.testing_center_evidence_batches,
  public.testing_center_report_submission_keys,
  public.testing_center_report_events,
  public.testing_center_report_payloads,
  public.testing_center_posthog_consent_events,
  public.testing_center_posthog_evidence,
  public.testing_center_issue_occurrences,
  public.testing_center_triage_results,
  public.testing_center_evidence,
  public.testing_center_reports,
  public.testing_center_technical_issues,
  public.testing_center_effect_outbox,
  public.testing_center_linear_projection_snapshots,
  public.testing_center_agent_audit,
  public.testing_center_agent_callbacks,
  public.testing_center_agent_effect_outbox,
  public.testing_center_agent_jobs,
  public.testing_center_agent_phase_callbacks,
  public.testing_center_agent_reservations,
  public.testing_center_audit,
  public.testing_center_candidate_builds,
  public.testing_center_codex_dossier_snapshots,
  public.testing_center_codex_execution_control,
  public.testing_center_codex_runs,
  public.testing_center_effect_supersessions,
  public.testing_center_idempotency,
  public.testing_center_issue_destinations,
  public.testing_center_linear_issue_bindings,
  public.testing_center_linear_reconciliations,
  public.testing_center_linear_webhook_deliveries,
  public.testing_center_owner_dispositions,
  public.testing_center_pauses,
  public.testing_center_promotions,
  public.testing_center_validation_snapshots,
  public.testing_center_validations in access exclusive mode;
lock table storage.objects,storage.s3_multipart_uploads in share mode;
do $preflight$
begin
  if exists(select 1 from private.testing_center_legacy_archive) then
    raise exception 'legacy_retirement_archive_not_empty: inspect the archive; do not purge automatically'
      using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_evidence_outbox) then
    raise exception 'legacy_retirement_rows_present: testing_center_evidence_outbox' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_screenshot_evidence) then
    raise exception 'legacy_retirement_rows_present: testing_center_screenshot_evidence' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_evidence_batches) then
    raise exception 'legacy_retirement_rows_present: testing_center_evidence_batches' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_report_submission_keys) then
    raise exception 'legacy_retirement_rows_present: testing_center_report_submission_keys' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_report_events) then
    raise exception 'legacy_retirement_rows_present: testing_center_report_events' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_report_payloads) then
    raise exception 'legacy_retirement_rows_present: testing_center_report_payloads' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_posthog_consent_events) then
    raise exception 'legacy_retirement_rows_present: testing_center_posthog_consent_events' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_posthog_evidence) then
    raise exception 'legacy_retirement_rows_present: testing_center_posthog_evidence' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_issue_occurrences) then
    raise exception 'legacy_retirement_rows_present: testing_center_issue_occurrences' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_triage_results) then
    raise exception 'legacy_retirement_rows_present: testing_center_triage_results' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_evidence) then
    raise exception 'legacy_retirement_rows_present: testing_center_evidence' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_reports) then
    raise exception 'legacy_retirement_rows_present: testing_center_reports' using errcode='55000';
  end if;
  if exists(select 1 from public.testing_center_technical_issues where report_id is not null)
    or exists(select 1 from public.testing_center_effect_outbox)
    or exists(select 1 from public.testing_center_linear_projection_snapshots) then
    raise exception 'legacy_retirement_retained_lineage_present' using errcode='55000';
  end if;
  if exists(select 1 from storage.objects where bucket_id='testing-center-evidence')
    or exists(select 1 from storage.s3_multipart_uploads
      where bucket_id='testing-center-evidence') then
    raise exception 'legacy_retirement_storage_present: inspect screenshot objects and uploads'
      using errcode='55000';
  end if;
end $preflight$;

-- Remove the disabled Storage upload slot policy before its two source tables.
drop policy testing_center_evidence_insert_own_slot on storage.objects;
-- These ten obsolete report RPCs have no active product caller. Keep the
-- separate issue/agent and Linear/outbox RPCs inert for the next phase.
drop function public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid) restrict;
drop function public.testing_center_submit_report_with_evidence(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid) restrict;
drop function public.testing_center_finalize_screenshot(uuid,uuid) restrict;
drop function public.testing_center_prepare_screenshot_batch(text,text,text,jsonb) restrict;
drop function public.testing_center_can_insert_evidence_object(text,text) restrict;
drop function public.testing_center_record_posthog_evidence(jsonb,text,text,text,text) restrict;
drop function public.testing_center_set_posthog_consent(text,boolean,boolean,text) restrict;
drop function public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) restrict;
drop function public.testing_center_triage_report(text) restrict;
drop function public.testing_center_submit_report_without_transport_size(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) restrict;
-- No Hub, web, digest or deploy caller remains. The dry-run Codex RPC itself
-- calls the removed evidence reader, so retire both in the same transaction.
drop function public.testing_center_queue_codex_dry_run(text,text,text,text,text,text) restrict;
drop function public.testing_center_load_codex_evidence(text) restrict;
drop function public.testing_center_prepare_linear_projection(text) restrict;
drop function public.testing_center_expire_posthog_evidence(timestamptz) restrict;
drop function public.testing_center_authorize_posthog_linear_link(text,uuid) restrict;
drop function private.testing_center_report_evidence_for_account(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid) restrict;
drop function private.testing_center_report_for_account(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) restrict;
drop function private.testing_center_report_payload_for_account(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) restrict;
drop policy testing_center_issues_select_own on public.testing_center_technical_issues;
create policy testing_center_issues_select_own on public.testing_center_technical_issues
  for select to authenticated using (exists (
    select 1 from public.testing_contributions c
    where c.id=testing_center_technical_issues.contribution_id
      and (c.account_id=private.current_account()
        or public.testing_center_current_role()='owner')));

-- The v2 agent keeps technical_issues/agent_jobs; only its old root edge ends.
drop trigger a_account_write_barrier on public.testing_center_technical_issues;
alter table public.testing_center_technical_issues
  drop constraint testing_center_technical_issues_report_id_fkey;
alter table public.testing_center_technical_issues
  add constraint testing_center_technical_issue_no_legacy_report_id
  check (report_id is null);
create trigger a_account_write_barrier before insert or update or delete
  on public.testing_center_technical_issues for each row
  execute function private.guard_account_write(
    'select array_remove(array[(select account_id from public.testing_contributions where id=($1->>''contribution_id'')::uuid)],null)',
    'select ($1->>''contribution_id'' is not null and not exists (select 1 from public.testing_contributions where id=($1->>''contribution_id'')::uuid))');
alter table public.testing_center_effect_outbox
  drop constraint testing_center_effect_outbox_primary_report_id_fkey;
alter table public.testing_center_linear_projection_snapshots
  drop constraint testing_center_linear_projection_snapsho_primary_report_id_fkey;

-- pg_depend cannot see SQL stored in trigger arguments. Drop the obsolete
-- guard when the v2 guard already owns the row; replace it elsewhere with
-- retained contribution lineage. This intentionally leaves inert ledgers
-- writable only through their existing SQL privileges.
do $retained_guards$
declare r record;
  owner_query constant text := $owners$
    select array_remove(array[
      private.testing_center_v2_owner($1->>'technical_issue_id'),
      private.testing_center_v2_owner($1->>'job_key'),
      private.testing_center_v2_owner($1->>'aggregate_id'),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>'effect_id'),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>'legacy_effect_id'),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>'superseded_by_effect_id'),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>'candidate_id'),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>'validation_id'),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>'rejection_validation_id'),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>'external_issue_id'),
      nullif($1->>'actor_user_id','')::uuid,
      nullif($1->>'requested_by_user_id','')::uuid,
      nullif($1->>'authorized_by_user_id','')::uuid
    ],null)
  $owners$;
begin
  for r in select t.tgrelid::regclass as relation
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and t.tgname='a_account_write_barrier'
      and c.relnamespace='public'::regnamespace
      and c.relname not in (
        'testing_center_reports','testing_center_evidence','testing_center_triage_results',
        'testing_center_issue_occurrences','testing_center_posthog_consent_events',
        'testing_center_posthog_evidence','testing_center_report_events',
        'testing_center_report_payloads','testing_center_report_submission_keys',
        'testing_center_screenshot_evidence','testing_center_evidence_batches',
        'testing_center_evidence_outbox','testing_center_technical_issues')
      and encode(t.tgargs,'escape') ~
        '(public\.|\m(from|join|update|into|references|table)\s+)testing_center_(reports|evidence|triage_results|issue_occurrences|posthog_consent_events|posthog_evidence|report_events|report_payloads|report_submission_keys|screenshot_evidence|evidence_batches|evidence_outbox)\M'
    order by t.tgrelid::regclass::text
  loop
    execute format('drop trigger a_account_write_barrier on %s',r.relation);
    if not exists(select 1 from pg_trigger b
      where b.tgrelid=r.relation and b.tgname='b_account_write_barrier_v2') then
      execute format('create trigger a_account_write_barrier before insert or update or delete
        on %s for each row execute function private.guard_account_write(%L,%L)',
        r.relation,owner_query,'select false');
    end if;
  end loop;
end $retained_guards$;

-- The account erasure contract and Storage owner resolver no longer inspect
-- report-only rows. Full function bodies preserve every other route.
CREATE OR REPLACE FUNCTION public.apply_clerk_user_event(p_event_id text, p_payload_hash text, p_issuer text, p_subject text, p_event_type text, p_event_at timestamp with time zone, p_verified_email text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare identity public.account_identities; account uuid; old_hash text;
begin
  if p_event_type not in ('user.created', 'user.updated', 'user.deleted')
    or p_event_at is null or not exists (select 1 from private.clerk_issuers c
      where c.issuer = p_issuer and c.enabled)
    or p_subject is null or p_subject !~ '^user_[a-zA-Z0-9_]{1,128}$' then
    raise exception 'invalid_clerk_user_event';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_issuer || chr(31) || p_subject, 0));
  insert into private.clerk_user_events(event_id, payload_hash, event_type)
    values(p_event_id, p_payload_hash, p_event_type) on conflict do nothing;
  if not found then
    select payload_hash into old_hash from private.clerk_user_events where event_id = p_event_id;
    if old_hash <> p_payload_hash then raise exception 'clerk_event_conflict'; end if;
    return 'unchanged';
  end if;
  select * into identity from public.account_identities i
    where i.issuer = p_issuer and i.subject = p_subject;
  -- Deleted is permanent, including delete-before-create and late JWT/webhooks.
  if identity.deleted_at is not null then return 'ignored'; end if;
  account := identity.account_id;
  if account is null then account := private.resolve_account_identity(p_issuer, p_subject); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(account::text, 1608));
  -- Another subject of this UUID may have deleted it while this event waited.
  -- Re-read under the account lock; never use the pre-wait PII/version state.
  select * into identity from public.account_identities i
    where i.issuer = p_issuer and i.subject = p_subject for update;
  if exists (select 1 from public.account_identities i
    where i.account_id = account and i.deleted_at is not null) then return 'ignored'; end if;
  if p_event_type = 'user.deleted' then
    update public.profiles set email = null, display_name = null, avatar_url = null,
      primary_simulator = null, onboarding_completed = false where id = account;
    delete from public.devices where user_id = account;
    delete from public.rate_limits where user_id = account;
    delete from public.license_validations where user_id = account;
    update public.licenses set is_active = false, hwid = null, deactivated_at = now(),
      deactivation_reason = 'clerk_user_deleted' where user_id = account;
    update public.billing_customers set email = null, metadata = '{}'::jsonb where user_id = account;
    update public.billing_access_grants set status = 'revoked' where user_id = account;
    update public.user_entitlements set status = 'revoked' where user_id = account;
    update public.operational_access_assignments set status = 'revoked', revoked_at = now(),
      revoked_by = 'clerk:webhook', revoke_reason = 'clerk_user_deleted'
      where user_id = account and status = 'active';

    -- Abort persisted uploads through S3 API, before deleting final objects.
    insert into private.clerk_deleted_uploads(issuer,subject,bucket_id,name,upload_id)
      select p_issuer,p_subject,u.bucket_id,u.key,u.id from storage.s3_multipart_uploads u
      where account in (select private.storage_owner_accounts(to_jsonb(u))) or u.owner_id=account::text
        or account in (select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=u.bucket_id)
        or (exists(select 1 from public.account_identities a where a.account_id=account and a.subject=u.owner_id)
          and not exists(select 1 from public.account_identities a where a.account_id<>account and a.subject=u.owner_id))
      on conflict do nothing;
    -- Storage bytes are removed through the Storage API, never SQL DELETE.
    insert into private.clerk_deleted_objects(issuer,subject,bucket_id,name)
      select p_issuer,p_subject,o.bucket_id,o.name from storage.objects o
      where account in (select private.storage_owner_accounts(to_jsonb(o))) or o.owner_id::text=account::text
        or account in (select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=o.bucket_id)
        or o.owner=account
        or (exists(select 1 from public.account_identities a where a.account_id=account and a.subject=o.owner_id)
          and not exists(select 1 from public.account_identities a where a.account_id<>account and a.subject=o.owner_id))
      on conflict do nothing;
    delete from pilot_private.operations where account_id=account;
    delete from public.pilot_profiles where account_id=account;
    delete from public.testing_answers where account_id=account;
    delete from public.testing_contributions where account_id=account;

    update public.testing_center_memberships set active=false where user_id=account;
    update public.account_identities set deleted_at = p_event_at, user_event_at = greatest(user_event_at,p_event_at)
      where account_id = account;
    -- Preserve private financial/support IDs and audit hashes. No automatic purge.
  elsif identity.user_event_at is null or p_event_at > identity.user_event_at then
    update public.profiles set email = p_verified_email where id = account;
    update public.account_identities set user_event_at = p_event_at
      where issuer = p_issuer and subject = p_subject;
  else
    return 'ignored';
  end if;
  return 'applied';
end $function$;

CREATE OR REPLACE FUNCTION private.storage_owner_accounts(p_row jsonb)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_text text:=nullif(p_row->>'owner_id',''); owners uuid[]; v_issuer text;
begin
  if owner_text is not null then
    if owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return next owner_text::uuid;
    else
      -- Clerk service writes may lack JWT claims. In that case only one durable
      -- UUID across issuers is acceptable; a bare, ambiguous sub is never linked.
      if auth.jwt()->>'sub'=owner_text and auth.jwt()->>'role'='authenticated' then
        v_issuer:=auth.jwt()->>'iss';
      end if;
      select array_agg(distinct i.account_id) into owners from public.account_identities i
        where i.subject=owner_text ;
      if coalesce(cardinality(owners),0)<>1 then
        raise sqlstate '23503' using message='storage_owner_unresolved';
      end if;
      if v_issuer is not null and not exists(select 1 from public.account_identities i
        where i.subject=owner_text and i.issuer=v_issuer and i.account_id=owners[1]) then
        raise sqlstate '23503' using message='storage_owner_unresolved';
      end if;
      return next owners[1];
    end if;
  end if;

  -- Pilot paths are UUID/hash.jpg and may be written with a service owner NULL.
  if p_row->>'bucket_id'='pilot-photos' and coalesce(p_row->>'name',p_row->>'key')
    ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$' then
    return next split_part(coalesce(p_row->>'name',p_row->>'key'),'/',1)::uuid;
  end if;
  -- Deprecated owner may still be present in historical Storage rows.
  if nullif(p_row->>'owner','') is not null then return next (p_row->>'owner')::uuid; end if;
end $function$;


drop table public.testing_center_evidence_outbox restrict;
drop table public.testing_center_screenshot_evidence restrict;
drop table public.testing_center_evidence_batches restrict;
drop table public.testing_center_report_submission_keys restrict;
drop table public.testing_center_report_events restrict;
drop table public.testing_center_report_payloads restrict;
drop table public.testing_center_posthog_consent_events restrict;
drop table public.testing_center_posthog_evidence restrict;
drop table public.testing_center_issue_occurrences restrict;
drop table public.testing_center_triage_results restrict;
drop table public.testing_center_evidence restrict;
drop table public.testing_center_reports restrict;
drop table private.testing_center_legacy_archive restrict;
-- SQL in function bodies and trigger arguments is opaque to pg_depend.
do $no_dangling_legacy$
declare v_references text;
begin
  select string_agg(reference,', ' order by reference) into v_references from (
    select 'trigger:'||t.tgrelid::regclass::text||'.'||t.tgname as reference
      from pg_trigger t where not t.tgisinternal
        and encode(t.tgargs,'escape') ~
          '((public\.|\m(from|join|update|into|references|table)\s+)testing_center_(reports|evidence|triage_results|issue_occurrences|posthog_consent_events|posthog_evidence|report_events|report_payloads|report_submission_keys|screenshot_evidence|evidence_batches|evidence_outbox)|private\.testing_center_legacy_archive)\M'
    union all
    select 'function:'||p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname not in ('pg_catalog','information_schema') and p.prokind='f'
        and pg_get_functiondef(p.oid) ~
          '((public\.|\m(from|join|update|into|references|table)\s+)testing_center_(reports|evidence|triage_results|issue_occurrences|posthog_consent_events|posthog_evidence|report_events|report_payloads|report_submission_keys|screenshot_evidence|evidence_batches|evidence_outbox)|private\.testing_center_legacy_archive)\M'
  ) live;
  if v_references is not null then
    raise exception 'legacy_retirement_dangling_catalog_reference'
      using errcode='55000',detail=v_references;
  end if;
end $no_dangling_legacy$;
commit;
