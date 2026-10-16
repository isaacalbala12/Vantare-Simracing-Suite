"""Full SQL catalogue in disposable Docker, one database per suite. No DSNs.
Caller MUST hold ~/orq/docker.lock. Never starts or modifies a managed stack.
"""
import argparse, json, os, pathlib, re, subprocess, tempfile, time
p=argparse.ArgumentParser()
p.add_argument('--output', required=True)
p.add_argument('--root', default=str(pathlib.Path(__file__).resolve().parents[2]))
p.add_argument('--only', nargs='*')
p.add_argument('--baseline-summary', help='Compare every shared suite; fail on any regression')
p.add_argument('--storage-schema', default=str(pathlib.Path.home()/'evidence/1608/r6/storage-schema.sql'), help='Schema-only dump from disposable local Storage')
p.add_argument('--without-promotion', action='store_true')
p.add_argument('--creator-first', action='store_true', help='Install both report migrations after the actual Founders migrations')
p.add_argument('--mutation',choices=['launch','launch-end','window','tier','spam','creator','deleted','idempotency','first-month','invoice','transfer','settlements','repair','first-refund','launch-used','checkout-proof','cleanup-inactive','invoice-gap','initial-incident','reward-expiry','accounts-deleted','attempt-required','tier-total','checkout-no-id','checkout-owner-incident','reconciliation-item-incident','creator-remainder','creator-clock','renewal-lease','creator-expiry','creator-lock-order','revocation-ack','revocation-remainders','launch-offer-binding'])
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
 migrations=sorted((root/'supabase/migrations').glob('*.sql'))
 if a.creator_first:
  report_names={'20261015182858_isa_1593_report_promotion.sql','20261016090000_report_creator_renewals.sql','20261016090001_isa_1593_launch_offer_sql.sql'}
  migrations=[m for m in migrations if m.name not in report_names]+[m for m in migrations if m.name in report_names]
 for migration in migrations:
  if a.without_promotion and 'isa_1593_' in migration.name: continue
  result=run('docker','exec','-i',container,'psql','-X','-U','supabase_admin','-d','promotion_base','-v','ON_ERROR_STOP=1','-At',input=migration.read_text(),check=False) if migration.name=='20261010001000_visual_roadmap_clickup.sql' else sql(migration.read_text(),check=False); (out/(migration.name+'.log')).write_text(result.stdout+result.stderr)
  if result.returncode: raise RuntimeError(migration.name+': '+result.stderr[-4000:])
 # Read the ONLY launch JSON from #1661 and exercise the installed SQL clock
 # at those exact boundaries. A future catalogue change cannot silently diverge.
 if (root/'supabase/migrations/20261015182858_isa_1593_report_promotion.sql').exists() and not a.without_promotion:
  windows=json.loads((root/'supabase/functions/scripts/polar-launch-prices.json').read_text())['launch_windows']
  for environment,window in windows.items():
   opened=window['starts_at']; closed=window['ends_at']
   assert re.fullmatch(r'[0-9TZ:.+-]+',opened) and re.fullmatch(r'[0-9TZ:.+-]+',closed)
   checks=sql(f"select private.report_promotion_eligible('{opened}'::timestamptz), not private.report_promotion_eligible('{opened}'::timestamptz-interval '1 millisecond'), private.report_promotion_eligible('{closed}'::timestamptz-interval '1 millisecond'), not private.report_promotion_eligible('{closed}'::timestamptz)").stdout.strip()
   if checks!='t|t|t|t': raise RuntimeError('Canonical #1661 launch window disagrees with SQL: '+environment+' '+checks)
  (out/'launch-contract.json').write_text(json.dumps(windows,indent=2)+'\n')
 # Exercise the actual offline projection against PostgreSQL, without leaving test rows in the base.
 if (root/'supabase/functions/scripts/prepare-launch-offers-sql.ts').exists() and not a.without_promotion:
  code='''import {prepareLaunchOffersSql} from "./supabase/functions/scripts/prepare-launch-offers-sql.ts";
import {VALID_POLAR_PRODUCT_MAP_JSON} from "./supabase/functions/_shared/test-fixtures.ts";
const map=JSON.parse(VALID_POLAR_PRODUCT_MAP_JSON);
map.checkout_keys.pro_monthly.polar_launch_discount_id="1593eeee-0000-4000-8000-000000000011";
console.log(prepareLaunchOffersSql(JSON.stringify(map),"sandbox"));'''
  projection=subprocess.run(['deno','eval','--config',str(root/'supabase/functions/deno.json'),'--no-lock','--cached-only',code],cwd=root,capture_output=True,text=True,env={**os.environ,'DENO_NO_PACKAGE_JSON':'1'})
  if projection.returncode: raise RuntimeError(projection.stderr)
  (out/'registration.sql').write_text(projection.stdout)
  sql('create database registration_test template promotion_base')
  sql(projection.stdout,'registration_test')
  before=sql('select row_to_json(o) from private.billing_launch_offers o','registration_test').stdout
  sql(projection.stdout,'registration_test')
  assert sql('select row_to_json(o) from private.billing_launch_offers o','registration_test').stdout==before, 'registration replay must not reset audit timestamp'
  drift=sql(projection.stdout.replace('1593eeee-0000-4000-8000-000000000011','1593eeee-0000-4000-8000-000000000099'),'registration_test',check=False)
  assert drift.returncode and 'launch_offer_registry_drift' in drift.stderr, 'changed coupon must abort'
  assert sql('select row_to_json(o) from private.billing_launch_offers o','registration_test').stdout==before, 'drift rollback preserves registration'
  (out/'registration-checks.txt').write_text('PASS actual generated SQL, replay audit unchanged, coupon drift rejected, rollback unchanged\n')
  sql('drop database registration_test')
 if a.mutation:
  signature, before, after = {
   'launch-offer-binding':('public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid)','and discount_id=p_discount::uuid',''),
   'revocation-ack':('public.report_promotion_ack(uuid,uuid,timestamptz,text,text)',"if done is distinct from true then","if done is distinct from true then raise exception 'creator_renewal_ack_failed'; end if; if false then"),
   'revocation-remainders':('public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean)',"select coalesce(jsonb_agg(r.discount_id::text),'[]')","select '[]'::jsonb"),

   'creator-lock-order':('private.billing_creator_renewal_prepare_before_1593(text,uuid,text,text,text,uuid,text,uuid,integer)','if private.lock_account_write(p_user) then return null; end if;','perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));'),

   'creator-remainder':('private.report_creator_bound(text,text,jsonb,timestamptz)','select discount_id into chosen from private.report_creator_remainders','select creator_discount_id into chosen from private.report_creator_remainders'),
   'creator-clock':('private.report_creator_bound(text,text,jsonb,timestamptz)','private.report_promotion_months(anchor,terms.duration_months)','private.report_promotion_months(p_now,terms.duration_months)'),
   'renewal-lease':('public.report_promotion_claim(uuid,uuid,timestamptz)','if ctx is not null then','if false then'),
   'creator-expiry':('public.report_promotion_renewal_prepare(uuid,integer,integer,timestamptz)','case when private.report_creator_end(op.environment,op.subscription_id,p_now)<=p_now then 0 else p_creator_savings end','p_creator_savings'),

   'checkout-owner-incident':('public.report_promotion_failed(uuid,text,text,timestamptz)',"if private.lock_account_write(p_account) then return; end if;","if p_code='promotion_checkout_owner_mismatch' then return; end if; if private.lock_account_write(p_account) then return; end if;"),
   'reconciliation-item-incident':('public.billing_reconciliation_item_failed(text,text,text,text,timestamptz)',"insert into private.billing_reconciliation_item_failures(environment,resource,item_key,resource_id,first_at,last_at)","return; insert into private.billing_reconciliation_item_failures(environment,resource,item_key,resource_id,first_at,last_at)"),
   'accounts-deleted':('public.report_promotion_accounts(text,uuid)','and not exists(select 1 from public.account_identities i where i.account_id=p.account_id and i.deleted_at is not null)',''),
   'attempt-required':('public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid)',"if p_attempt is null then raise sqlstate '22023' using message='promotion_attempt_required'; end if;","null;"),
   'tier-total':('public.report_promotion_prepare(uuid,text,timestamptz)','p.reward_granted_at:=coalesce(p.reward_granted_at,grant_at);','p.reward_granted_at:=grant_at;'),
   'checkout-no-id':('private.billing_launch_checkout_before_1593_guard(uuid,text,text,text,text,timestamptz,uuid,uuid)','used.remote_pending and coalesce(used.checkout_id,prior.provider_checkout_id) is not null and p_replaces is distinct from used.attempt_id','used.remote_pending and (p_replaces is distinct from used.attempt_id or coalesce(used.checkout_id,prior.provider_checkout_id) is null)'),
   'launch':('private.report_promotion_eligible(timestamptz)','2026-10-26 19:00','2026-10-26 18:00'),
   'launch-end':('private.report_promotion_eligible(timestamptz)','2026-11-26 19:00','2026-11-02 19:00'),
   'window':('private.report_promotion_progress(uuid,text,timestamptz)','1080 hours','1081 hours'),
   'tier':('public.report_promotion_prepare(uuid,text,timestamptz)',">=5 then 6",">=50 then 6"),
   'spam':('public.report_promotion_prepare(uuid,text,timestamptz)','p.forfeited:=p.forfeited or p.forfeited_at is not null','p.forfeited:=false'),
   'creator':('private.billing_creator_renewal_prepare_before_1593(text,uuid,text,text,text,uuid,text,uuid,integer)','v_report.savings_cents>=p_creator_savings','v_report.savings_cents<=p_creator_savings'),
   'deleted':('public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid)',"if private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;","if false then raise sqlstate '28000' using message='account_deleted'; end if;"),
   'idempotency':('public.report_promotion_prepare(uuid,text,timestamptz)','p.applied_at is not null and p.applied_candidate is not distinct from desired','false'),
   'invoice':('public.report_promotion_prepare(uuid,text,timestamptz)','order by i.billed_at,o.id limit 1;\n if not found then\n   perform public.report_promotion_failed(p_account,p_environment,\'promotion_initial_invoice_missing\',p_now);\n   return null;\n end if;',"order by i.billed_at,o.id limit 1;\n if not found then first_order.status:='paid'; first_order.reported_refunded_amount:=0; end if;"),
   'first-month':('public.report_promotion_prepare(uuid,text,timestamptz)','when p.tier-spent>=3 then c.reward3_discount else c.launch_discount end','when p.tier-spent>=3 then c.launch_discount else c.launch_discount end'),
   'transfer':('public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text)','set subscription_id=p_subscription,product_id=p_product','set subscription_id=existing.subscription_id,product_id=p_product'),
   'settlements':('public.report_promotion_prepare(uuid,text,timestamptz)','spent<p.tier','spent<p.tier-1'),
   'repair':('public.report_promotion_prepare(uuid,text,timestamptz)','where i.account_id=p_account and i.environment=p_environment and i.subscription_id=p.subscription_id','where false and i.account_id=p_account and i.environment=p_environment and i.subscription_id=p.subscription_id'),
   'first-refund':('public.report_promotion_prepare(uuid,text,timestamptz)',"p.first_refunded:=p.first_refunded or first_order.status<>'paid' or first_order.reported_refunded_amount>0","p.first_refunded:=false or false or false"),
   'launch-used':('private.billing_launch_checkout_before_1593_guard(uuid,text,text,text,text,timestamptz,uuid,uuid)','used.attempt_id=p_attempt and used.product_id=p_product','used.product_id=p_product'),
   'checkout-proof':('private.billing_launch_checkout_before_1593_guard(uuid,text,text,text,text,timestamptz,uuid,uuid)','p_replaces is distinct from used.attempt_id','false'),
   'cleanup-inactive':('public.report_promotion_prepare(uuid,text,timestamptz)',"and b.status in ('canceled','paused'));","and false);"),
   'invoice-gap':('public.report_promotion_prepare(uuid,text,timestamptz)','if exists(select 1 from private.report_promotion_invoice_gaps g','if false and exists(select 1 from private.report_promotion_invoice_gaps g'),
   'initial-incident':('public.report_promotion_prepare(uuid,text,timestamptz)',"perform public.report_promotion_failed(p_account,p_environment,'promotion_initial_invoice_missing',p_now);","null;"),
   'reward-expiry':('public.report_promotion_prepare(uuid,text,timestamptz)','if p.reward_expires_at<=p_now and not p.first_refunded then','if false then'),
  }[a.mutation]
  definition=sql(f"select pg_get_functiondef('{signature}'::regprocedure)").stdout.strip()
  assert before in definition, a.mutation
  sql(definition.replace(before,after))
  # These guards now exist at both the public boundary and preserved private core.
  # Remove both copies when testing their complete absence; a single-copy mutation is redundant.
  if a.mutation in ('deleted','attempt-required'):
   core='private.billing_launch_checkout_before_1593_guard(uuid,text,text,text,text,timestamptz,uuid,uuid)'
   definition=sql(f"select pg_get_functiondef('{core}'::regprocedure)").stdout.strip()
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
