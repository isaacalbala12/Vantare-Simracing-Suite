-- VANTA-131 / 7b2. The 7b1 writer closure must already be applied.
-- Archive the complete legacy report FK subtree, map admissible reports to v2,
-- verify every archived row, then drain children before their parents.
begin;
set local lock_timeout = '5s';
set local timezone = 'UTC';

create table if not exists private.testing_center_legacy_archive (
  source_table text not null,
  source_id text not null,
  "row" jsonb not null,
  row_sha256 text not null check (row_sha256 ~ '^[0-9a-f]{64}$'),
  archived_at timestamptz not null default clock_timestamp(),
  primary key (source_table,source_id)
);
alter table private.testing_center_legacy_archive enable row level security;
revoke all on table private.testing_center_legacy_archive
  from public, anon, authenticated, service_role;
lock table private.testing_center_legacy_archive in access exclusive mode;

alter table public.testing_contributions
  add column if not exists legacy_source_id text;
create unique index if not exists testing_contributions_legacy_source_id_key
  on public.testing_contributions(legacy_source_id)
  where legacy_source_id is not null;

do $archive$
declare
  v_relation record;
  v_fk record;
  v_pk_expr text;
  v_join text;
  v_added integer;
  v_round integer;
  v_expected bigint;
  v_actual bigint;
  v_eligible bigint;
  v_mapped bigint;
  v_parent_count bigint;
  v_deleted bigint;
