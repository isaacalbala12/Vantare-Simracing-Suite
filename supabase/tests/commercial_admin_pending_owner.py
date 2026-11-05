"""Owner pending page and conflict classes, exact function/ACL rollback."""
import json
from pathlib import Path
from lint_migrations import check_migration
from commercial_admin_minimal_audit import AUDIT_STEM
from commercial_admin_confirmations import STEM as CONFIRM_STEM
from commercial_admin_explicit_sync import STEM as SYNC_STEM
from commercial_admin_mail_list import STEM as MAIL_STEM
STEM='20261105025144_isa_1910_admin_pending_owner'
PREDECESSORS=(AUDIT_STEM,CONFIRM_STEM,SYNC_STEM,MAIL_STEM)
SNAPSHOT="""select jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('body',pg_get_functiondef(oid),'acl',proacl::text))
 from pg_proc where oid in('public.native_admin_execute(uuid,text,text,jsonb,text)'::regprocedure,'public.native_admin_claim_change(uuid,uuid,uuid)'::regprocedure)"""
def sql(run,conn,out,newlines,path):
    source=path.read_text(encoding='utf-8');replay=out/('pending-owner-'+path.name)
    replay.write_bytes(source.replace('\n','\r\n').encode() if newlines=='crlf' else source.encode())
    result=run('psql',*conn,'-f',replay);(out/(path.name+'.log')).write_text(result,encoding='utf-8')
    assert 'not ok ' not in result and '# Looks like' not in result,result

def prepare_pending_owner(run,conn,out,newlines):
    root=Path(__file__).resolve().parents[2]
    for stem in PREDECESSORS:sql(run,conn,out,newlines,root/'supabase/migrations'/(stem+'.sql'))
    return run('psql',*conn,'-c',SNAPSHOT)

def run_pending_owner(run,conn,out,newlines,previous):
    root=Path(__file__).resolve().parents[2];up=root/'supabase/migrations'/(STEM+'.sql');down=root/'supabase/rollbacks'/(STEM+'.down.sql')
    assert not check_migration(up,down),check_migration(up,down)
    current=json.loads(run('psql',*conn,'-c',SNAPSHOT))
    sql(run,conn,out,newlines,root/'supabase/tests/native_admin_pending_owner.test.sql')
    sql(run,conn,out,newlines,down)
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==json.loads(previous),'pending owner down changed original body/ACL'
    sql(run,conn,out,newlines,up)
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==current,'pending owner reapply differs'
    sql(run,conn,out,newlines,root/'supabase/tests/native_admin_pending_owner.test.sql')
    sql(run,conn,out,newlines,down)
    for stem in reversed(PREDECESSORS):sql(run,conn,out,newlines,root/'supabase/rollbacks'/(stem+'.down.sql'))
    print('Owner pending: page/whitelist/authority/read-only, distinct conflicts and exact down/reapply PASS',flush=True)
