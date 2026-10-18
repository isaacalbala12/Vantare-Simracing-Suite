-- #1702 / VANTA-96. Extend #1608 to the account-owned tables added later.
-- No provider calls, activation, grants or deletion of retained history.
begin;
set local lock_timeout='5s';
set local search_path='';

-- An address can move from a former contact to its newly verified account.
-- Keep the OLD + NEW UUID locks and tombstone checks, but do not treat an
-- address_changed suppression record as an immutable identity binding.
do $patch$
declare definition text; marker text := 'and not privacy_clear then';
begin
 definition:=pg_get_functiondef('private.guard_account_write()'::regprocedure);
 if position(marker in definition)=0 then raise exception 'account_guard_source_changed'; end if;
 definition:=replace(definition,marker,
  'and not privacy_clear and not (tg_table_schema=''private'' and tg_table_name=''mail_contacts'') then');
 execute definition;
end $patch$;

-- Compile only the missing eleven guards. Existing Storage, audit and privacy
-- adapters stay intact. A campaign approver is historical provenance, not the
-- owner of every recipient; never traverse that metadata FK as ownership.
do $guards$
declare r record; installed integer:=0;
begin
 for r in
  with recursive paths(rel,query,visited) as (
   select 'public.profiles'::regclass::oid,
    'select ($1->>''id'')::uuid as account' collate "C",
    array['public.profiles'::regclass::oid]
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
    visited||c.conrelid
   from paths join pg_constraint c on c.confrelid=paths.rel and c.contype='f'
   join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
   where n.nspname in ('public','private','pilot_private') and not c.conrelid=any(visited)
    and not (c.conrelid='private.mail_campaigns'::regclass and c.conname='mail_campaigns_approved_by_fkey')
  ), protected as (select distinct rel from paths), checks as (
   select c.conrelid rel,c.conname,format('(%s and not exists(select 1 from %s p where %s))',
    string_agg(format('$1->>%L is not null',ca.attname),' and ' order by ck.ord),c.confrelid::regclass,
    string_agg(format('p.%I=($1->>%L)::%s',pa.attname,ca.attname,
     format_type(pa.atttypid,pa.atttypmod)),' and ' order by ck.ord)) query
   from pg_constraint c join protected p on p.rel=c.confrelid
   cross join lateral unnest(c.conkey,c.confkey) with ordinality ck(child,parent,ord)
   join pg_attribute ca on ca.attrelid=c.conrelid and ca.attnum=ck.child
   join pg_attribute pa on pa.attrelid=c.confrelid and pa.attnum=ck.parent
   where c.contype='f' and c.conrelid in (select rel from protected)
   group by c.oid,c.conrelid,c.confrelid,c.conname
  )
  select rel,string_agg(query,' union ' order by query) query,
   (select 'select '||string_agg(query,' or ' order by conname) from checks c where c.rel=paths.rel) unresolved
  from paths where rel=any(array[
   'private.mail_contacts'::regclass,'private.mail_deliveries','private.mail_consent_budget',
   'private.admin_account_deletions','private.report_promotions','private.report_promotion_invoices',
   'private.report_promotion_invoice_gaps','private.report_promotion_failures',
   'private.report_promotion_launch_uses','private.report_promotion_changes','private.report_promotion_transfers']::regclass[])
  group by rel order by rel
 loop
  execute format('create trigger a_account_write_barrier before insert or update or delete on %s
   for each row execute function private.guard_account_write(%L,%L)',r.rel::regclass,
   'select array_agg(distinct account order by account) filter(where account is not null) from ('||r.query||') owners(account)',coalesce(r.unresolved,'select false'));
  installed:=installed+1;
 end loop;
 if installed<>11 then raise exception 'private_guard_inventory_changed: %',installed; end if;
end $guards$;

-- mail_contact_erasures is deliberately not a live-account writer: deletion
-- queues it AFTER the tombstone, and its worker must retry/expire/ACK afterwards.
-- Keep its existing global mail lock, leases, bounded PII retention and closed ACL.
comment on table private.mail_contact_erasures is
 'Post-erasure cleanup duty. Account FK is retained provenance, not live ownership. No direct API grants; queue/claim/finish/expire remain callable after tombstone.';
comment on column private.mail_campaigns.approved_by is
 'Historical approval provenance. Does not own contacts or deliveries; another live Owner may continue the campaign after this account is erased.';
commit;
