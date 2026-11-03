"""Real up/down and failed cutover; disposable loopback PostgreSQL only."""
import json
import subprocess
from pathlib import Path


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
    assert json.loads(previous) != json.loads(current), 'rollback must restore previous definitions'
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
    print('Admin report cutover: legacy guard atomic, rollback/reapply and target_hash plan PASS', flush=True)
