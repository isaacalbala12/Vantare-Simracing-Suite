"""Combined 6/8c/10b contracts; exact rollback on disposable PostgreSQL only."""
import json
from pathlib import Path
from lint_migrations import check_migration
from commercial_admin_minimal_audit import AUDIT_STEM
from commercial_admin_confirmations import STEM as CONFIRM_STEM
STEM='20261104190009_isa_1910_admin_explicit_sync'
SNAPSHOT="""select jsonb_build_object('functions',(select jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('body',pg_get_functiondef(oid),'acl',proacl::text)) from pg_proc where pronamespace='public'::regnamespace and proname in('native_admin_payment_sync_budget','native_admin_record_payment_sync')),
 'constraints',(select jsonb_object_agg(conname,pg_get_constraintdef(oid)) from pg_constraint where conrelid='private.admin_effects'::regclass and conname in('admin_effects_action_check','admin_effects_effect_check')),
 'acl',(select coalesce(relacl,acldefault('r',relowner))::text from pg_class where oid='private.admin_effects'::regclass),
 'quota',to_regclass('private.admin_payment_sync_budget'))"""

def run_explicit_sync(run,conn,out,newlines,previous):
 root=Path(__file__).resolve().parents[2];up=root/'supabase/migrations'/(STEM+'.sql');down=root/'supabase/rollbacks'/(STEM+'.down.sql')
 assert not check_migration(up,down),check_migration(up,down)
 def sql(path):
  source=path.read_text(encoding='utf-8');copy=out/('sync-'+path.name)
  copy.write_bytes(source.replace('\n','\r\n').encode() if newlines=='crlf' else source.encode())
  result=run('psql',*conn,'-f',copy);(out/(path.name+'.log')).write_text(result,encoding='utf-8')
  assert 'not ok ' not in result and '# Looks like' not in result,result
 # Earlier historical oracles unwound both predecessors; restore the actual
 # combined runtime before validating the new journal, then unwind LIFO.
 sql(root/'supabase/migrations'/(AUDIT_STEM+'.sql'))
 sql(root/'supabase/migrations'/(CONFIRM_STEM+'.sql'))
 current=json.loads(run('psql',*conn,'-c',SNAPSHOT))
 for name in ('native_admin_confirmations.test.sql','native_admin_explicit_sync.test.sql','native_admin_payment_sync_audit.test.sql'):sql(root/'supabase/tests'/name)
 sql(down)
 assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==json.loads(previous),'sync down changed predecessor functions/ACL/constraints'
 sql(up);assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==current,'sync reapply differs'
 probe=out/'sync-retained-evidence.sql'
 probe.write_text("begin;insert into public.profiles(id)values('19100820-0000-4000-8000-000000000001');select * from public.operational_access_set('19100820-0000-4000-8000-000000000001','owner','grant','fixture','Guard owner','sync-guard',null);select public.native_admin_payment_sync_budget('19100820-0000-4000-8000-000000000001','sandbox');\n"+down.read_text(encoding='utf-8'),encoding='utf-8')
 try:sql(probe)
 except Exception as error:assert 'payment_sync_evidence_requires_forward_fix' in str(error),str(error)
 else:raise AssertionError('down deleted retained payment sync evidence')
 assert json.loads(run('psql',*conn,'-c',SNAPSHOT))==current,'rejected down changed schema'
 sql(down);sql(root/'supabase/rollbacks'/(CONFIRM_STEM+'.down.sql'));sql(root/'supabase/rollbacks'/(AUDIT_STEM+'.down.sql'))
 print('Explicit sync: combined 6/8c/10b, quota/journal/reconcile, exact down/reapply and retained-evidence guard PASS',flush=True)
