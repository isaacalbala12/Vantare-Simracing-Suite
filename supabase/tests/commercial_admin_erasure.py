"""Real maintenance Edge -> disposable PostgreSQL -> fake Brevo."""
from pathlib import Path
import json
import subprocess


def run_erasure_e2e(deno, conn, out, bin_dir, env):
    root=Path(__file__).resolve().parents[2]
    script=root/'supabase/tests/brevo-erasure-e2e.ts'
    config=root/'supabase/functions/deno.json'
    command={'program':str(bin_dir/'psql'),'args':conn}
    permission=command['program']
    if str(deno).endswith('.exe'):
        script=subprocess.check_output(['wslpath','-w',str(script)],text=True).strip()
        config=subprocess.check_output(['wslpath','-w',str(config)],text=True).strip()
        command={'program':'wsl.exe','args':['-d',env['WSL_DISTRO_NAME'],'--',str(bin_dir/'psql'),*conn]}
        permission='wsl.exe'
    result=subprocess.run([str(deno),'test','--cached-only','--no-lock','--config',str(config),
        '--allow-run='+permission,str(script),'--',json.dumps(command)],
        env=env,capture_output=True,text=True,timeout=120)
    (out/'brevo-erasure-e2e.log').write_text(result.stdout+result.stderr,encoding='utf-8')
    assert result.returncode==0, result.stdout+result.stderr
    print('Brevo actual maintenance route -> journal/pending/reconcile, fake provider PASS',flush=True)


STEM='20261104095000_isa_1910_brevo_erasure_journal'
CONSTRAINTS="""select json_object_agg(conname,json_build_object('definition',pg_get_constraintdef(oid),'validated',convalidated))
 from pg_constraint where conrelid='private.admin_effects'::regclass
 and conname in('admin_effects_action_check','admin_effects_effect_check')"""


def run_erasure_sql(run, conn, out, bin_dir, env, previous):
    root=Path(__file__).resolve().parents[2]
    up=root/'supabase/migrations'/(STEM+'.sql')
    down=root/'supabase/rollbacks'/(STEM+'.down.sql')
    # Legacy rollback oracles restore their own constraint version first.
    run('psql',*conn,'-f',up)
    current=json.loads(run('psql',*conn,'-c',CONSTRAINTS))
    run('psql',*conn,'-c',"""insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
      values('19105700-0000-4000-8000-000000000001','started','19105700-0000-4000-8000-000000000001','19105700-0000-4000-8000-000000000001','delete_account','clerk_delete',repeat('c',64)),
      ('19105700-0000-4000-8000-000000000001','succeeded','19105700-0000-4000-8000-000000000001','19105700-0000-4000-8000-000000000001','delete_account','clerk_delete',repeat('c',64));""")
    run('psql',*conn,'-f',down)
    assert json.loads(run('psql',*conn,'-c',CONSTRAINTS))==previous, 'Brevo down must restore both exact old constraints'
    assert run('psql',*conn,'-c',"select to_regprocedure('public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid)') is null").strip()=='t'
    assert run('psql',*conn,'-c',"select to_regprocedure('public.native_admin_claim_mail_erasure(uuid,uuid,uuid)') is null").strip()=='t'
    assert run('psql',*conn,'-c',"select count(*) from private.admin_effects where effect_id='19105700-0000-4000-8000-000000000001'").strip()=='2', 'rollback lost old journal evidence'
    collision=out/'brevo-actor-collision.sql'
    collision.write_text("begin; insert into public.profiles(id) values('00000000-0000-0000-0000-000000000000');\n"+r"\ir "+str(up)+'\n',encoding='utf-8')
    rejected=subprocess.run([str(bin_dir/'psql'),*conn,'-f',str(collision)],env=env,text=True,capture_output=True)
    (out/'brevo-actor-collision.log').write_text(rejected.stdout+rejected.stderr,encoding='utf-8')
    assert rejected.returncode and '55000' in rejected.stderr and 'brevo_worker_actor_collision' in rejected.stderr
    assert json.loads(run('psql',*conn,'-c',CONSTRAINTS))==previous, 'collision guard changed schema'

    run('psql',*conn,'-f',up)
    assert json.loads(run('psql',*conn,'-c',CONSTRAINTS))==current
    result=run('psql',*conn,'-f',root/'supabase/tests/native_admin_brevo_effects.test.sql')
    (out/'native_admin_brevo_effects.test.sql.log').write_text(result,encoding='utf-8')
    assert 'not ok ' not in result and '# Looks like' not in result, result
    print('Brevo SQL: exact constraint rollback/reapply preserves old evidence; capability/owner/pending/reconcile PASS',flush=True)


