"""Step 6 behavior and exact rollback on a disposable migration replay."""
import json
from pathlib import Path
from lint_migrations import check_migration

STEM='20261104181354_isa_1910_admin_confirmations'
SNAPSHOT="""select jsonb_build_object('functions',(select jsonb_object_agg(oid::regprocedure::text,
 jsonb_build_object('body',pg_get_functiondef(oid),'acl',proacl::text)) from pg_proc
 where oid in('public.mail_admin_execute(uuid,text,jsonb,text)'::regprocedure,
 'public.native_admin_execute(uuid,text,text,jsonb,text)'::regprocedure)),
 'constraint',(select pg_get_constraintdef(oid) from pg_constraint where conrelid='private.mail_campaigns'::regclass and conname='mail_campaigns_state_check'),
 'table_acl',(select coalesce(relacl,acldefault('r',relowner))::text from pg_class where oid='private.mail_campaigns'::regclass))"""

def run_confirmations(run,conn,out,previous,newlines):
    root=Path(__file__).resolve().parents[2]
    up=root/'supabase/migrations'/(STEM+'.sql'); down=root/'supabase/rollbacks'/(STEM+'.down.sql')
    assert not check_migration(up,down),check_migration(up,down)
    def sql(path):
        source=path.read_text(encoding='utf-8'); replay=out/('confirmations-'+path.name)
        replay.write_bytes(source.replace('\n','\r\n').encode() if newlines=='crlf' else source.encode())
        result=run('psql',*conn,'-f',replay)
        (out/(path.name+'.log')).write_text(result,encoding='utf-8')
        assert 'not ok ' not in result and '# Looks like' not in result,result
    current=json.loads(run('psql',*conn,'-c',SNAPSHOT))
    sql(root/'supabase/tests/native_admin_confirmations.test.sql')
    sql(down)
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==json.loads(previous),'confirmations down changed bodies/ACL/constraint'
    sql(up)
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==current,'confirmations reapply differs'
    sql(root/'supabase/tests/native_admin_confirmations.test.sql')
    run('psql',*conn,'-c',"insert into private.mail_campaigns(id,environment,state) values('19100600-0000-4000-8000-000000000099','sandbox','canceled')")
    try:
        sql(down)
    except Exception as error:
        assert 'canceled_campaigns_require_forward_fix' in str(error),str(error)
    else:
        raise AssertionError('down accepted canceled campaigns')
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==current,'rejected down changed schema/ACL'
    run('psql',*conn,'-c',"delete from private.mail_campaigns where id='19100600-0000-4000-8000-000000000099'")
    # Historical payload/digest oracles keep their original contract.
    sql(down)
    print('Admin confirmations: behavior, exact rollback/ACL/constraint and reapply PASS',flush=True)
