"""Full SQL catalogue in disposable Docker, one database per suite. No DSNs.
Caller MUST hold ~/orq/docker.lock. Never starts or modifies a managed stack.
"""
import argparse, json, pathlib, re, subprocess, tempfile, time
p=argparse.ArgumentParser()
p.add_argument('--output', required=True)
p.add_argument('--root', default=str(pathlib.Path(__file__).resolve().parents[2]))
p.add_argument('--only', nargs='*')
p.add_argument('--baseline-summary', help='Compare every shared suite; fail on any regression')
p.add_argument('--storage-schema', default=str(pathlib.Path.home()/'evidence/1608/r6/storage-schema.sql'), help='Schema-only dump from disposable local Storage')
p.add_argument('--without-promotion', action='store_true')
p.add_argument('--mutation',choices=['launch','launch-end','window','tier','spam','creator','deleted','idempotency','first-month','invoice','transfer','settlements','repair','first-refund','launch-used'])
a=p.parse_args(); root=pathlib.Path(a.root).resolve(); out=pathlib.Path(a.output).resolve(); out.mkdir(parents=True,exist_ok=True)
if not (pathlib.Path.home()/'orq/docker.lock').is_dir(): raise SystemExit('Acquire ~/orq/docker.lock first')
container='vantare-1593-'+str(int(time.time()))
def run(*args, check=True, input=None):
 r=subprocess.run(args,capture_output=True,text=True,input=input)
 if check and r.returncode: raise RuntimeError(r.stderr[-6000:])
 return r
