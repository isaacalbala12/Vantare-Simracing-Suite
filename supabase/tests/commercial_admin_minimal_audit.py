"""Full-chain SQL, minimized upgrade data and exact schema/ACL rollback."""
import json
import re
from pathlib import Path
from commercial_admin_audit_race import run_audit_erasure_races

AUDIT_STEM = '20261104145436_isa_1910_admin_audit_minimal'
AUDIT_SNAPSHOT = """select jsonb_build_object(
 'triggers',(select jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,
 'name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled) order by tgrelid::regclass::text,tgname)
 from pg_trigger where not tgisinternal and tgrelid=any(array[
 'public.admin_audit_log'::regclass,'private.mail_audit'::regclass,'private.admin_effects'::regclass,
 'public.account_identities'::regclass])),
 'tables',(select jsonb_agg(jsonb_build_object('name',oid::regclass::text,'owner',relowner,'acl',relacl,'rls',relrowsecurity)
 order by oid::regclass::text) from pg_class where oid=any(array[
 'public.admin_audit_log'::regclass,'private.mail_audit'::regclass,'private.admin_effects'::regclass])),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,
 'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',p.proowner) order by p.oid::regprocedure::text)
 from pg_proc p where p.oid='public.native_admin_execute(uuid,text,text,jsonb,text)'::regprocedure))"""


def audit_schema(run, conn):
    args=[]
    for option in ['-h','-p','-U','-d']:
        args.extend([option,conn[conn.index(option)+1]])
    schema=run('pg_dump',*args,'--schema-only')
    return re.sub(r'(?m)^\\(?:un)?restrict .*\n','',schema)


def seed_audit_upgrade(run, conn):
    run('psql',*conn,'-c',"""insert into public.profiles(id) values
     ('19101090-0000-4000-8000-000000000001'),('19101090-0000-4000-8000-000000000002');
     insert into private.clerk_issuers(issuer,authorized_parties,enabled)
      values('https://audit-upgrade.invalid',array['https://app.invalid'],true);
     insert into public.account_identities(issuer,subject,account_id) values
      ('https://audit-upgrade.invalid','user_audit_upgrade','19101090-0000-4000-8000-000000000002');
     insert into public.admin_audit_log(id,actor_account_id,action,target,before_value,after_value)
      values('19101090-0000-4000-8000-000000000011','19101090-0000-4000-8000-000000000001',
      'set_tester','19101090-0000-4000-8000-000000000002',
      '{"account":{"account_id":"19101090-0000-4000-8000-000000000002","plan":"private","roles":[]}}',
      '{"account":{"account_id":"19101090-0000-4000-8000-000000000002","roles":["tester"]}}');
     update public.account_identities set deleted_at=now() where subject='user_audit_upgrade';
     insert into private.mail_audit(id,action,target,detail) values
      ('19101090-0000-4000-8000-000000000012','consent','contact','{"consent":true,"evidence":"private@example.invalid"}');
     insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
      select '19101090-0000-4000-8000-000000000014',outcome,
      '19101090-0000-4000-8000-000000000015','19101090-0000-4000-8000-000000000001',
      'set_blocked','clerk_ban',encode(sha256(convert_to('user_audit_upgrade','UTF8')),'hex')
      from unnest(array['started','succeeded']) outcome;
     insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status,occurred_at)
      select ('19101090-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,outcome,
      '19101090-0000-4000-8000-000000000015','19101090-0000-4000-8000-000000000001',
      'set_blocked','clerk_ban',repeat(hash,64),status,'2026-01-01T00:00:00Z'::timestamptz
      from (values(16,'started','f',null::smallint),(16,'failed','f',401),
       (17,'started','e',null::smallint),(17,'unknown','e',503)) f(n,outcome,hash,status);""")
    root=Path(__file__).resolve().parents[2]
    readme=(root/'supabase/functions/native-admin/README.md').read_text(encoding='utf-8')
    precheck='select current_user,rolsuper'+readme.split('select current_user,rolsuper',1)[1].split('```',1)[0]
    counts=run('psql',*conn,'-c',precheck)
    if 'sin_asociacion|2|2' not in counts.splitlines():
        raise RuntimeError('documented pre-check did not count closed/pending historical rows: '+counts)


