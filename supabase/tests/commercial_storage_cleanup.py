"""Fixture only; fixed local disposable containers, synthetic JWTs, no external DSN."""
from pathlib import Path
import argparse
import sys,subprocess,json,base64,hmac,hashlib,time,uuid,urllib.request,urllib.error,datetime,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'supabase/tests'))
from commercial_write_cases import SETUP
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',required=True)
parser.add_argument('--phase',choices=['red','red-isolation','green'],required=True)
parser.add_argument('--replay', action='store_true', help='Drain prior synthetic rows after recovery; no new data')
parser.add_argument('--expect-outage', action='store_true', help='Replay expects a real backend failure')
args=parser.parse_args()
OUT=Path(args.output).resolve();OUT.mkdir(parents=True,exist_ok=True)
C=json.loads((OUT/'storage-fixture-auth.json').read_text());C['url']='http://127.0.0.1:54330'
# These fixtures are provisioned by tools/storage/README.md, never a real stack.
phase=args.phase;log=[]
def sql(s):
 r=subprocess.run(['docker','exec','-i','supabase_db_stack','psql','-X','-U','supabase_admin','-d','postgres','-At','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True)
 log.append(r.stdout+r.stderr)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
def s3(method,name,query='',data=b'',token=None):
 from urllib.parse import quote
 path='/storage/v1/s3/testing-center-evidence/'+quote(name,safe='/~')
 date=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');day=date[:8];sha=hashlib.sha256(data).hexdigest()
 hs={'host':'127.0.0.1:54330','x-amz-content-sha256':sha,'x-amz-date':date,'x-amz-security-token':token or C['serviceKey']}
 names=';'.join(sorted(hs));headers=''.join(k+':'+hs[k]+'\n' for k in sorted(hs));canonical=method+'\n'+path+'\n'+query+'\n'+headers+'\n'+names+'\n'+sha
 scope=day+'/us-east-1/s3/aws4_request';k=('AWS4'+C['anonKey']).encode()
 for v in (day,'us-east-1','s3','aws4_request'):k=hmac.new(k,v.encode(),hashlib.sha256).digest()
 sig=hmac.new(k,('AWS4-HMAC-SHA256\n'+date+'\n'+scope+'\n'+hashlib.sha256(canonical.encode()).hexdigest()).encode(),hashlib.sha256).hexdigest()
 hs['content-type']='image/png';hs['authorization']='AWS4-HMAC-SHA256 Credential=stub/'+scope+', SignedHeaders='+names+', Signature='+sig
 req=urllib.request.Request(C['url']+path+'?'+query,data=data,headers=hs,method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:return r.status,r.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
def token(role,secret):
 def enc(v):return base64.urlsafe_b64encode(json.dumps(v).encode()).rstrip(b'=').decode()
 b=enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'role':role,'iss':'fixture','exp':int(time.time())+3600})
 return b+'.'+base64.urlsafe_b64encode(hmac.new(secret,b.encode(),hashlib.sha256).digest()).rstrip(b'=').decode()
rows=[]
try:
 for mode in (() if args.replay else ('null','uuid','outage')):
  vals={k:str(uuid.uuid4()) for k in ('a','batch','evidence','license','attempt','questionnaire','contribution','new_id','other','inbox')}
  tag=phase+'-'+mode+'-'+str(uuid.uuid4())[:8]
  vals.update(case=tag,issuer='https://'+tag+'.clerk.invalid',subject='user_'+tag.replace('-','_'),h='b'*64,h2='c'*64,sha='b'*40)
  sql(SETUP.format(**vals))
  name='v1/'+('a'*32)+'/'+vals['batch']+'/'+vals['evidence']
  status,body=s3('POST',name,'uploads=');log.append('create '+mode+' '+str(status));assert status==200,body
  upload=next(e.text for e in ET.fromstring(body).iter() if e.tag.endswith('UploadId'))
  if mode=='uuid':sql(f"update storage.s3_multipart_uploads set owner_id='{vals['a']}' where id='{upload}';")
  status,body=s3('PUT',name,'partNumber=1&uploadId='+upload,b'multipart-private-fixture-bytes')
  log.append('part '+mode+' '+str(status));assert status==200,body
  object_name='complete-'+tag+'.png';png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j+WQAAAAASUVORK5CYII=')
  req=urllib.request.Request(C['url']+'/storage/v1/object/testing-center-evidence/'+object_name,data=png,headers={'authorization':'Bearer '+C['serviceKey'],'content-type':'image/png'},method='POST')
  with urllib.request.urlopen(req,timeout=15) as r:assert r.status==200;r.read()
  version=sql(f"select version from storage.objects where bucket_id='testing-center-evidence' and name='{object_name}';")
  object_path='/tmp/r5-storage/fixture-bucket/stub/testing-center-evidence/'+object_name+'/'+version
  assert subprocess.run(['docker','exec','isa1608-r6-storage','test','-f',object_path],capture_output=True).returncode==0,'completed backend must exist before cleanup'
  req=urllib.request.Request(C['url']+'/storage/v1/object/authenticated/testing-center-evidence/'+object_name,headers={'authorization':'Bearer '+C['serviceKey']})
  with urllib.request.urlopen(req,timeout=15) as r:assert r.status==200 and r.read()==png
  log.append('completed private PNG '+mode+' before cleanup: 68 bytes/backend present')
  sql(f"update storage.objects set owner_id='{vals['a']}' where name='{object_name}'; select public.apply_clerk_user_event('{tag}',repeat('e',64),'{vals['issuer']}','{vals['subject']}','user.deleted',now(),null);")
  # Existing barrier must still reject service writes after deletion.
  status,body=s3('POST',name,'uploads=');log.append('late write '+mode+' '+str(status));assert status>=400
  if phase.startswith('green'):
   etag=sql(f"select etag from storage.s3_multipart_uploads_parts where upload_id='{upload}' and part_number=1;")
   complete=('<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>'+etag+'</ETag></Part></CompleteMultipartUpload>').encode()
   for method,query,data,label in [('PUT','partNumber=2&uploadId='+upload,b'late-private-bytes','late part'),('POST','uploadId='+upload,complete,'late complete')]:
    status,body=s3(method,name,query,data);log.append('denied '+mode+' '+label+' HTTP '+str(status));assert status>=400
   for denied_name,denied_token,label in [(name+'-wrong',None,'wrong path'),(name,token('authenticated',b'isa1608-r6-storage-signing-material-32-bytes'),'nonservice JWT'),(name,token('service_role',b'invalid-fixture-signature'),'forged service JWT')]:
    status,body=s3('DELETE',denied_name,'uploadId='+upload,token=denied_token)
    log.append('denied '+mode+' '+label+' HTTP '+str(status));assert status>=400
   assert sql(f"select count(*) from storage.s3_multipart_uploads where id='{upload}';")=='1'
  rows.append({'mode':mode,'issuer':vals['issuer'],'subject':vals['subject'],'upload_id':upload,'name':name,'objectName':object_name,'failAbort':mode=='outage','objectVersion':version})
 if args.replay:
  for prior in sorted(OUT.glob('storage-*-rows.json')):
   rows.extend(json.loads(prior.read_text()))
  rows=list({r['upload_id']:r for r in rows}.values())
  if args.expect_outage:rows=[r for r in rows if sql(f"select count(*) from storage.s3_multipart_uploads where id='{r['upload_id']}';")=='1']
  assert rows,'replay must exercise at least one synthetic row'
  for row in rows:row.update(failAbort=args.expect_outage,realAbort=True)
 else:(OUT/('storage-'+phase+'-rows.json')).write_text(json.dumps(rows))
 dbkey=token('service_role',b'super-secret-jwt-token-with-at-least-32-characters-long')
 r=subprocess.run(['deno','run','--no-lock','--config',str(ROOT/'supabase/functions/deno.json'),'--allow-env','--allow-net=127.0.0.1:54321,127.0.0.1:54330',str(ROOT/'supabase/tests/commercial-storage-cleanup.ts')],input=json.dumps({'dbUrl':'http://127.0.0.1:54321','dbKey':dbkey,'storage':C,'rows':rows}),text=True,capture_output=True)
 log.append(r.stdout+r.stderr);log.append('cleanup exit '+str(r.returncode))
 for row in rows:
  counts=sql(f"select count(*) from storage.s3_multipart_uploads where id='{row['upload_id']}'; select count(*) from storage.s3_multipart_uploads_parts where upload_id='{row['upload_id']}';")
  log.append(row['mode']+' persisted upload/parts='+counts)
  if phase=='green':assert counts.splitlines()==(['1','1'] if row['failAbort'] else ['0','0'])
  p=subprocess.run(['docker','exec','isa1608-r6-storage','test','-d','/tmp/r5-storage/multiparts/'+row['upload_id']],capture_output=True)
  log.append(row['mode']+' multipart backend present='+str(p.returncode==0))
  if phase.startswith('green'):assert (p.returncode==0)==row['failAbort']
  object_path='/tmp/r5-storage/fixture-bucket/stub/testing-center-evidence/'+row['objectName']+'/'+row['objectVersion']
  f=subprocess.run(['docker','exec','isa1608-r6-storage','test','-f',object_path],capture_output=True)
  log.append(row['mode']+' completed backend present='+str(f.returncode==0))
  if phase.startswith('green'):assert f.returncode!=0
 if phase.startswith('red'):assert r.returncode!=0,'RED must fail unchanged cleaner'
 else:assert r.returncode==0,'GREEN cleaner failed'
 print('Storage real local '+phase+' assertions observed')
finally:(OUT/('storage-'+phase+('-replay-outage' if args.expect_outage else '-replay' if args.replay else '')+'.log')).write_text('\n'.join(log))
