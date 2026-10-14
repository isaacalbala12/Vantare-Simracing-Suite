"""Disposable loopback PostgreSQL only. Run under WSL; never accepts a DSN."""
import argparse, os, pathlib, socket, subprocess, tempfile
parser=argparse.ArgumentParser()
parser.add_argument('--pg-bin', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--baseline', action='store_true')
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
 conn=['-X','-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At']
 try:
  runner=(ROOT/'supabase/tests/run-supabase-hardening-postgres.ps1').read_text()
  bootstrap=runner.split("Write-Utf8NoBom $bootstrap @'",1)[1].split("'@",1)[0]
  (OUT/'bootstrap.sql').write_text(bootstrap)
  run('psql',*conn,'-c',"alter database postgres set timezone='UTC'")
  run('psql',*conn,'-f',OUT/'bootstrap.sql')
  for m in sorted((ROOT/'supabase/migrations').glob('*.sql')):
   if args.baseline and 'isa_1608_commercial' in m.name: continue
   try: result=run('psql',*conn,'-f',m)
   except Exception as e: raise RuntimeError(m.name+': '+str(e))
   (OUT/(m.name+'.log')).write_text(result)
  suites=['clerk_identity_cutover_test.sql']
  for optional in ['commercial_tombstone.test.sql','commercial_data_boundary.test.sql','commercial_refunds.test.sql']:
   if (ROOT/'supabase/tests'/optional).exists(): suites.append(optional)
  for name in suites:
   try: result=run('psql',*conn,'-f',ROOT/'supabase/tests'/name)
   except Exception as e:
    (OUT/(name+'.log')).write_text(str(e)); raise
   (OUT/(name+'.log')).write_text(result)
   if 'not ok ' in result or '# Looks like' in result: raise RuntimeError(result)
   print(name+' PASS',flush=True)
 finally: run('pg_ctl','-D',data,'-m','fast','-w','stop')

