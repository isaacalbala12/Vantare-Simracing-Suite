"""Disposable loopback PostgreSQL only. macOS/Linux; never accepts a DSN."""
import argparse, os, pathlib, socket, subprocess, tempfile, json, time, urllib.request, urllib.error
from commercial_tombstone_race import run_tombstone_race
from commercial_write_race import run_write_races
from commercial_storage_race import run_storage_owners, run_storage_multipart
parser=argparse.ArgumentParser()
parser.add_argument('--pg-bin', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--baseline', action='store_true')
parser.add_argument('--before-b01', action='store_true')
parser.add_argument('--postgrest-bin')
parser.add_argument('--deno-bin')
parser.add_argument('--signer-module')
parser.add_argument('--upgrade', choices=['identity', 'identity-conflict', 'refunds'])
parser.add_argument('--concurrency', action='store_true', help='Only the two-transaction tombstone regression')
parser.add_argument('--writers', action='store_true', help='All user-write barriers, two real transactions per route; no pgTAP required')
parser.add_argument('--before-write-barrier', action='store_true', help='RED control: omit only r4 barrier migration')
parser.add_argument('--storage-schema', help='pg_dump --schema-only --no-owner --no-acl -n storage from a disposable Supabase stack')
parser.add_argument('--storage-owners', action='store_true', help='Real Storage owner text/UUID/manifest regression')
parser.add_argument('--storage-multipart', action='store_true', help='Two-transaction multipart persistence and cleanup queue')
args=parser.parse_args()
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(args.output).resolve(); OUT.mkdir(parents=True,exist_ok=True)
BIN=pathlib.Path(args.pg_bin).resolve()
ENV={k:v for k,v in os.environ.items() if not k.startswith(('PG','PGRST'))}
def run(prog,*args):
 r=subprocess.run([str(BIN/prog),*map(str,args)],env=ENV,capture_output=True,text=True)
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='vantare-commercial-') as tmp:
 data=pathlib.Path(tmp)/'data'
 run('initdb','-D',data,'-U','postgres','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale')
 run('pg_ctl','-D',data,'-l',OUT/'postgres.log','-o',f'-h 127.0.0.1 -p {port} -k {tmp}','-w','start')
 conn=['-X','-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-At']
 try:
  runner=(ROOT/'supabase/tests/run-supabase-hardening-postgres.ps1').read_text()
  bootstrap=runner.split("Write-Utf8NoBom $bootstrap @'",1)[1].split("'@",1)[0]
  if args.writers or args.concurrency or args.storage_owners or args.storage_multipart:
   bootstrap=bootstrap.replace('create extension if not exists pgtap;', '')
  # Supabase normally provisions service_role table privileges via defaults.
  # Reproduce that contract in plain PG; each migration still revokes its ACLs.
  bootstrap += "\nalter default privileges in schema public grant all on tables to service_role;\n"
  # Modern PostgREST sends the JSON GUC; preserve the legacy GUC for old fixtures.
  bootstrap += """
create or replace function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid
$$;
"""
  (OUT/'bootstrap.sql').write_text(bootstrap)
  run('psql',*conn,'-c',"alter database postgres set timezone='UTC'")
  if args.storage_schema:
   run('psql',*conn,'-f',pathlib.Path(args.storage_schema).resolve())
  run('psql',*conn,'-f',OUT/'bootstrap.sql')
  if args.storage_schema:
   run('psql',*conn,'-c',"create role supabase_storage_admin noinherit bypassrls; grant usage on schema storage to supabase_storage_admin; grant all on all tables in schema storage to supabase_storage_admin;")
  for m in sorted((ROOT/'supabase/migrations').glob('*.sql')):
   if args.before_write_barrier and 'account_write_barrier' in m.name: continue
   if args.baseline and ('isa_1608_commercial' in m.name or 'account_write_barrier' in m.name): continue
   if args.before_b01 and 'commercial_b01' in m.name: continue
   cutover = 'commercial_b03' in m.name and args.upgrade
   if cutover:
    result=run('psql',*conn,'-f',ROOT/'supabase/tests'/('commercial_'+args.upgrade.replace('-', '_')+'_upgrade.before.sql'))
    (OUT/'upgrade-before.log').write_text(result)
   try: result=run('psql',*conn,'-f',m)
   except Exception as e:
    (OUT/(m.name+'.log')).write_text(str(e))
    if cutover and args.upgrade=='identity-conflict' and '23505' in str(e) and 'account_alias_conflict' in str(e):
     result=run('psql',*conn,'-f',ROOT/'supabase/tests/commercial_identity_conflict_upgrade.test.sql')
     (OUT/'upgrade-results.log').write_text(result)
     if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
     print('identity-conflict upgrade: rejected atomically PASS',flush=True)
     raise SystemExit(0)
    raise RuntimeError(m.name+': '+str(e))
   if cutover and args.upgrade=='identity-conflict':
    raise AssertionError('ambiguous historical issuer aliases were not rejected by B03')
   (OUT/(m.name+'.log')).write_text(result)
  if args.upgrade:
   result=run('psql',*conn,'-f',ROOT/'supabase/tests'/('commercial_'+args.upgrade+'_upgrade.test.sql'))
   (OUT/'upgrade-results.log').write_text(result)
   if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
   print(args.upgrade+' historical upgrade PASS',flush=True)
   raise SystemExit(0)
  if args.storage_multipart:
   if not args.storage_schema: raise ValueError('--storage-schema from local Storage required')
   run_storage_multipart(BIN,conn,ENV,run,OUT)
   raise SystemExit(0)
  if args.storage_owners:
   if not args.storage_schema: raise ValueError('--storage-schema from local Storage required')
   run_storage_owners(BIN,conn,ENV,run,OUT)
   raise SystemExit(0)
  if args.writers:
   run_write_races(BIN,conn,ENV,run,OUT)
   raise SystemExit(0)
  if not args.baseline:
   run_tombstone_race(BIN,conn,ENV,run,OUT/'concurrency-results.log')
  if args.concurrency:
   raise SystemExit(0)
  if args.postgrest_bin:
   run('psql',*conn,'-c',"create role bridge_fixture login noinherit; grant anon,authenticated,service_role to bridge_fixture;")
   if not args.baseline:
    run('psql',*conn,'-c',"insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://fixture.clerk.invalid',array['https://app.invalid'],true)")
   else:
    # Original managed profiles SELECT is a Supabase default privilege.
    run('psql',*conn,'-c','grant select on public.profiles to authenticated')
   account=run('psql',*conn,'-c',"select public.native_resolve_account('https://fixture.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa')").strip()
   if not args.before_b01 and not args.baseline:
    run('psql',*conn,'-c',"update private.clerk_issuers set native_data_issuer='http://127.0.0.1:54321/native-data/v1' where issuer='https://fixture.clerk.invalid'")
   with socket.socket() as probe:
    probe.bind(('127.0.0.1',0)); http_port=probe.getsockname()[1]
   env=ENV|{'PGRST_DB_URI':f'postgres://bridge_fixture@127.0.0.1:{port}/postgres',
     'PGRST_DB_SCHEMAS':'public','PGRST_DB_ANON_ROLE':'anon','PGRST_SERVER_HOST':'127.0.0.1','PGRST_SERVER_PORT':str(http_port),
     'GHCRTS':'-N2', 'PGRST_DB_POOL':'2', 'PGRST_JWT_SECRET':'commercial-fixture-signing-material-local-only-32-bytes',
     'PGRST_JWT_AUD':'authenticated' if args.before_b01 or args.baseline else 'vantare-native-data'}
   with (OUT/'postgrest.log').open('w') as log:
    proc=subprocess.Popen([args.postgrest_bin],env=env,stdout=log,stderr=log)
    try:
     for attempt in range(100):
      try:
       with socket.create_connection(('127.0.0.1',http_port),timeout=.1): break
      except OSError:
       if proc.poll() is not None: raise RuntimeError('PostgREST startup failed')
       time.sleep(.1) # TCP readiness; avoids repeated OpenAPI introspection.
     script=ROOT/'supabase/tests/commercial-bearers.ts'
     config=ROOT/'supabase/functions/deno.json'
     if args.deno_bin.endswith('.exe'):
      def wp(p): return 'C:'+str(p)[6:]
      script,config=wp(script),wp(config)
     read_root=ROOT/'supabase/functions'
     if args.deno_bin.endswith('.exe'): read_root=wp(read_root)
     reads=str(read_root)
     if args.signer_module: reads+=','+args.signer_module.removeprefix('file:///')
     generator=[args.deno_bin,'run','--cached-only','--no-lock','--allow-read='+reads,'--config',str(config),str(script),account]
     if args.signer_module: generator.append(args.signer_module)
     tokens_result=subprocess.run(generator,env=ENV,capture_output=True,text=True,timeout=30)
     if tokens_result.returncode: raise RuntimeError('Bearer fixture generation failed: '+tokens_result.stderr)
     tokens=json.loads(tokens_result.stdout)
     if args.baseline:
      def old_profile():
       req=urllib.request.Request(f'http://127.0.0.1:{http_port}/profiles?select=id',headers={'Authorization':'Bearer '+tokens['valid']})
       with urllib.request.urlopen(req,timeout=5) as r: return json.load(r)
      assert old_profile()==[{'id':account}], 'B03 baseline bearer must work before deletion'
      try:
       run('psql',*conn,'-c',"select public.apply_clerk_user_event('baseline-deleted',repeat('e',64),'https://fixture.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.deleted',now(),null)")
      except RuntimeError as failure:
       assert 'apply_clerk_user_event' in str(failure) and 'does not exist' in str(failure), 'unexpected baseline database failure'
      leaked=old_profile()
      (OUT/'jwt-results.log').write_text('B03 signed prior bearer own profile before user.deleted: 1; after deletion delivery: '+str(len(leaked))+'\n')
      assert leaked==[], 'B03: historical valid bearer still reads profile after user.deleted'
     def reset(token):
      req=urllib.request.Request(f'http://127.0.0.1:{http_port}/rpc/reset_active_device',data=b'{"device_fingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
      try:
       with urllib.request.urlopen(req,timeout=30) as r: return r.status
      except urllib.error.HTTPError as e: return e.code
     status=reset(tokens['valid'])
     (OUT/'jwt-results.log').write_text('actual authorize handler JWT / own reset status='+str(status)+'\n')
     assert status==204, f'Clerk-only reset expected 204, got {status}'
     def profiles(token):
      headers={'Authorization':'Bearer '+token} if token else {}
      with urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{http_port}/profiles?select=id',headers=headers),timeout=5) as r:
       return json.load(r)
     assert profiles(tokens['valid'])==[{'id':account}], 'own RLS profile missing'
     assert profiles(tokens['other'])==[], 'signed mismatching UUID read profile'
     # Anonymous may receive 401/403 or an empty RLS result; never private data.
     try: assert profiles(None)==[], 'anonymous read profile'
     except urllib.error.HTTPError as e: assert e.code in (401,403)
     results=[]
     for name,token in tokens.items():
      if name=='valid': continue
      code=reset(token); assert code>=400, f'{name} unexpectedly authorized'
      results.append(name+': denied '+str(code))
     has_b02=run('psql',*conn,'-c',"select to_regclass('public.billing_access_blocks') is not null").strip()=='t'
     if has_b02:
      fixture=f"""
        select public.billing_record_order_snapshot('sandbox','native-pro','{account}','fixture-pro',null,'paid',true,100,'eur',0,now(),repeat('a',64),'native-subscription');
        insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,valid_until,resource_modified_at,snapshot_hash)
         values('{account}','polar','sandbox','subscription','native-subscription','vantare.plan.pro','active',now()+interval '1 day',now(),repeat('a',64)),
          ('{account}','polar','sandbox','order','native-independent-launch','vantare.edition.launch_v1','active',null,now(),repeat('b',64));
        select public.billing_record_refund_snapshot('sandbox','native-refund','native-pro',null,'pending',10,'eur',now()+interval '1 second',repeat('c',64));
        select public.billing_sync_order_access('sandbox','native-pro','["vantare.plan.pro"]');
      """
      run('psql',*conn,'-c',fixture)
      license_script=ROOT/'supabase/tests/commercial-license.ts'
      if args.deno_bin.endswith('.exe'): license_script=wp(license_script)
      issued=subprocess.run([args.deno_bin,'run','--cached-only','--no-lock','--config',str(config),'--allow-net=127.0.0.1:'+str(http_port),str(license_script),f'http://127.0.0.1:{http_port}',account],env=ENV,capture_output=True,text=True,timeout=30)
      if issued.returncode: raise RuntimeError('Native SQL emission fixture failed: '+issued.stderr)
      (OUT/'native-issuance.log').write_text(issued.stdout)
      print(issued.stdout.strip(),flush=True)
     run('psql',*conn,'-c',"select public.apply_clerk_user_event('jwt-delete',repeat('d',64),'https://fixture.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.deleted',now(),null)")
     code=reset(tokens['valid']); assert code>=400,'previous bearer survived deletion'
     assert profiles(tokens['valid'])==[], 'previous bearer read profile after deletion'
     results.append('previous bearer after tombstone: denied '+str(code))
     with (OUT/'jwt-results.log').open('a') as result_log: result_log.write('\n'.join(results)+'\n')
     print('PostgREST real signed bridge JWT: own reset + 9 denials PASS',flush=True)
    finally:
     proc.terminate(); proc.wait(timeout=10)
  suites=['clerk_identity_cutover_test.sql',
   'billing_webhook_inbox.test.sql','billing_commercial_projection.test.sql',
   'billing_reconciliation.test.sql','billing_subscription_lifecycle.test.sql',
   'billing_observability.test.sql','operational_access.test.sql']
  for optional in ['commercial_tombstone.test.sql','commercial_data_boundary.test.sql','commercial_refunds.test.sql']:
   if (ROOT/'supabase/tests'/optional).exists(): suites.append(optional)
  for name in suites:
   try: result=run('psql',*conn,'-f',ROOT/'supabase/tests'/name)
   except Exception as e:
    (OUT/(name+'.log')).write_text(str(e)); raise
   (OUT/(name+'.log')).write_text(result)
   if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
   print(name+' PASS',flush=True)
  if not args.baseline:
   run_write_races(BIN,conn,ENV,run,OUT)
 finally: run('pg_ctl','-D',data,'-m','fast','-w','stop')
