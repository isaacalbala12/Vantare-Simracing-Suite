-- VANTA-131 / 7b2. Restore the complete archived FK subtree before the
-- later admin migration or final legacy table removal. Keep the archive.
begin;
set local lock_timeout = '5s';
set local timezone = 'UTC';

do $account_erasure$
declare
  definition text;
  begin_marker text := '-- VANTA131 legacy archive erasure begin';
  end_marker text := '-- VANTA131 legacy archive erasure end';
  start_at integer;
  end_at integer;
begin
  definition:=pg_catalog.pg_get_functiondef(
    'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure);
  start_at:=position(begin_marker in definition);
  end_at:=position(end_marker in definition);
  if start_at=0 or end_at<=start_at
    or position('delete from private.testing_center_legacy_archive' in
      pg_catalog.substr(definition,start_at,end_at-start_at))=0
    or position(begin_marker in pg_catalog.substr(definition,start_at+1))>0
    or position(end_marker in pg_catalog.substr(definition,end_at+1))>0 then
    raise exception 'legacy_archive_account_delete_rollback_drift' using errcode='55000';
  end if;
  execute pg_catalog.substr(definition,1,start_at-1)||
    pg_catalog.substr(definition,end_at+pg_catalog.length(end_marker));
end $account_erasure$;

do $restore$
declare
  v_relation record;
  v_fk record;
  v_join text;
  v_has_dependents boolean;
  v_expected bigint;
  v_actual bigint;
  v_skipped bigint;
  v_deleted_skipped bigint;
  v_orphan_skipped bigint;
begin
  if to_regclass('private.testing_center_legacy_archive') is null
    or to_regclass('public.testing_center_reports') is null then
    raise exception 'legacy_archive_restore_schema_missing' using errcode='55000';
  end if;
  create temp table _legacy_relations (
    relid oid primary key,
    source_table text not null unique,
    depth integer not null
  ) on commit drop;
  insert into pg_temp._legacy_relations(relid,source_table,depth)
  with recursive walk(relid,depth,path) as (
    select 'public.testing_center_reports'::regclass::oid,0,
      array['public.testing_center_reports'::regclass::oid]::oid[]
    union all
    select f.conrelid,w.depth+1,w.path||f.conrelid
    from walk w join pg_catalog.pg_constraint f
      on f.contype='f' and f.confrelid=w.relid
    where not f.conrelid=any(w.path)
  )
  select w.relid,format('%I.%I',n.nspname,c.relname),max(w.depth)
  from walk w join pg_catalog.pg_class c on c.oid=w.relid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  group by w.relid,n.nspname,c.relname;
  insert into pg_temp._legacy_relations(relid,source_table,depth)
  select ledger.relid,ledger.source_table,issue.depth+1
  from pg_temp._legacy_relations issue
  cross join (values
    ('public.testing_center_audit'::regclass::oid,
      'public.testing_center_audit'::text),
    ('public.testing_center_idempotency'::regclass::oid,
      'public.testing_center_idempotency'::text)
  ) ledger(relid,source_table)
  where issue.relid='public.testing_center_technical_issues'::regclass;
  if exists (
    select 1 from pg_catalog.pg_constraint f
    join pg_temp._legacy_relations child on child.relid=f.conrelid
    join pg_temp._legacy_relations parent on parent.relid=f.confrelid
    where f.contype='f' and child.depth<=parent.depth
  ) then
    raise exception 'legacy_archive_restore_fk_cycle' using errcode='55000';
  end if;
  for v_relation in select * from pg_temp._legacy_relations
    order by depth,source_table loop
    execute format('lock table %s in access exclusive mode',v_relation.source_table);
  end loop;
  lock table private.testing_center_legacy_archive in access exclusive mode;
  lock table public.testing_contributions in access exclusive mode;
  lock table public.testing_report_followup in access exclusive mode;
  delete from pg_temp._legacy_relations where source_table in (
    'public.testing_center_screenshot_evidence',
    'public.testing_center_evidence_outbox');

  create temp table _legacy_skipped (
    source_table text not null,
    source_id text not null,
    reason text not null,
    primary key(source_table,source_id)
  ) on commit drop;
  insert into pg_temp._legacy_skipped(source_table,source_id,reason)
  with recursive skipped(source_table,source_id,reason) as (
    select archived.source_table,archived.source_id,
      case when exists(select 1 from public.account_identities identity_row
        where identity_row.account_id=
          (archived."row"->>'reporter_user_id')::uuid
          and identity_row.deleted_at is not null)
      then 'deleted' else 'missing_profile' end
    from private.testing_center_legacy_archive archived
    where archived.source_table='public.testing_center_reports'
      and (exists(select 1 from public.account_identities identity_row
          where identity_row.account_id=
            (archived."row"->>'reporter_user_id')::uuid
            and identity_row.deleted_at is not null)
        or not exists(select 1 from public.profiles profile
          where profile.id=(archived."row"->>'reporter_user_id')::uuid))
    union
    select child.source_table,child.source_id,parent.reason
    from private.testing_center_legacy_archive child
    join skipped parent on
      (parent.source_table='public.testing_center_reports'
        and (child."row"->>'report_id'=parent.source_id
          or child."row"->>'primary_report_id'=parent.source_id))
      or (parent.source_table='public.testing_center_technical_issues'
        and (child."row"->>'technical_issue_id'=parent.source_id
          or child."row"->>'aggregate_id'=parent.source_id))
      or (parent.source_table='public.testing_center_agent_jobs'
        and child."row"->>'job_key'=parent.source_id)
      or (parent.source_table='public.testing_center_effect_outbox'
        and child."row"->>'effect_id'=parent.source_id)
  ) select source_table,source_id,min(reason) from skipped
    group by source_table,source_id;
  select count(*) into v_skipped from pg_temp._legacy_skipped;
  select count(*) into v_deleted_skipped from pg_temp._legacy_skipped
    where reason='deleted';
  v_orphan_skipped:=v_skipped-v_deleted_skipped;

  if exists(select 1 from public.testing_center_reports) then
    raise exception 'legacy_archive_restore_parent_not_empty' using errcode='55000';
  end if;
  if exists (
    select 1 from private.testing_center_legacy_archive a
    left join pg_temp._legacy_relations r on r.source_table=a.source_table
    where r.relid is null or a.row_sha256 is distinct from
      pg_catalog.encode(public.digest(
        pg_catalog.convert_to(a."row"::text,'UTF8'),'sha256'),'hex')
  ) then
    raise exception 'legacy_archive_restore_corrupt' using errcode='55000';
  end if;
  if exists (
    select 1 from public.testing_contributions c
    left join private.testing_center_legacy_archive a
      on a.source_table='public.testing_center_reports'
      and a.source_id=c.legacy_source_id
    where c.legacy_source_id is not null and a.source_id is null
  ) then
    raise exception 'legacy_archive_restore_unknown_mapping' using errcode='55000';
  end if;
  if exists (
    select 1 from public.testing_contributions c
    join private.testing_center_legacy_archive a
      on a.source_table='public.testing_center_reports'
      and a.source_id=c.legacy_source_id
    left join private.testing_center_legacy_archive p
      on p.source_table='public.testing_center_report_payloads'
      and p.source_id=a.source_id
    cross join lateral (select pg_catalog.encode(public.digest(
      pg_catalog.convert_to('vanta131:legacy:'||a.source_id,'UTF8'),'sha1'),'hex')
      as digest) mapping_hash
    where c.account_id is distinct from (a."row"->>'reporter_user_id')::uuid
      or c.id is distinct from (pg_catalog.substr(mapping_hash.digest,1,8)||'-'||
        pg_catalog.substr(mapping_hash.digest,9,4)||'-5'||
        pg_catalog.substr(mapping_hash.digest,14,3)||'-8'||
        pg_catalog.substr(mapping_hash.digest,18,3)||'-'||
        pg_catalog.substr(mapping_hash.digest,21,12))::uuid
      or c.channel is distinct from a."row"->>'channel'
      or c.created_at is distinct from (a."row"->>'created_at')::timestamptz
      or c.title is distinct from pg_catalog.left(coalesce(nullif(
        pg_catalog.btrim(p."row"->>'action_text'),''),'Informe legacy'),120)
      or c.body is distinct from pg_catalog.left(coalesce(nullif(
        pg_catalog.btrim('Esperado: '||(p."row"->>'expected_text')||
          E'\nObservado: '||(p."row"->>'observed_text')),''),
        'Informe legacy '||a.source_id),1000)
      or c.state is distinct from case a."row"->>'state'
        when 'submitted' then 'reviewing'
        when 'in_review' then 'reviewing'
        when 'validated' then 'accepted'
        when 'rejected' then 'declined'
        when 'spam' then 'spam'
        when 'fixed' then 'fixed' end
  ) then
    raise exception 'legacy_archive_restore_mapping_changed' using errcode='55000';
  end if;
  -- A mapped v2 report may have gained reviews, context, attachments or jobs.
  -- The rollback refuses to cascade-delete any such post-migration data.
  for v_fk in
    select f.*,format('%I.%I',n.nspname,c.relname) as child_table
    from pg_catalog.pg_constraint f
    join pg_catalog.pg_class c on c.oid=f.conrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where f.contype='f'
      and f.confrelid='public.testing_contributions'::regclass
      and f.conrelid<>'public.testing_report_followup'::regclass
  loop
    select string_agg(format(
      'pg_catalog.to_jsonb(child.%I)=pg_catalog.to_jsonb(parent.%I)',
      ca.attname,pa.attname),' and ' order by k.ord) into v_join
    from unnest(v_fk.conkey,v_fk.confkey)
      with ordinality as k(child_attnum,parent_attnum,ord)
    join pg_catalog.pg_attribute ca
      on ca.attrelid=v_fk.conrelid and ca.attnum=k.child_attnum
    join pg_catalog.pg_attribute pa
      on pa.attrelid=v_fk.confrelid and pa.attnum=k.parent_attnum;
    execute format($sql$
      select exists(select 1 from %s child
        join public.testing_contributions parent on %s
        where parent.legacy_source_id is not null)
    $sql$,v_fk.child_table,v_join) into v_has_dependents;
    if v_has_dependents then
      raise exception 'legacy_archive_restore_v2_dependents:%',v_fk.child_table
        using errcode='55000';
    end if;
  end loop;
  if exists (
    select 1 from public.testing_contributions c
    join public.testing_report_followup f on f.contribution_id=c.id
    left join private.testing_center_legacy_archive p
      on p.source_table='public.testing_center_report_payloads'
      and p.source_id=c.legacy_source_id
    where c.legacy_source_id is not null
      and (p.source_id is null or f.consent is distinct from false
        or f.activity is distinct from true or f.credit is distinct from false
        or f.notice_read_at is not null or f.fixed_version is not null
        or f.reviewed_title is not null or f.reviewed_summary is not null
        or f.report_metadata is distinct from pg_catalog.jsonb_build_object(
          'app_version',p."row"->>'app_version',
          'os_family',p."row"->>'os_family',
          'os_version',p."row"->>'os_version',
          'module',p."row"->>'module'))
  ) then
    raise exception 'legacy_archive_restore_followup_changed' using errcode='55000';
  end if;
  delete from public.testing_report_followup f
  using public.testing_contributions c
  where f.contribution_id=c.id and c.legacy_source_id is not null;
  delete from public.testing_contributions where legacy_source_id is not null;
  alter table public.testing_contributions drop column legacy_source_id;

  -- Restore parents first and every descendant after all its FK ancestors.
  for v_relation in select * from pg_temp._legacy_relations
    order by depth,source_table loop
    select count(*) into v_expected
    from private.testing_center_legacy_archive archived
    where archived.source_table=v_relation.source_table
      and not exists(select 1 from pg_temp._legacy_skipped skipped
        where skipped.source_table=archived.source_table
          and skipped.source_id=archived.source_id);
    execute format($sql$
      insert into %s overriding system value
      select (pg_catalog.jsonb_populate_record(null::%s,a."row")).*
      from private.testing_center_legacy_archive a
      where a.source_table=%L and not exists(
        select 1 from pg_temp._legacy_skipped skipped
        where skipped.source_table=a.source_table
          and skipped.source_id=a.source_id)
      order by a.source_id
    $sql$,v_relation.source_table,v_relation.source_table,
      v_relation.source_table);
    get diagnostics v_actual=row_count;
    if v_actual<>v_expected then
      raise exception 'legacy_archive_restore_count_mismatch:%:%/%',
        v_relation.source_table,v_actual,v_expected using errcode='55000';
    end if;
    execute format($sql$
      select count(*) from private.testing_center_legacy_archive a
      where a.source_table=%L and not exists(
        select 1 from pg_temp._legacy_skipped skipped
        where skipped.source_table=a.source_table
          and skipped.source_id=a.source_id)
        and exists(
        select 1 from %s restored
        where pg_catalog.to_jsonb(restored)=a."row"
          and a.row_sha256=pg_catalog.encode(public.digest(
            pg_catalog.convert_to(pg_catalog.to_jsonb(restored)::text,'UTF8'),
            'sha256'),'hex'))
    $sql$,v_relation.source_table,v_relation.source_table) into v_actual;
    if v_actual<>v_expected then
      raise exception 'legacy_archive_restore_hash_mismatch:%:%/%',
        v_relation.source_table,v_actual,v_expected using errcode='55000';
    end if;
  end loop;
  raise notice 'legacy_archive restored rows verified; skipped deleted-owner rows=%, missing-profile rows=%; archive retained',
    v_deleted_skipped,v_orphan_skipped;
end $restore$;

commit;
