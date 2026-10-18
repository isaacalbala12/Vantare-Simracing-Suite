from pathlib import Path
import subprocess,time,re,os,sys
import argparse
args=argparse.ArgumentParser()
args.add_argument('--output', type=Path, required=True)
args.add_argument('--test', action='append')
args.add_argument('--mail-e2e', action='store_true')
args.add_argument('--migration-newlines', choices=['lf', 'crlf'], default='lf',
 help='Exercise migration function patches with Unix or Windows source newlines')
opts=args.parse_args()
root=Path(__file__).resolve().parents[2]
out=opts.output
out.mkdir(parents=True,exist_ok=True)
name='vantare-1627-local'
def run(args,sql=None):
 r=subprocess.run(args,input=sql,text=True,capture_output=True,timeout=60)
 if r.returncode: raise RuntimeError(r.stdout+r.stderr)
 return r.stdout+r.stderr
def sql(s,actor='postgres'): return run(['docker','exec','-i',name,'psql','-X','-At','-v','ON_ERROR_STOP=1','-U',actor,'-d','admin_1627'],s)
run(['docker','run','--rm','-d','--network','none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','public.ecr.aws/supabase/postgres:17.6.1.165'])
try:
 for i in range(100):
  if 'PostgreSQL init process complete' in run(['docker','logs',name]) and subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],capture_output=True).returncode==0: break
  time.sleep(.2)
 else: raise RuntimeError('postgres startup')
 run(['docker','exec',name,'createdb','-U','postgres','--template=template0','admin_1627'])
 # Reuse the full disposable auth/storage contract maintained by nightly.
 runner=(root/'supabase/tests/run-supabase-hardening-postgres.ps1').read_text(encoding='utf-8')
 bootstrap=runner.split("Write-Utf8NoBom $bootstrap @'",1)[1].split("'@",1)[0]
 bootstrap += """
create or replace function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;"""
 (out/'baseline-sql-bootstrap.log').write_text(sql(bootstrap))
 for f in sorted((root/'supabase/migrations').glob('*.sql')):
  source=f.read_text(encoding='utf-8')
  if opts.migration_newlines=='crlf': source=source.replace('\n','\r\n')
  try: (out/('baseline-'+f.name+'.log')).write_text(sql(source,'supabase_admin' if f.name=='20261010001000_visual_roadmap_clickup.sql' else 'postgres'))
  except Exception as e:
   (out/('baseline-'+f.name+'.log')).write_text(str(e)); raise
 total=0
 for test in opts.test or ['native_admin.test.sql']:
  f=root/'supabase/tests'/test
  result=sql(f.read_text(encoding='utf-8')); (out/(f.stem+'.tap')).write_text(result)
  if re.search(r'^not ok|^# Looks like',result,re.M): raise RuntimeError('pgTAP failure: '+test)
  count=len(re.findall(r'^ok [0-9]+',result,re.M)); total+=count
  print('PASS SQL local',test,count,'pgTAP checks',flush=True)
 print('TOTAL',total,'pgTAP checks')
 if opts.mail_e2e:
  test_env=os.environ.copy()
  test_env.update(MARKETING_SQL_E2E='true',MARKETING_SQL_TEST_CONTAINER=name,MARKETING_SQL_TEST_DATABASE='admin_1627')
  result=subprocess.run(['deno','test','--config',str(root/'supabase/functions/deno.json'),'--node-modules-dir=auto','--frozen','--allow-env','--allow-run=docker',str(root/'supabase/tests/marketing-mail-e2e.ts')],cwd=root/'supabase/functions',env=test_env,text=True,capture_output=True,timeout=120)
  (out/'marketing-mail-e2e.log').write_text(result.stdout+result.stderr)
  if result.returncode:
   print(result.stdout+result.stderr,file=sys.stderr,flush=True)
   raise RuntimeError('marketing E2E failed; see marketing-mail-e2e.log')
  print('PASS marketing consent/erasure E2E with real PostgreSQL and SaaS doubles',flush=True)
finally: run(['docker','rm','-f',name])
