"""Real PostgreSQL role/transaction regressions in the owned disposable server."""
import json


def run_roadmap_role_regression(run, conn, admin, source_path, out):
    role = 'vantare_roadmap_publisher'
    source = source_path.read_bytes().decode('utf-8')
    assert source.rstrip().endswith('commit;')
    check = """
do $$ begin
 if not exists(select 1 from pg_roles where rolname='vantare_roadmap_publisher'
   and rolcanlogin and not rolinherit and rolconnlimit=2
   and not (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)) then
  raise exception 'roadmap_role_contract_not_met';
 end if;
end $$;
"""
    probe = out/'roadmap-role-regression.sql'
    results = []

    def sql(query, privileged=False):
        return run('psql', *(admin if privileged else conn), '-c', query).strip()

    assert sql("select current_user='postgres' and not rolsuper from pg_roles where rolname=current_user") == 't'

    def reset(attributes=None, managed=False):
        sql(f'drop role if exists {role}', True)
        if attributes is not None:
            sql(f'create role {role} {attributes}', not managed)

    def exercise(name, error=None, text=source):
        # Execute all the real DDL, then roll it back. Both positive and negative
        # cases must leave the same pre-migration catalogue, not partial RPCs.
        before = sql("select to_regprocedure('public.visual_roadmap_current_v2()') is null")
        probe.write_bytes((text.rsplit('commit;', 1)[0]+check+'rollback;\n').encode('utf-8'))
        try:
            run('psql', *conn, '-f', probe)
        except RuntimeError as exc:
            if error is None or '42501' not in str(exc) or error not in str(exc):
                raise
        else:
            assert error is None, name+' unexpectedly accepted unsafe/unmanageable role'
        assert sql("select to_regprocedure('public.visual_roadmap_current_v2()') is null") == before
        results.append(name)

    reset()
    exercise('create missing role as non-superuser')
    assert sql(f"select count(*) from pg_roles where rolname='{role}'") == '0'

    reset('login noinherit connection limit 2')
    assert sql(f"select count(*) from pg_auth_members where roleid='{role}'::regrole and member='postgres'::regrole and admin_option") == '0'
    exercise('reuse compliant role without ADMIN OPTION')

    # Demonstrate that the original production statement fails under this exact
    # role, even though the target's dangerous attributes are already false.
    original = source.split('do $roadmap_role$', 1)[0]+"""
do $$ begin create role vantare_roadmap_publisher;
exception when duplicate_object then null; end $$;
alter role vantare_roadmap_publisher login noinherit nosuperuser nocreatedb
 nocreaterole noreplication nobypassrls connection limit 2;
"""+source.split('end $roadmap_role$;', 1)[1]
    exercise('RED original ALTER ROLE rejected', '', original)

    for attributes in ('nologin noinherit connection limit 2',
                       'login inherit connection limit 2',
                       'login noinherit connection limit 3'):
        reset(attributes)
        before = sql(f"select rolcanlogin,rolinherit,rolconnlimit from pg_roles where rolname='{role}'")
        exercise('reject drift without ADMIN: '+attributes, 'roadmap_publisher_attributes_require_admin')
        assert sql(f"select rolcanlogin,rolinherit,rolconnlimit from pg_roles where rolname='{role}'") == before

    for attribute in ('superuser', 'bypassrls', 'replication', 'createdb', 'createrole'):
        reset('login noinherit connection limit 2 '+attribute)
        exercise('reject dangerous '+attribute, 'unsafe_roadmap_publisher_attributes')

    reset('nologin inherit connection limit -1', managed=True)
    exercise('repair all allowed drift with ADMIN OPTION')
    assert sql(f"select not rolcanlogin and rolinherit and rolconnlimit=-1 from pg_roles where rolname='{role}'") == 't'
    reset()
    # The actual canonical pass covers creating the role. A pre-existing safe
    # role without ADMIN is also proven by the complete migration above.
    (out/'roadmap-role-regression.json').write_text(json.dumps({'actor':'postgres', 'superuser':False,
        'cases':results, 'passed':len(results)}, indent=2)+'\n')
    print(f'Managed roadmap role: {len(results)} real PostgreSQL regressions PASS', flush=True)