def run_minimal_audit(run, conn, out, before, schema_before, newline, bin_dir, env):
    root = Path(__file__).resolve().parents[2]
    def sql(path):
        target = out/('audit-'+path.name)
        source = path.read_text(encoding='utf-8')
        target.write_bytes(source.replace('\n','\r\n').encode() if newline=='crlf' else source.encode())
        return run('psql',*conn,'-f',target)
    up = root/'supabase/migrations'/(AUDIT_STEM+'.sql')
    down = root/'supabase/rollbacks'/(AUDIT_STEM+'.down.sql')
    upgraded=run('psql',*conn,'-c',"""select
      (select target='erased' and before_value='{"enabled":false}'::jsonb
       and after_value='{"enabled":true}'::jsonb from public.admin_audit_log
       where id='19101090-0000-4000-8000-000000000011'),
      (select detail='{"consent":true}'::jsonb from private.mail_audit
       where id='19101090-0000-4000-8000-000000000012')""").strip()
    if upgraded!='t|t': raise RuntimeError('nonempty audit upgrade retained PII: '+upgraded)
    effect_upgrade=run('psql',*conn,'-c',"""select count(*)=2 and bool_and(target_hash='erased' and target_account is null and erase_on_close)
      from private.admin_effects where effect_id='19101090-0000-4000-8000-000000000014'""").strip()
    if effect_upgrade!='t': raise RuntimeError('nonempty effect backfill retained a deleted target')
    unmapped=run('psql',*conn,'-c',"""select
     (select count(*)=2 and bool_and(target_hash='erased' and action='set_blocked' and effect='clerk_ban'
       and occurred_at='2026-01-01T00:00:00Z' and request_id='19101090-0000-4000-8000-000000000015'
       and actor='19101090-0000-4000-8000-000000000001')
      from private.admin_effects where effect_id='19101090-0000-4000-8000-000000000016'),
     (select count(*)=2 and bool_and(target_hash=repeat('e',64) and occurred_at='2026-01-01T00:00:00Z')
      from private.admin_effects where effect_id='19101090-0000-4000-8000-000000000017'),
     (select provider_status=401 from private.admin_effects
      where effect_id='19101090-0000-4000-8000-000000000016' and outcome='failed')""").strip()
    if unmapped!='t|t|t': raise RuntimeError('unmapped historical policy changed evidence or pending hash: '+unmapped)
    reconciled=run('psql',*conn,'-c',"""begin;
     select * from public.operational_access_set('19101090-0000-4000-8000-000000000001',
      'owner','grant','test:audit','Unmapped reconciliation','unmapped-reconcile',null);
     select public.native_admin_reconcile_effect('19101090-0000-4000-8000-000000000001',
      '19101090-0000-4000-8000-000000000017');
     set constraints all immediate;
     select count(*)=3 and bool_and(target_hash='erased') from private.admin_effects
      where effect_id='19101090-0000-4000-8000-000000000017'; rollback;""")
    if not reconciled.strip().endswith('t\nROLLBACK'): raise RuntimeError('unmapped pending hash survived reconcile: '+reconciled)
    for name in ['native_admin_minimal_audit.test.sql','native_admin_audit_retention.test.sql']:
        result=sql(root/'supabase/tests'/name)
        (out/(name+'.log')).write_text(result,encoding='utf-8')
        if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
        print(name+' GREEN',flush=True)
    run('psql',*conn,'-c',"""begin;
      insert into private.admin_audit_maintenance_tx default values;
      delete from private.admin_effects where effect_id in('19101090-0000-4000-8000-000000000014',
       '19101090-0000-4000-8000-000000000016','19101090-0000-4000-8000-000000000017');
      delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id(); commit;""")
    for name in ['native_admin_effects.test.sql','native_admin_effects_r2.test.sql',
                 'native_admin_deletion_r4.test.sql','marketing_mail.test.sql','native_admin_reads_r3.test.sql',
                 'native_admin_brevo_effects.test.sql','native_admin_mail_sync_effects.test.sql','native_admin_mail_send_effects.test.sql']:
        result=sql(root/'supabase/tests'/name)
        (out/('audit-active-'+name+'.log')).write_text(result,encoding='utf-8')
        if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
        print('Audit active: '+name+' PASS',flush=True)
    run_audit_erasure_races(run,conn,out,bin_dir,env)
    # A redacted actor cannot satisfy the predecessor's NOT NULL. Down must
    # fail before any DDL, not invent or restore an identifier.
    run('psql',*conn,'-c',"""begin;
     insert into private.admin_audit_maintenance_tx default values;
     insert into public.admin_audit_log(id,actor_account_id,action,target)
     values('19101090-0000-4000-8000-000000000013',null,'get_rollout','get_rollout');
     delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id(); commit;""")
    active_schema=audit_schema(run,conn)
    try:
        sql(down)
    except RuntimeError as exc:
        if 'admin_audit_rollback_requires_backup' not in str(exc): raise
    else: raise RuntimeError('down accepted irreversible actor redaction')
    if audit_schema(run,conn)!=active_schema: raise RuntimeError('rejected down changed schema')
    run('psql',*conn,'-c',"""begin;
      insert into private.admin_audit_maintenance_tx default values;
      delete from public.admin_audit_log where id='19101090-0000-4000-8000-000000000013';
      delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
      commit;""")
    sql(down)
    after=run('psql',*conn,'-c',AUDIT_SNAPSHOT)
    (out/'audit-before.json').write_text(before,encoding='utf-8')
    (out/'audit-down.json').write_text(after,encoding='utf-8')
    if json.loads(after)!=json.loads(before): raise RuntimeError('audit rollback changed schema/ACL')
    schema_after=audit_schema(run,conn)
    (out/'audit-schema.before.sql').write_text(schema_before,encoding='utf-8')
    (out/'audit-schema.down.sql').write_text(schema_after,encoding='utf-8')
    if schema_after!=schema_before: raise RuntimeError('audit rollback full schema dump differs')
    sql(up)
    second=run('psql',*conn,'-c',"""select after_value='{"enabled":true}'::jsonb
      from public.admin_audit_log where id='19101090-0000-4000-8000-000000000011'""").strip()
    if second!='t': raise RuntimeError('second backfill changed minimized historical evidence: '+second)
    run('psql',*conn,'-c',"""begin;
      insert into private.admin_audit_maintenance_tx default values;
      delete from public.admin_audit_log where id='19101090-0000-4000-8000-000000000011';
      delete from private.mail_audit where id='19101090-0000-4000-8000-000000000012';
      delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
      commit;""")
    result=sql(root/'supabase/tests/native_admin_minimal_audit.test.sql')
    if 'not ok ' in result: raise RuntimeError(result)
    # Old digest/rollback oracles run against their actual predecessor, not new triggers.
    sql(down)
    print('Audit full-chain GREEN, exact schema/ACL rollback and reapply PASS',flush=True)
