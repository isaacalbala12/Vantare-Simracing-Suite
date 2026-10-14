from pathlib import Path
import subprocess,time,re
import argparse
args=argparse.ArgumentParser()
args.add_argument('--output', type=Path, required=True)
args.add_argument('--test', default='native_admin.test.sql')
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
 bootstrap="""
 create schema if not exists auth; create schema if not exists extensions; create schema if not exists storage;
 create extension if not exists pgcrypto with schema extensions; create extension if not exists pgtap;
 do $$begin create role anon noinherit; exception when duplicate_object then null; end$$;
 do $$begin create role authenticated noinherit; exception when duplicate_object then null; end$$;
 do $$begin create role service_role noinherit bypassrls; exception when duplicate_object then null; end$$;
 create table if not exists auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}'::jsonb);
 create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create or replace function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true),'role','authenticated'))$$;
 create table if not exists storage.buckets(id text primary key,name text unique not null,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
 create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner_id text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(bucket_id,name));
 alter table storage.objects enable row level security;
 create or replace function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
 grant insert on storage.objects to authenticated; grant select,insert,update,delete on storage.objects,storage.buckets to service_role;
 """
 (out/'baseline-sql-bootstrap.log').write_text(sql(bootstrap))
 for f in sorted((root/'supabase/migrations').glob('*.sql')):
  try: (out/('baseline-'+f.name+'.log')).write_text(sql(f.read_text(),'supabase_admin' if f.name=='20261010001000_visual_roadmap_clickup.sql' else 'postgres'))
  except Exception as e:
   (out/('baseline-'+f.name+'.log')).write_text(str(e)); raise
 f=root/'supabase/tests'/opts.test
 result=sql(f.read_text()); (out/'result.tap').write_text(result)
 if re.search(r'^not ok|^# Looks like',result,re.M): raise RuntimeError('pgTAP failure')
 print('PASS SQL local',len(re.findall(r'^ok [0-9]+',result,re.M)),'pgTAP checks')
finally: run(['docker','rm','-f',name])