try:
 run('docker','run','-d','--name',container,'--network','none','-e','POSTGRES_PASSWORD=local-1593-test','-e','POSTGRES_HOST_AUTH_METHOD=trust','public.ecr.aws/supabase/postgres:17.6.1.165')
 for _ in range(300):
  if 'init process complete' in run('docker','logs',container,check=False).stdout and run('docker','exec',container,'psql','-U','postgres','-Atc','select 1',check=False).returncode==0: break
  time.sleep(.2)
 def sql(text,db='promotion_base',check=True):
  return run('docker','exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-v','dblink_password=local-trust-unused','-At',input=text,check=check)
 run('docker','exec',container,'psql','-U','supabase_admin','-d','postgres','-c','alter role postgres nosuperuser bypassrls')
 run('docker','exec',container,'psql','-U','postgres','-d','postgres','-c','create database promotion_base template template0')
 # Standalone model mirrors the repository commercial runner's auth/storage fixtures.
 sql('drop schema if exists storage cascade; drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;')
 storage=pathlib.Path(a.storage_schema).resolve()
 sql(storage.read_text())
 bootstrap=(root/'supabase/tests/run-supabase-hardening-postgres.ps1').read_text().split("Write-Utf8NoBom $bootstrap @'",1)[1].split("'@",1)[0]
 # Image has the standard roles; fixture bootstrap is deliberately idempotent.
 run('docker','exec','-i',container,'psql','-U','supabase_admin','-d','promotion_base','-v','ON_ERROR_STOP=1',input='create schema if not exists extensions; grant all on schema extensions to postgres; create extension pgtap; create extension pgcrypto with schema extensions; create extension dblink with schema extensions;')
 sql(bootstrap)
 sql("alter default privileges in schema public grant all on tables to service_role; create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid$$;")
 sql("alter database postgres set timezone='UTC'")
 for migration in sorted((root/'supabase/migrations').glob('*.sql')):
  if a.without_promotion and 'isa_1593_' in migration.name: continue
  result=run('docker','exec','-i',container,'psql','-X','-U','supabase_admin','-d','promotion_base','-v','ON_ERROR_STOP=1','-At',input=migration.read_text(),check=False) if migration.name=='20261010001000_visual_roadmap_clickup.sql' else sql(migration.read_text(),check=False); (out/(migration.name+'.log')).write_text(result.stdout+result.stderr)
  if result.returncode: raise RuntimeError(migration.name+': '+result.stderr[-4000:])
 if a.mutation:
  signature, before, after = {
   'launch':('private.report_promotion_eligible(timestamptz)','2026-10-26 19:00','2026-10-26 18:00'),
   'launch-end':('private.report_promotion_eligible(timestamptz)','2026-11-02 19:00','2026-11-02 00:00'),
   'window':('private.report_promotion_progress(uuid,text,timestamptz)','1080 hours','1081 hours'),
   'tier':('public.report_promotion_prepare(uuid,text,timestamptz)',">=5 then 6",">=50 then 6"),
   'spam':('public.report_promotion_prepare(uuid,text,timestamptz)','p.forfeited:=p.forfeited or p.forfeited_at is not null','p.forfeited:=false'),
   'creator':('public.report_promotion_prepare(uuid,text,timestamptz)','creator.basis_points/10000.0)>','creator.basis_points/10000.0)<'),
   'deleted':('public.report_promotion_prepare(uuid,text,timestamptz)','if private.lock_account_write(p_account) then return null; end if;','if false then return null; end if;'),
   'idempotency':('public.report_promotion_prepare(uuid,text,timestamptz)','p.applied_at is not null and p.applied_discount is not distinct from desired','false'),
   'invoice':('public.report_promotion_prepare(uuid,text,timestamptz)','order by i.billed_at,o.id limit 1;\n if not found then return null; end if;',"order by i.billed_at,o.id limit 1;\n if not found then first_order.status:='paid'; first_order.reported_refunded_amount:=0; end if;"),
   'first-month':('public.report_promotion_prepare(uuid,text,timestamptz)','when p.tier-spent>=3 then c.reward3_discount else c.launch_discount end','when p.tier-spent>=3 then c.launch_discount else c.launch_discount end'),
   'transfer':('public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text)','set subscription_id=p_subscription,product_id=p_product','set subscription_id=existing.subscription_id,product_id=p_product'),
   'settlements':('public.report_promotion_prepare(uuid,text,timestamptz)','spent<p.tier','spent<p.tier-1'),
   'repair':('public.report_promotion_prepare(uuid,text,timestamptz)','where i.account_id=p_account and i.environment=p_environment and i.subscription_id=p.subscription_id','where false and i.account_id=p_account and i.environment=p_environment and i.subscription_id=p.subscription_id'),
   'first-refund':('public.report_promotion_prepare(uuid,text,timestamptz)',"p.first_refunded:=p.first_refunded or first_order.status<>'paid' or first_order.reported_refunded_amount>0","p.first_refunded:=false or false or false"),
   'launch-used':('public.report_promotion_checkout(uuid,text,text,timestamptz,uuid)','used.consumed_at is null and used.attempt_id=p_attempt','used.consumed_at is null'),
  }[a.mutation]
  definition=sql(f"select pg_get_functiondef('{signature}'::regprocedure)").stdout.strip()
  assert before in definition, a.mutation
  sql(definition.replace(before,after))
 suites=sorted(f for f in (root/'supabase/tests').glob('*') if f.name.endswith(('.test.sql','_test.sql','.local.sql','.psql')))
 if a.only: suites=[root/'supabase/tests'/name for name in a.only]
 results=[]
 for i,suite in enumerate(suites):
  db=f'suite_{i}'; sql(f'create database {db} template promotion_base'); sql(f"alter database {db} set timezone='UTC'",db)
  source=re.sub(r'^\\ir (.+)$',lambda m:(suite.parent/m[1]).resolve().read_text(),suite.read_text(),flags=re.M)
  r=sql(source,db,check=False); text=r.stdout+r.stderr; (out/(suite.name+'.log')).write_text(text)
  plans=re.findall(r'^1\.\.(\d+)$',text,re.M); passed=len(re.findall(r'^ok \d+\b',text,re.M)); failed=re.findall(r'^not ok .*',text,re.M)
  good=r.returncode==0 and plans and passed==sum(map(int,plans)) and not failed
  item={'suite':suite.name,'status':'PASS' if good else 'FAIL','passed':passed,'plans':plans,'exit':r.returncode,'failed':failed}; results.append(item)
  print(f"{item['status']} {suite.name}: {passed}/{'/'.join(plans)}",flush=True)
  sql(f'drop database {db}')
 (out/'summary.json').write_text(json.dumps(results,indent=2)+'\n')
 print(f"CATALOG: {sum(r['status']=='PASS' for r in results)} PASS / {sum(r['status']!='PASS' for r in results)} FAIL",flush=True)
 if a.baseline_summary:
  baseline={r['suite']:r for r in json.loads(pathlib.Path(a.baseline_summary).read_text())}
  regressions=[r for r in results if r['suite'] in baseline and (r['passed']<baseline[r['suite']]['passed'] or baseline[r['suite']]['status']=='PASS' and r['status']!='PASS' or r['failed']!=baseline[r['suite']]['failed'])]
  (out/'regressions.json').write_text(json.dumps(regressions,indent=2)+'\n')
  if regressions: raise SystemExit('SQL catalogue regressed: '+', '.join(r['suite'] for r in regressions))
 if a.only and any(r['status']!='PASS' for r in results): raise SystemExit(1)
finally:
 logs=run('docker','logs',container,check=False); (out/'container.log').write_text(logs.stdout+logs.stderr)
 run('docker','rm','-f',container,check=False)
