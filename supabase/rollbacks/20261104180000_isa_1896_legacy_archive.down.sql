-- VANTA-131 / 7b2. Restore the complete archived FK subtree before the
-- later admin migration or final legacy table removal. Keep the archive.
begin;
set local lock_timeout = '5s';
set local timezone = 'UTC';

do $restore$
declare
  v_relation record;
  v_fk record;
  v_join text;
  v_has_dependents boolean;
  v_expected bigint;
  v_actual bigint;
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
    where c.account_id is distinct from (a."row"->>'reporter_user_id')::uuid
      or c.channel is distinct from a."row"->>'channel'
      or c.created_at is distinct from (a."row"->>'created_at')::timestamptz
      or c.title is distinct from pg_catalog.left(coalesce(nullif(
        pg_catalog.btrim(p."row"->>'action_text'),''),'Informe legacy'),120)
      or c.body is distinct from pg_catalog.left(coalesce(nullif(
        pg_catalog.btrim('Esperado: '||(p."row"->>'expected_text')||
          E'\nObservado: '||(p."row"->>'observed_text')),''),
        'Informe legacy '||a.source_id),1000)
      or c.state is distinct from case when a."row"->>'state' in
        ('draft','submitted') then 'received' else 'reviewing' end
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
    from private.testing_center_legacy_archive
    where source_table=v_relation.source_table;
    execute format($sql$
      insert into %s overriding system value
      select (pg_catalog.jsonb_populate_record(null::%s,a."row")).*
      from private.testing_center_legacy_archive a
      where a.source_table=%L order by a.source_id
    $sql$,v_relation.source_table,v_relation.source_table,
      v_relation.source_table);
    get diagnostics v_actual=row_count;
    if v_actual<>v_expected then
      raise exception 'legacy_archive_restore_count_mismatch:%:%/%',
        v_relation.source_table,v_actual,v_expected using errcode='55000';
    end if;
    execute format($sql$
      select count(*) from private.testing_center_legacy_archive a
      where a.source_table=%L and exists(
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
  raise notice 'legacy_archive restored rows verified; archive retained';
end $restore$;

commit;
