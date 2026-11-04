"""Explicit sandbox sync quota; no provider or hosted database."""
from pathlib import Path
from lint_migrations import check_migration
STEM='20261104190009_isa_1910_admin_explicit_sync'

def run_explicit_sync(run,conn,out,newlines):
 root=Path(__file__).resolve().parents[2];up=root/'supabase/migrations'/(STEM+'.sql');down=root/'supabase/rollbacks'/(STEM+'.down.sql')
 assert not check_migration(up,down),check_migration(up,down)
 def sql(path):
  source=path.read_text(encoding='utf-8');copy=out/('sync-'+path.name)
  copy.write_bytes(source.replace('\n','\r\n').encode() if newlines=='crlf' else source.encode())
  result=run('psql',*conn,'-f',copy);(out/(path.name+'.log')).write_text(result,encoding='utf-8')
  assert 'not ok ' not in result and '# Looks like' not in result,result
 fingerprint="select pg_get_functiondef('public.native_admin_payment_sync_budget(uuid,text)'::regprocedure)||proacl::text from pg_proc where oid='public.native_admin_payment_sync_budget(uuid,text)'::regprocedure"
 before=run('psql',*conn,'-c',fingerprint)
 sql(root/'supabase/tests/native_admin_explicit_sync.test.sql');sql(down)
 assert run('psql',*conn,'-c',"select to_regclass('private.admin_payment_sync_budget') is null and to_regprocedure('public.native_admin_payment_sync_budget(uuid,text)') is null").strip()=='t'
 sql(up);assert run('psql',*conn,'-c',fingerprint)==before,'sync reapply changed body/ACL'
 print('Explicit sync: owner/expired/anon/production, rolling quota, rollback/reapply and ADR0106 PASS',flush=True)