begin
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
  -- These two ledgers use aggregate_id instead of an FK to the issue.
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
    raise exception 'legacy_archive_fk_cycle' using errcode='55000';
  end if;

  -- Lock the parent first and every FK descendant before taking a snapshot.
  for v_relation in select * from pg_temp._legacy_relations
    order by depth,source_table loop
    execute format('lock table %s in access exclusive mode',v_relation.source_table);
  end loop;
  create temp table _legacy_rows (
    relid oid not null,
    source_table text not null,
    source_id text not null,
    "row" jsonb not null,
    row_sha256 text not null,
    primary key (relid,source_id)
  ) on commit drop;
  insert into pg_temp._legacy_rows(relid,source_table,source_id,"row",row_sha256)
  select 'public.testing_center_reports'::regclass::oid,
    'public.testing_center_reports',r.report_id,pg_catalog.to_jsonb(r),
    pg_catalog.encode(public.digest(
      pg_catalog.convert_to(pg_catalog.to_jsonb(r)::text,'UTF8'),'sha256'),'hex')
  from public.testing_center_reports r;

  -- Follow every FK from captured rows. This includes indirect agent, Linear,
  -- validation and privacy ledgers without draining unrelated domain rows.
  loop
    v_round:=0;
    for v_fk in
      select f.*,child.source_table as child_table
      from pg_catalog.pg_constraint f
      join pg_temp._legacy_relations child on child.relid=f.conrelid
      join pg_temp._legacy_relations parent on parent.relid=f.confrelid
      where f.contype='f'
      order by child.depth,child.source_table,f.oid
    loop
      select case when count(*)=1 then format('c.%I::text',max(a.attname))
        else 'pg_catalog.jsonb_build_array('||
          string_agg(format('c.%I',a.attname),',' order by k.ord)||')::text'
        end into v_pk_expr
      from pg_catalog.pg_constraint pk
      cross join lateral pg_catalog.unnest(pk.conkey)
        with ordinality as k(attnum,ord)
      join pg_catalog.pg_attribute a
        on a.attrelid=pk.conrelid and a.attnum=k.attnum
      where pk.contype='p' and pk.conrelid=v_fk.conrelid;
      if v_pk_expr is null then
        raise exception 'legacy_archive_missing_pk:%',v_fk.child_table
          using errcode='55000';
      end if;
      select string_agg(format(
        'pg_catalog.to_jsonb(c.%I) = p."row"->%L',ca.attname,pa.attname),
        ' and ' order by k.ord) into v_join
      from unnest(v_fk.conkey,v_fk.confkey)
        with ordinality as k(child_attnum,parent_attnum,ord)
      join pg_catalog.pg_attribute ca
        on ca.attrelid=v_fk.conrelid and ca.attnum=k.child_attnum
      join pg_catalog.pg_attribute pa
        on pa.attrelid=v_fk.confrelid and pa.attnum=k.parent_attnum;
      execute format($sql$
        insert into pg_temp._legacy_rows(relid,source_table,source_id,"row",row_sha256)
        select %s::oid,%L,%s,pg_catalog.to_jsonb(c),
          pg_catalog.encode(public.digest(
            pg_catalog.convert_to(pg_catalog.to_jsonb(c)::text,'UTF8'),
            'sha256'),'hex')
        from %s c join pg_temp._legacy_rows p
          on p.relid=%s::oid and %s
        on conflict do nothing
      $sql$,v_fk.conrelid,v_fk.child_table,v_pk_expr,v_fk.child_table,
        v_fk.confrelid,v_join);
      get diagnostics v_added=row_count;
      v_round:=v_round+v_added;
    end loop;
    exit when v_round=0;
  end loop;
  insert into pg_temp._legacy_rows(relid,source_table,source_id,"row",row_sha256)
  select 'public.testing_center_audit'::regclass::oid,
    'public.testing_center_audit',a.audit_id,pg_catalog.to_jsonb(a),
    pg_catalog.encode(public.digest(
      pg_catalog.convert_to(pg_catalog.to_jsonb(a)::text,'UTF8'),'sha256'),'hex')
  from public.testing_center_audit a
  join pg_temp._legacy_rows issue
    on issue.relid='public.testing_center_technical_issues'::regclass
    and a.aggregate_id=issue.source_id;
  insert into pg_temp._legacy_rows(relid,source_table,source_id,"row",row_sha256)
  select 'public.testing_center_idempotency'::regclass::oid,
    'public.testing_center_idempotency',
    pg_catalog.jsonb_build_array(i.aggregate_id,i.idempotency_key)::text,
    pg_catalog.to_jsonb(i),pg_catalog.encode(public.digest(
      pg_catalog.convert_to(pg_catalog.to_jsonb(i)::text,'UTF8'),'sha256'),'hex')
  from public.testing_center_idempotency i
  join pg_temp._legacy_rows issue
    on issue.relid='public.testing_center_technical_issues'::regclass
    and i.aggregate_id=issue.source_id;

  insert into private.testing_center_legacy_archive
    (source_table,source_id,"row",row_sha256)
  select source_table,source_id,"row",row_sha256
  from pg_temp._legacy_rows
  on conflict (source_table,source_id) do nothing;
  select count(*) into v_expected from pg_temp._legacy_rows;
  select count(*) into v_actual
  from pg_temp._legacy_rows source
  join private.testing_center_legacy_archive archived
    using (source_table,source_id)
  where archived."row"=source."row"
    and archived.row_sha256=source.row_sha256
    and archived.row_sha256=pg_catalog.encode(public.digest(
      pg_catalog.convert_to(archived."row"::text,'UTF8'),'sha256'),'hex');
  if v_actual<>v_expected then
    raise exception 'legacy_archive_hash_or_count_mismatch:%/%',
      v_actual,v_expected using errcode='55000';
  end if;

  -- Only report_<sha256> rows with a live v2 account can enter the new model.
  -- Everything, including inadmissible rows and larger payload fields, remains
  -- intact in the private archive. No double write to the old tables occurs.
  select count(*) into v_eligible
  from public.testing_center_reports r
  join public.profiles account on account.id=r.reporter_user_id
  where r.report_id ~ '^report_[0-9a-f]{64}$'
    and not exists(select 1 from public.account_identities identity_row
      where identity_row.account_id=r.reporter_user_id
        and identity_row.deleted_at is not null);
  -- The normal five/day trigger would reject pilot history and replace its
  -- original created_at. Access-exclusive locking prevents concurrent intake.
  alter table public.testing_contributions disable trigger testing_report_limit;
  insert into public.testing_contributions
    (id,account_id,channel,title,body,state,created_at,legacy_source_id)
  select pg_catalog.gen_random_uuid(),r.reporter_user_id,r.channel,
    pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p.action_text),''),
      'Informe legacy'),120),
    pg_catalog.left(coalesce(nullif(pg_catalog.btrim(
      'Esperado: '||p.expected_text||E'\nObservado: '||p.observed_text),''),
      'Informe legacy '||r.report_id),1000),
    case when r.state in ('draft','submitted') then 'received' else 'reviewing' end,
    r.created_at,r.report_id
  from public.testing_center_reports r
  left join public.testing_center_report_payloads p on p.report_id=r.report_id
  join public.profiles account on account.id=r.reporter_user_id
  where r.report_id ~ '^report_[0-9a-f]{64}$'
    and not exists(select 1 from public.account_identities identity_row
      where identity_row.account_id=r.reporter_user_id
        and identity_row.deleted_at is not null)
  on conflict (legacy_source_id) where legacy_source_id is not null do nothing;
  alter table public.testing_contributions enable trigger testing_report_limit;
  select count(*) into v_mapped
  from public.testing_center_reports r
  left join public.testing_center_report_payloads p on p.report_id=r.report_id
  join public.profiles account on account.id=r.reporter_user_id
  join public.testing_contributions c on c.legacy_source_id=r.report_id
    and c.account_id=r.reporter_user_id and c.channel=r.channel
    and c.title=pg_catalog.left(coalesce(
      nullif(pg_catalog.btrim(p.action_text),''),'Informe legacy'),120)
    and c.body=pg_catalog.left(coalesce(nullif(pg_catalog.btrim(
      'Esperado: '||p.expected_text||E'\nObservado: '||p.observed_text),''),
      'Informe legacy '||r.report_id),1000)
    and c.state=case when r.state in ('draft','submitted')
      then 'received' else 'reviewing' end
    and c.created_at=r.created_at
  where r.report_id ~ '^report_[0-9a-f]{64}$'
    and not exists(select 1 from public.account_identities identity_row
      where identity_row.account_id=r.reporter_user_id
        and identity_row.deleted_at is not null);
  if v_mapped<>v_eligible then
    raise exception 'legacy_archive_mapping_mismatch:%/%',
      v_mapped,v_eligible using errcode='55000';
  end if;
  insert into public.testing_report_followup
    (contribution_id,consent,report_metadata)
  select c.id,false,pg_catalog.jsonb_build_object(
    'app_version',p.app_version,'os_family',p.os_family,
    'os_version',p.os_version,'module',p.module)
  from public.testing_center_reports r
  join public.testing_center_report_payloads p on p.report_id=r.report_id
  join public.testing_contributions c on c.legacy_source_id=r.report_id
  on conflict (contribution_id) do nothing;
  if exists(
    select 1 from public.testing_center_reports r
    join public.testing_center_report_payloads p on p.report_id=r.report_id
    join public.testing_contributions c on c.legacy_source_id=r.report_id
    left join public.testing_report_followup f on f.contribution_id=c.id
    where f.contribution_id is null or f.consent is distinct from false
      or f.report_metadata is distinct from pg_catalog.jsonb_build_object(
        'app_version',p.app_version,'os_family',p.os_family,
        'os_version',p.os_version,'module',p.module)
  ) then
    raise exception 'legacy_archive_metadata_mismatch' using errcode='55000';
  end if;

  for v_relation in select * from pg_temp._legacy_relations
    order by depth desc,source_table desc loop
    execute format($sql$
      delete from %s source using pg_temp._legacy_rows captured
      where captured.relid=%s::oid and pg_catalog.to_jsonb(source)=captured."row"
    $sql$,v_relation.source_table,v_relation.relid);
    get diagnostics v_deleted=row_count;
    select count(*) into v_expected from pg_temp._legacy_rows
      where relid=v_relation.relid;
    if v_deleted<>v_expected then
      raise exception 'legacy_archive_delete_mismatch:%:%/%',
        v_relation.source_table,v_deleted,v_expected using errcode='55000';
    end if;
  end loop;
  if exists(select 1 from public.testing_center_reports) then
    raise exception 'legacy_archive_parent_not_empty' using errcode='55000';
  end if;
  select count(*) into v_parent_count from pg_temp._legacy_rows
    where source_table='public.testing_center_reports';
  raise notice 'legacy_archive rows=%, parent=%, mapped=%, archive_only=%',
    v_actual,v_parent_count,v_mapped,v_parent_count-v_mapped;
end $archive$;

commit;
