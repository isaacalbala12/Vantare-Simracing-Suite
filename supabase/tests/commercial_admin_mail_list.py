"""Owner panel purity and exact rollback; only an owned local migration replay."""
import json
from pathlib import Path
from lint_migrations import check_migration
from commercial_admin_minimal_audit import AUDIT_STEM
from commercial_admin_confirmations import STEM as CONFIRM_STEM

STEM='20261104215424_isa_1910_admin_mail_list_read'
SNAPSHOT="""select jsonb_build_object('body',pg_get_functiondef(oid),'acl',proacl::text)
 from pg_proc where oid='public.mail_admin_execute(uuid,text,jsonb,text)'::regprocedure"""

def prepare_mail_list(run,conn):
    root=Path(__file__).resolve().parents[2]
    # Historical oracles unwind their SQL; restore the actual predecessors first.
    for stem in (AUDIT_STEM,CONFIRM_STEM):
        run('psql',*conn,'-f',root/'supabase/migrations'/(stem+'.sql'))
    return run('psql',*conn,'-c',SNAPSHOT)

def run_mail_list(run,conn,out,newlines,previous):
    root=Path(__file__).resolve().parents[2]
    up=root/'supabase/migrations'/(STEM+'.sql');down=root/'supabase/rollbacks'/(STEM+'.down.sql')
    assert not check_migration(up,down),check_migration(up,down)
    def sql(path):
        replay=out/('mail-list-'+path.name)
        source=path.read_text(encoding='utf-8')
        replay.write_bytes(source.replace('\n','\r\n').encode() if newlines=='crlf' else source.encode())
        result=run('psql',*conn,'-f',replay)
        (out/(path.name+'.log')).write_text(result,encoding='utf-8')
        assert 'not ok ' not in result and '# Looks like' not in result,result
    current=json.loads(run('psql',*conn,'-c',SNAPSHOT))
    sql(root/'supabase/tests/native_admin_mail_list_purity.test.sql')
    sql(root/'supabase/tests/native_admin_confirmations.test.sql')
    sql(down)
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==json.loads(previous),'mail list down changed predecessor body/ACL'
    baseline=run('psql',*conn,'-f',root/'supabase/tests/native_admin_mail_list_purity.test.sql')
    (out/'native_admin_mail_list_purity.before.log').write_text(baseline,encoding='utf-8')
    assert sum(line.startswith('not ok ') for line in baseline.splitlines())==4,'historical maintenance RED control must fail four checks'
    sql(up)
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==current,'mail list reapply differs'
    sql(root/'supabase/tests/native_admin_mail_list_purity.test.sql')
    sql(down);sql(root/'supabase/rollbacks'/(CONFIRM_STEM+'.down.sql'));sql(root/'supabase/rollbacks'/(AUDIT_STEM+'.down.sql'))
    print('Mail list: pure queue/audit, explicit maintenance, owner/expired/ACL, confirmations and exact down/reapply PASS',flush=True)