def run_erasure_retained_guard(run, conn, out, bin_dir, env):
    root=Path(__file__).resolve().parents[2]
    before=run('psql',*conn,'-c',CONSTRAINTS)
    count=run('psql',*conn,'-c',"select count(*) from private.admin_effects where effect='brevo_delete'").strip()
    assert int(count)>0
    result=subprocess.run([str(bin_dir/'psql'),*conn,'-f',str(root/'supabase/rollbacks'/(STEM+'.down.sql'))],env=env,text=True,capture_output=True)
    (out/'brevo-retained-rollback.log').write_text(result.stdout+result.stderr,encoding='utf-8')
    assert result.returncode and '55000' in result.stderr and 'brevo_journal_rollback_requires_retention' in result.stderr
    assert run('psql',*conn,'-c',CONSTRAINTS)==before
    assert run('psql',*conn,'-c',"select count(*) from private.admin_effects where effect='brevo_delete'").strip()==count
    print('Brevo rollback refuses retained new evidence atomically, without deleting rows PASS',flush=True)


SYNC_STEM='20261104100000_isa_1910_brevo_sync_journal'
LIMITS_STEM='20261104103000_isa_1910_mail_sync_limits'

def run_sync_sql(run, conn, out, bin_dir, env, newline_mode="lf"):
    root=Path(__file__).resolve().parents[2]
    # The erasure down oracle restores its exact old checks before this stage.
    before=run('psql',*conn,'-c',CONSTRAINTS)
    up=root/'supabase/migrations'/(SYNC_STEM+'.sql')
    run('psql',*conn,'-f',up)
    run('psql',*conn,'-f',root/'supabase/rollbacks'/(SYNC_STEM+'.down.sql'))
    assert run('psql',*conn,'-c',CONSTRAINTS)==before, 'sync rollback changes old checks'
    assert run('psql',*conn,'-c',"select to_regprocedure('public.native_admin_record_mail_sync(uuid,uuid,uuid,text,uuid,uuid,text,integer)') is null").strip()=='t'
    run('psql',*conn,'-f',up)
    # Match the replay's transport format, independently of Git autocrlf on Windows.
    # Do not normalize snapshots: compare the actual stored body/owner/ACL exactly.
    def formatted(path):
        text=path.read_text(encoding='utf-8')
        if newline_mode=='crlf': text=text.replace('\n','\r\n')
        target=out/('sync-oracle-'+path.name)
        target.write_bytes(text.encode('utf-8'))
        return target
    run('psql',*conn,'-f',formatted(up))
    snapshot="select json_build_object('body',pg_get_functiondef(oid),'owner',proowner,'acl',proacl::text) from pg_proc where oid='public.native_admin_record_mail_sync(uuid,uuid,uuid,text,uuid,uuid,text,integer)'::regprocedure"
    previous=run('psql',*conn,'-c',snapshot)
    run('psql',*conn,'-f',formatted(root/'supabase/migrations'/(LIMITS_STEM+'.sql')))
    run('psql',*conn,'-f',formatted(root/'supabase/rollbacks'/(LIMITS_STEM+'.down.sql')))
    restored=run('psql',*conn,'-c',snapshot)
    (out/'sync-limits-before.json').write_text(previous,encoding='utf-8')
    (out/'sync-limits-down.json').write_text(restored,encoding='utf-8')
    assert restored==previous, 'sync limits down must restore exact old body/owner/ACL'
    run('psql',*conn,'-f',formatted(root/'supabase/migrations'/(LIMITS_STEM+'.sql')))
    result=run('psql',*conn,'-f',root/'supabase/tests/native_admin_mail_sync_effects.test.sql')
    (out/'native_admin_mail_sync_effects.test.sql.log').write_text(result,encoding='utf-8')
    assert 'not ok ' not in result and '# Looks like' not in result, result
    print('Brevo sync SQL: exact old checks rollback/reapply, owner/capability/pending/reconcile PASS',flush=True)


def run_sync_retained_guard(run, conn, out, bin_dir, env):
    root=Path(__file__).resolve().parents[2]
    before=run('psql',*conn,'-c',CONSTRAINTS)
    count=run('psql',*conn,'-c',"select count(*) from private.admin_effects where action='mail_sync'").strip()
    assert int(count)>0
    result=subprocess.run([str(bin_dir/'psql'),*conn,'-f',str(root/'supabase/rollbacks'/(SYNC_STEM+'.down.sql'))],env=env,text=True,capture_output=True)
    (out/'brevo-sync-retained-rollback.log').write_text(result.stdout+result.stderr,encoding='utf-8')
    assert result.returncode and '55000' in result.stderr and 'mail_sync_rollback_requires_retention' in result.stderr
    assert run('psql',*conn,'-c',CONSTRAINTS)==before
    assert run('psql',*conn,'-c',"select count(*) from private.admin_effects where action='mail_sync'").strip()==count
    print('Brevo sync rollback refuses retained evidence atomically PASS',flush=True)
