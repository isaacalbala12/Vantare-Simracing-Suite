"""Step 4 up/down fingerprints, ACL and atomic drift; disposable DB only."""
import json
from pathlib import Path
import subprocess

STEM = '20261104070000_isa_1910_admin_owner_policy'
SNAPSHOT = """select json_object_agg(p.proname,json_build_object(
 'digest',md5(replace(pg_get_functiondef(p.oid),E'\\r\\n',E'\\n')),
 'acl',p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in
 ('native_admin_execute_v1','native_admin_account_summary',
  'native_admin_execute_before_creator_coupon','native_admin_account_deletion')"""


def run_owner_policy_regressions(run, conn, out, bin_dir, env, previous):
    root=Path(__file__).resolve().parents[2]
    up=root/'supabase/migrations'/(STEM+'.sql')
    down=root/'supabase/rollbacks'/(STEM+'.down.sql')
    current=json.loads(run('psql',*conn,'-c',SNAPSHOT))
    run('psql',*conn,'-f',down)
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==previous, 'policy down changed pre-step digests/ACL'
    probe=out/'owner-policy-drift.sql'
    probe.write_text("""begin;
      do $drift$declare body text; begin
       body:=pg_get_functiondef('private.native_admin_account_summary(uuid,text,text)'::regprocedure);
       execute replace(body,$before$'owner',exists$before$,$after$'owner', exists$after$);
      end $drift$;
      \ir """+str(up)+'\n',encoding='utf-8')
    result=subprocess.run([str(bin_dir/'psql'),*conn,'-f',str(probe)],env=env,text=True,capture_output=True,timeout=20)
    (out/'owner-policy-drift.log').write_text(result.stdout+result.stderr,encoding='utf-8')
    assert result.returncode and '55000' in result.stderr and 'native_admin_owner_policy_source_drift' in result.stderr, result.stderr
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==previous, 'failed policy patch was not atomic'
    run('psql',*conn,'-f',up)
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==current, 'policy up differs on reapply'
    for name in current:
        assert current[name]['acl']==previous[name]['acl'], 'policy changed ACL: '+name
    print('Admin owner policy: exact four-body rollback/ACL, atomic drift and reapply PASS',flush=True)
