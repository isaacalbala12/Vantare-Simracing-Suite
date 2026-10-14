-- #1608 r4. One UUID barrier for SQL, RPC, Edge and Storage writers.
-- Prepared/local only. No trust registry, deployment or real data changes.
begin;
set local search_path='';
create index account_identities_by_account on public.account_identities(account_id);

create function private.lock_account_write(p_account uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  if p_account is null then return false; end if;
  -- A snapshot predating the lock cannot prove absence of a committed tombstone.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise sqlstate '25001' using message='account_write_read_committed_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text,1608));
  return exists(select 1 from public.account_identities
    where account_id=p_account and deleted_at is not null);
end $$;
revoke all on function private.lock_account_write(uuid) from public,anon,authenticated,service_role;

-- Trigger arguments contain migration-generated SELECTs, never caller input.
-- Both owners are checked on UPDATE, so reassignment cannot evade the barrier.
create function private.guard_account_write() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare account uuid; accounts uuid[]; previous uuid[]; current_owners uuid[]; unresolved boolean; deleted boolean:=false;
begin
  if tg_op<>'DELETE' then
    execute tg_argv[1] into unresolved using to_jsonb(new);
    if unresolved then raise sqlstate '23503' using message='account_owner_unresolved'; end if;
  end if;
  execute tg_argv[0] into accounts using to_jsonb(new);
  if tg_op in ('UPDATE','DELETE') then
    execute tg_argv[0] into previous using to_jsonb(old);
  end if;
  if tg_op='UPDATE' and not coalesce(previous,'{}'::uuid[]) <@ coalesce(accounts,'{}'::uuid[]) then
    raise sqlstate '28000' using message='account_owner_is_immutable';
  end if;
  if tg_table_name='account_identities' and tg_op='UPDATE' then
    if new.issuer<>old.issuer or new.subject<>old.subject then
      raise sqlstate '28000' using message='account_identity_is_durable';
    end if;
  end if;
  for account in select distinct x from unnest(accounts || coalesce(previous,'{}'::uuid[])) x
    where x is not null order by x
  loop
    -- Do not short circuit: acquire every owner lock in UUID order.
    if private.lock_account_write(account) then deleted:=true; end if;
  end loop;
  execute tg_argv[0] into current_owners using to_jsonb(new);
  if current_owners is distinct from accounts then
    raise sqlstate '40001' using message='account_owner_changed';
  end if;
  if tg_op='DELETE' then
    if tg_table_name in ('profiles','account_identities') then
      raise sqlstate '28000' using message='account_identity_is_durable';
    end if;
    return old; -- Removal/Storage ACK remains possible after a tombstone.
  end if;
  if deleted then
    -- Keep the existing financial projection contract: history survives revoked.
    if tg_table_name in ('billing_access_grants','user_entitlements','operational_access_assignments') then
      new.status:='revoked';
      if tg_table_name='operational_access_assignments' then
        new.revoked_at:=coalesce(new.revoked_at,now());
        new.revoked_by:='clerk:webhook'; new.revoke_reason:='clerk_user_deleted';
      else
        new.metadata:='{}'::jsonb;
      end if;
      return new;
    end if;
    -- Deletion marks aliases one row at a time, under the same account lock.
    if tg_table_name='account_identities' and tg_op='UPDATE' then
      if new.deleted_at is not null and old.deleted_at is null
        and (to_jsonb(new)-'deleted_at'-'user_event_at')=(to_jsonb(old)-'deleted_at'-'user_event_at') then
        return new;
      end if;
    end if;
    raise sqlstate '28000' using message='account_deleted';
  end if;
  return new;
end $$;
revoke all on function private.guard_account_write() from public,anon,authenticated,service_role;

-- Compile all FK paths back to profiles, including composite FKs, into each
-- table's trigger. No catalog traversal or unindexed JSON matching at runtime.
-- Extra roots are UUID links without FKs in the historical schema.
do $$
declare r record;
begin
  for r in
    with recursive seeds(rel,query) as (
      select 'public.profiles'::regclass::oid, 'select ($1->>''id'')::uuid as account' collate "C"
      union all select 'public.operational_access_audit'::regclass,'select ($1->>''target_user_id'')::uuid'
      union all select 'public.operational_legacy_grant_retirements'::regclass,'select ($1->>''target_user_id'')::uuid'
      union all select 'storage.objects'::regclass,$q$select nullif($1->>'owner_id','')::uuid
        union select b.reporter_user_id from public.testing_center_screenshot_evidence e
        join public.testing_center_evidence_batches b using(batch_id)
        where $1->>'bucket_id'='testing-center-evidence' and e.object_path=$1->>'name'$q$
      union all select 'private.testing_report_attempts'::regclass,
        'select case when $1->>''scope''=''account'' then ($1->>''subject'')::uuid end'
      union all select 'public.billing_webhook_inbox'::regclass,$q$
        select c.user_id from public.billing_customers c
        where c.provider=$1->>'provider' and c.environment=$1->>'environment'
          and c.provider_customer_id in ($1#>>'{payload,data,customer_id}',$1#>>'{payload,data,customer,id}')
        union select b.user_id from public.billing_checkout_bindings b
        where b.environment=$1->>'environment' and b.provider_checkout_id=$1#>>'{payload,data,checkout_id}'
        union select o.user_id from public.billing_orders o where o.provider=$1->>'provider'
          and o.environment=$1->>'environment' and o.provider_order_id in
            ($1#>>'{payload,data,order_id}',case when $1->>'event_type' like 'order.%' then $1#>>'{payload,data,id}' end)
        union select s.user_id from public.billing_subscriptions s where s.provider=$1->>'provider'
          and s.environment=$1->>'environment' and s.provider_subscription_id in
            ($1#>>'{payload,data,subscription_id}',case when $1->>'event_type' like 'subscription.%' then $1#>>'{payload,data,id}' end)
      $q$
      union all select 'public.testing_center_idempotency'::regclass,$q$
        select r.reporter_user_id from public.testing_center_reports r
        left join public.testing_center_technical_issues i on i.report_id=r.report_id
        where $1->>'aggregate_id' in (r.report_id,i.technical_issue_id)$q$
      union all select 'public.testing_center_audit'::regclass,$q$
        select r.reporter_user_id from public.testing_center_reports r
        left join public.testing_center_technical_issues i on i.report_id=r.report_id
        where $1->>'aggregate_id' in (r.report_id,i.technical_issue_id)$q$
      union all select 'public.admin_audit_log'::regclass,$q$
        select p.id from public.profiles p where p.id::text=$1->>'target'
        union select r.reporter_user_id from public.testing_center_reports r where r.report_id=$1->>'target'
        union select (v#>>'{}')::uuid from jsonb_path_query($1,'$.**.account_id') v
        where v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'$q$
    ), paths(rel,query,visited) as (
      select rel,query,array[rel] from seeds
      union all
      select c.conrelid,
        format('select a.account from %s p%s cross join lateral (%s) a(account) where %s',
          c.confrelid::regclass,cardinality(visited),
          replace(paths.query,'$1',format('to_jsonb(p%s)',cardinality(visited))),
          (select string_agg(format('p%s.%I=($1->>%L)::%s',cardinality(visited),pa.attname,ca.attname,
             format_type(pa.atttypid,pa.atttypmod)),' and ' order by ck.ord)
           from unnest(c.conkey,c.confkey) with ordinality ck(child,parent,ord)
           join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=ck.child
           join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=ck.parent)),
        visited || c.conrelid
      from paths join pg_constraint c on c.confrelid=paths.rel and c.contype='f'
      join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname in ('public','private','storage') and not c.conrelid=any(visited)
    ), protected as (select distinct rel from paths), checks as (
      select c.conrelid rel,format('(%s and not exists(select 1 from %s p where %s))',
        string_agg(format('$1->>%L is not null',ca.attname),' and ' order by ck.ord),
        c.confrelid::regclass,
        string_agg(format('p.%I=($1->>%L)::%s',pa.attname,ca.attname,
          format_type(pa.atttypid,pa.atttypmod)),' and ' order by ck.ord)) query
      from pg_constraint c join protected p on p.rel=c.confrelid
      cross join lateral unnest(c.conkey,c.confkey) with ordinality ck(child,parent,ord)
      join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=ck.child
      join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=ck.parent
      where c.contype='f' and c.conrelid in (select rel from protected)
      group by c.oid,c.conrelid,c.confrelid
    )
    select rel,string_agg(query,' union ') query,
      (select 'select '||string_agg(query,' or ') from checks c where c.rel=paths.rel) unresolved
      from paths group by rel order by rel
  loop
    execute format('create trigger a_account_write_barrier before insert or update or delete on %s
      for each row execute function private.guard_account_write(%L,%L)',r.rel::regclass,
      'select array_agg(distinct account order by account) filter(where account is not null) from ('||r.query||') owners(account)',coalesce(r.unresolved,'select false'));
  end loop;
end $$;

-- The shared trigger replaces the old, grant-only barrier.
drop trigger deleted_account_grants on public.billing_access_grants;
drop trigger deleted_account_entitlements on public.user_entitlements;
drop trigger deleted_account_operational on public.operational_access_assignments;
drop function private.guard_deleted_account_grant();

-- Erase under the UUID lock, then mark all aliases. No writer can interleave;
-- cleanup needs no GUC bypass, privileged flag or caller-controlled exemption.
do $$
declare definition text; mark text := $mark$    update public.account_identities set deleted_at = p_event_at, user_event_at = greatest(user_event_at,p_event_at)
      where account_id = account;
$mark$;
begin
  definition:=pg_get_functiondef('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure);
  if position(mark in definition)=0 then raise exception 'deletion_body_changed'; end if;
  definition:=replace(definition,mark,'');
  definition:=replace(definition,
    '  account := private.resolve_account_identity(p_issuer, p_subject);',
    '  account := identity.account_id;
  if account is null then account := private.resolve_account_identity(p_issuer, p_subject); end if;');
  definition:=replace(definition,'    -- Preserve private financial/support IDs',mark||'    -- Preserve private financial/support IDs');
  execute definition;
end $$;

-- Entry locks precede device-row locks. Identity resolution for bearer issuance
-- also revalidates after waiting; a read-only resolver cannot return stale life.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('private.resolve_account_identity(text,text)'::regprocedure);
  definition:=replace(definition,'  return account;',
    '  if private.lock_account_write(account) then raise sqlstate ''28000'' using message=''account_deleted''; end if; return account;');
  execute definition;
end $$;
create or replace function private.resolve_current_account()
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare account uuid:=private.current_account();
begin
  if account is null then raise sqlstate '28000' using message='not_authenticated'; end if;
  if private.lock_account_write(account) then raise sqlstate '28000' using message='account_deleted'; end if;
  return account;
end $$;
-- claim_account_device INSERT reaches the trigger before acquiring device rows.
-- reset calls resolve_current_account before its SELECT FOR UPDATE.
commit;
