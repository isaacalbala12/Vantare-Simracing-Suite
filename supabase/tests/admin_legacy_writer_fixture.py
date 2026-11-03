"""Simulate R6's writer shutdown in the disposable cluster, never a product revoke.

Restore original grants for retained historical intake/RLS oracles only. Actual
deployment must keep R6's revokes in place. Explicit negative probes verify the
guard independently with a known RPC and a new indirect writer.
"""
LEGACY_WRITERS_SQL = r"""
with recursive routines as (
 select p.oid,n.nspname,p.proname,
  replace(lower(p.prosrc),'"','') body,
  regexp_replace(lower(p.prosrc),'[[:space:]\"]','','g') calls
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f' and n.nspname not like 'pg_%' and n.nspname<>'information_schema'
 -- These two admin bodies lose their legacy branches in THIS migration.
 and not(n.nspname='private' and p.proname in
   ('native_admin_execute_v1','native_admin_execute_before_creator_coupon'))
), writers(oid) as (
 select oid from routines where (nspname='public' and proname='testing_center_report_submit_admitted')
  -- Conservative: also catches dynamic SQL with a literal relation name.
  or (body ~ '\mtesting_center_reports\M' and body ~ '\m(insert|update|delete)\M')
 union
 select caller.oid from writers w join routines callee on callee.oid=w.oid
 join routines caller on caller.calls ~ ('(^|[^a-z0-9_])'||lower(callee.proname)||'\(')
)
select distinct oid from writers
"""


def pause_legacy_writers(run, conn):
    import json
    query = """select coalesce(json_agg(json_build_object('signature',p.oid::regprocedure::text,
      'grantee',case when a.grantee=0 then 'public' else r.rolname end,'grantable',a.is_grantable)),'[]'::json)
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      left join pg_roles r on r.oid=a.grantee where p.oid in ("""+LEGACY_WRITERS_SQL+""")
      and a.privilege_type='EXECUTE' and (a.grantee=0 or r.rolname in ('service_role','authenticated','anon'))"""
    grants = json.loads(run('psql', *conn, '-c', query))
    signatures = sorted({item['signature'] for item in grants})
    for signature in signatures:
        run('psql', *conn, '-c', f'revoke execute on function {signature} from public,service_role,authenticated,anon')
    return grants


def restore_legacy_writer_fixture_grants(run, conn, grants):
    for item in grants:
        role = 'public' if item['grantee']=='public' else '"'+item['grantee'].replace('"','""')+'"'
        option = ' with grant option' if item['grantable'] else ''
        run('psql', *conn, '-c', f"grant execute on function {item['signature']} to {role}{option}")
