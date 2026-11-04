-- VANTA-131 / #1936: operational owner is the sole disposition authority.
begin;

create or replace function public.testing_center_record_owner_disposition(
  p_rejection_validation_id text,
  p_dossier_digest text,
  p_disposition text,
  p_reason text,
  p_correction_issue_id text,
  p_target_branch text,
  p_nightly_sha text,
  p_owner_user_id uuid
)
returns table(result_disposition_id text,result_issue_state text,result_idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id text;
  v_validation public.testing_center_validation_snapshots%rowtype;
  v_issue public.testing_center_technical_issues%rowtype;
  v_dossier public.testing_center_codex_dossier_snapshots%rowtype;
  v_existing public.testing_center_owner_dispositions%rowtype;
  v_digest text;
  v_disposition_id text;
  v_target_state text;
begin
  if p_owner_user_id is null or p_disposition not in (
      'create_correction_subissue','environment_issue','create_separate_issue',
      'dismiss_with_reason','stop_rollout'
    ) or p_reason is null or p_reason <> btrim(p_reason)
    or pg_catalog.octet_length(p_reason) not between 3 and 2048 then
    raise exception 'testing_center_owner_disposition_invalid' using errcode='22023';
  end if;
  if not private.is_owner(p_owner_user_id) then
    raise exception 'testing_center_owner_required' using errcode='42501';
  end if;
  -- Keep the historical actor identifier for exact replay; an operational
  -- owner without Testing Center membership uses the canonical account UUID.
  select m.actor_id into v_actor_id from public.testing_center_memberships m
  where m.user_id=p_owner_user_id;
  v_actor_id := coalesce(v_actor_id,p_owner_user_id::text);
  select * into v_validation from public.testing_center_validation_snapshots
  where validation_id=p_rejection_validation_id and decision='rejected'
  for update;
  if not found then
    raise exception 'testing_center_owner_rejection_invalid' using errcode='55000';
  end if;
  select * into strict v_issue from public.testing_center_technical_issues
  where technical_issue_id=v_validation.technical_issue_id for update;
  v_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    p_rejection_validation_id || pg_catalog.chr(31)
    || coalesce(p_dossier_digest,'') || pg_catalog.chr(31)
    || p_disposition || pg_catalog.chr(31) || p_reason || pg_catalog.chr(31)
    || coalesce(p_correction_issue_id,'') || pg_catalog.chr(31)
    || coalesce(p_target_branch,'') || pg_catalog.chr(31)
    || coalesce(p_nightly_sha,'') || pg_catalog.chr(31)
    || v_actor_id || pg_catalog.chr(31) || p_owner_user_id::text,
    'UTF8'),'sha256'),'hex');
  v_disposition_id := 'disposition_' || v_digest;
  select * into v_existing from public.testing_center_owner_dispositions
  where rejection_validation_id=p_rejection_validation_id;
  if found then
    if v_existing.disposition_digest <> v_digest then
      raise exception 'testing_center_owner_disposition_conflict' using errcode='23505';
    end if;
    return query select v_existing.disposition_id,v_issue.flow_state,true;
    return;
  end if;
  if v_issue.flow_state <> 'needs_owner' then
    raise exception 'testing_center_owner_issue_not_blocked' using errcode='55000';
  end if;
  if p_disposition='create_correction_subissue' then
    if p_dossier_digest is null or p_correction_issue_id is null
      or p_target_branch is null or p_nightly_sha is null then
      raise exception 'testing_center_owner_complete_dossier_required'
        using errcode='55000';
    end if;
    select * into v_dossier from public.testing_center_codex_dossier_snapshots
    where dossier_digest=p_dossier_digest
      and rejection_validation_id=p_rejection_validation_id
      and status='complete';
    if not found or v_dossier.correction_issue_id <> p_correction_issue_id
      or v_dossier.target_branch <> p_target_branch
      or v_dossier.nightly_sha <> p_nightly_sha then
      raise exception 'testing_center_owner_complete_dossier_required'
        using errcode='55000';
    end if;
    v_target_state := 'needs_owner';
  else
    if p_dossier_digest is not null or p_correction_issue_id is not null
      or p_target_branch is not null or p_nightly_sha is not null then
      raise exception 'testing_center_owner_disposition_fields_invalid'
        using errcode='22023';
    end if;
    v_target_state := 'stopped';
  end if;
  insert into public.testing_center_owner_dispositions(
    disposition_id,rejection_validation_id,technical_issue_id,actor_id,
    actor_user_id,disposition,reason,dossier_digest,correction_issue_id,
    target_branch,nightly_sha,disposition_digest
  ) values (
    v_disposition_id,p_rejection_validation_id,v_validation.technical_issue_id,
    v_actor_id,p_owner_user_id,p_disposition,p_reason,p_dossier_digest,
    p_correction_issue_id,p_target_branch,p_nightly_sha,v_digest
  );
  if v_target_state='stopped' then
    update public.testing_center_technical_issues
    set flow_state='stopped',updated_at=now()
    where technical_issue_id=v_validation.technical_issue_id;
    insert into public.testing_center_audit(
      contract_version,audit_id,aggregate_id,from_state,to_state,origin,
      actor_id,actor_user_id,actor_role,exact_sha,operation_digest
    ) values (
      'testing-center.v1','audit_' || v_digest,v_validation.technical_issue_id,
      'needs_owner','stopped','testing_center',v_actor_id,p_owner_user_id,
      'owner',v_validation.candidate_sha,v_digest
    );
  end if;
  return query select v_disposition_id,v_target_state,false;
end $$;

revoke all on function public.testing_center_record_owner_disposition(text,text,text,text,text,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.testing_center_record_owner_disposition(text,text,text,text,text,text,text,uuid) to service_role;

commit;
