"""Real up/down and failed cutover; disposable loopback PostgreSQL only."""
import json
import subprocess
from pathlib import Path
from admin_legacy_writer_fixture import pause_legacy_writers, restore_legacy_writer_fixture_grants


OLD_ADMIN_DIGESTS = {
    'private.native_admin_account_summary': 'decd6cccddd906376d34061623c826db',
    'private.native_admin_account_v1': 'a7bba08ed56691c78f2c6b143fdf8c74',
    'private.native_admin_execute_before_creator_coupon': '1b29a41006e451c36f8688a099a04780',
    'private.native_admin_execute_v1': '5ce8f227132a712bad922f4e3b4a3867',
    'private.native_admin_reports': '7d141578ea198f965244a8447c291c41',
}


def run_admin_report_cutover(run, conn, out, bin_dir, env):
    root = Path(__file__).resolve().parents[2]
    stem = '20261103224121_isa_1910_admin_report_root'
    up = root/'supabase/migrations'/(stem+'.sql')
    down = root/'supabase/rollbacks'/(stem+'.down.sql')
    fingerprints = """select json_object_agg(n.nspname||'.'||p.proname,
      md5(replace(pg_get_functiondef(p.oid),E'\\r\\n',E'\\n')))
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.prokind='f' and p.proname like 'native_admin%'"""
    current = run('psql', *conn, '-c', fingerprints).strip()
    run('psql', *conn, '-f', down)
    previous = run('psql', *conn, '-c', fingerprints).strip()
    restored = json.loads(previous)
    assert {name: restored[name] for name in OLD_ADMIN_DIGESTS} == OLD_ADMIN_DIGESTS, 'rollback must restore all five exact pre-cutover digests'
    grants = pause_legacy_writers(run, conn)
    signature=run('psql',*conn,'-c',"select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='testing_center_report_submit_admitted'").strip()
    assert signature and '\n' not in signature

    def rejected_probe(label, setup, code, message):
        probe=out/(label+'.sql')
        probe.write_text('begin;\n'+setup+'\n\\ir '+str(up)+'\n',encoding='utf-8')
        result=subprocess.run([str(bin_dir/'psql'),*conn,'-f',str(probe)],env=env,text=True,capture_output=True,timeout=20)
        (out/(label+'.log')).write_text(result.stdout+result.stderr,encoding='utf-8')
        assert result.returncode and code in result.stderr and message in result.stderr, (label,result.stdout,result.stderr)
        assert json.loads(run('psql',*conn,'-c',fingerprints)) == json.loads(previous), label+' changed definitions'
        assert run('psql',*conn,'-c',"select to_regclass('private.admin_effects_started_target_hash') is null").strip()=='t'

    for role in ['service_role','authenticated','anon']:
        rejected_probe('legacy-writer-'+role,'grant execute on function '+signature+' to '+role+';', '55000','native_admin_legacy_writers_still_callable')
    rejected_probe('indirect-writer',"""create function public.fixture_legacy_writer() returns void language sql as
       'update public.testing_center_reports set updated_at=now() where false';
       revoke all on function public.fixture_legacy_writer() from public,service_role,authenticated,anon;
       create function public.fixture_legacy_wrapper() returns void language sql as 'select public.fixture_legacy_writer()';
       revoke all on function public.fixture_legacy_wrapper() from public;
       grant execute on function public.fixture_legacy_wrapper() to authenticated;""",'55000','native_admin_legacy_writers_still_callable')
    rejected_probe('force-rls-caller','grant all on public.testing_center_reports to authenticated; set local role authenticated;', '42501','native_admin_cutover_requires_bypassrls')

    # The transaction's only row is synthetic. A failure must roll it back too.
    probe = out/'legacy-guard-probe.sql'
    probe.write_text("""begin;
      insert into public.profiles(id) values('19107000-0000-4000-8000-000000000099');
      insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
        values('report_cutover_probe','fixture-admin','19107000-0000-4000-8000-000000000099','tester','nightly','submitted');
      \\ir """+str(up)+'\n', encoding='utf-8')
    result = subprocess.run([str(bin_dir/'psql'), *conn, '-f', str(probe)],
                            env=env, text=True, capture_output=True, timeout=20)
    (out/'legacy-guard-red.log').write_text(result.stdout+result.stderr, encoding='utf-8')
    assert result.returncode != 0 and '55000' in result.stderr and 'native_admin_legacy_reports_require_r6_mapping' in result.stderr, result.stderr
    assert json.loads(run('psql', *conn, '-c', fingerprints)) == json.loads(previous), 'guard failure changed definitions'
    assert run('psql', *conn, '-c', "select count(*) from public.profiles where id='19107000-0000-4000-8000-000000000099'").strip() == '0'
    assert run('psql', *conn, '-c', "select to_regclass('private.admin_effects_started_target_hash') is null").strip() == 't'
    run('psql', *conn, '-f', up)
    assert json.loads(run('psql', *conn, '-c', fingerprints)) == json.loads(current), 'reapply differs from cutover'
    restore_legacy_writer_fixture_grants(run, conn, grants)
    # The same predicate as claim's legacy fallback; inspect planner choice on
    # synthetic audit volume, not a timing assertion or a changed planner GUC.
    plan = run('psql', *conn, '-c', """begin;
      insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
      select gen_random_uuid(),'started',gen_random_uuid(),'19107000-0000-4000-8000-000000000001',
        'set_blocked','clerk_ban',md5(n::text)||md5((n+1)::text) from generate_series(1,5000)n;
      analyze private.admin_effects;
      explain (analyze,buffers,format json) select effect_id from private.admin_pending_effects
        where target_hash=md5('2500')||md5('2501');
      rollback;""")
    (out/'target-hash-plan.log').write_text(plan, encoding='utf-8')
    parsed, _ = json.JSONDecoder().raw_decode(plan[plan.index('['):])
    def indexes(node):
        if isinstance(node, dict):
            yield node.get('Index Name')
            for child in node.values(): yield from indexes(child)
        elif isinstance(node, list):
            for child in node: yield from indexes(child)
    assert 'admin_effects_started_target_hash' in set(indexes(parsed)), 'target_hash plan must actually use the partial index'
    print('Admin report cutover: legacy guard atomic, rollback/reapply and target_hash plan PASS', flush=True)
