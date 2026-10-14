"""Storage service persistence, using pg_dump of the real local Storage schema."""
import json
import subprocess
import time
import uuid
from commercial_tombstone_race import read_marker


def run_storage_owners(bin_path, conn, env, run, out):
    log, failures = [], []
    def check(ok, label):
        log.append(('PASS ' if ok else 'FAIL ') + label)
        if not ok: failures.append(label)
    def sql(statement):
        r = subprocess.run([str(bin_path/'psql'), *conn, '-q', '-c', statement],
            env=env, text=True, capture_output=True, timeout=30)
        log.append(r.stdout + r.stderr)
        return r
    try:
        account = str(uuid.uuid4())
        issuer = 'https://storage-owner.clerk.invalid'
        subject = 'user_storage_owner'
        run('psql', *conn, '-c', f"""
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('{issuer}',array['https://app.invalid'],true);
insert into public.profiles(id,email) values('{account}','before@example.invalid');
insert into public.account_identities(issuer,subject,account_id) values('{issuer}','{subject}','{account}');
""")
        check(run('psql', *conn, '-c', "select data_type from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner_id'").strip() == 'text', 'real owner_id text')
        for owner in (account, subject):
            r = sql(f"""begin; set local role supabase_storage_admin;
insert into storage.objects(bucket_id,name,owner_id) values('testing-center-evidence','owner-{owner}','{owner}');
update storage.objects set user_metadata='{{"fixture":true}}' where name='owner-{owner}';
set local storage.allow_delete_query='true'; delete from storage.objects where name='owner-{owner}'; commit;""")
            check(r.returncode == 0, 'live INSERT/UPDATE/DELETE '+owner)
        # Existing textual owner must still be removable after tombstoning.
        r = sql(f"begin; set local role supabase_storage_admin; insert into storage.objects(bucket_id,name,owner_id) values('testing-center-evidence','retained-clerk','{subject}'); commit;")
        check(r.returncode == 0, 'Clerk object persisted before deletion')
        run('psql', *conn, '-c', f"select public.apply_clerk_user_event('storage-owner-delete',repeat('a',64),'{issuer}','{subject}','user.deleted',now(),null)")
        for owner in (account, subject):
            r = sql(f"begin; set local role supabase_storage_admin; insert into storage.objects(bucket_id,name,owner_id) values('testing-center-evidence','late-{owner}','{owner}'); commit;")
            check(r.returncode != 0 and '28000' in r.stderr, 'deleted owner denied '+owner)
        queued = run('psql', *conn, '-c', f"select name from public.clerk_deletion_objects('{issuer}','{subject}')").strip().splitlines()
        check('retained-clerk' in queued, 'textual owner queued for Storage API cleanup')
        r = sql(f"begin; set local role supabase_storage_admin; set local storage.allow_delete_query='true'; delete from storage.objects where name='retained-clerk'; commit;")
        check(r.returncode == 0, 'Storage cleanup DELETE of textual owner after tombstone')
        other = str(uuid.uuid4()); another = str(uuid.uuid4())
        run('psql', *conn, '-c', f"""
insert into public.profiles(id) values('{other}'),('{another}');
insert into public.account_identities(issuer,subject,account_id) values
 ('{issuer}','user_ambiguous','{another}'),
 ('https://second.clerk.invalid','user_ambiguous','{other}');
""")
        for claims in ({}, {'iss':issuer, 'sub':'user_ambiguous', 'role':'authenticated'}):
            r = sql(f"begin; set local request.jwt.claims='{json.dumps(claims)}'; set local role supabase_storage_admin; insert into storage.objects(bucket_id,name,owner_id) values('testing-center-evidence','ambiguous','user_ambiguous'); rollback;")
            check(r.returncode != 0 and '23503' in r.stderr, 'ambiguous persisted subject rejected even with issuer')
    finally:
        (out/'storage-owners.log').write_text('\n'.join(log)+'\n')
    if failures: raise AssertionError('\n'.join(failures))
    print('Storage owner text/UUID/cleanup: PASS', flush=True)


def run_storage_multipart(bin_path, conn, env, run, out):
    log, failures = [], []
    def check(ok, label):
        log.append(('PASS ' if ok else 'FAIL ') + label)
        if not ok: failures.append(label)
    try:
        for mode in ('uuid', 'clerk', 'manifest', 'parent'):
            for operation in ('upload', 'part'):
                case = mode+'-'+operation
                account = str(uuid.uuid4()); batch = str(uuid.uuid4()); evidence = str(uuid.uuid4())
                issuer = 'https://'+case+'.clerk.invalid'; subject = 'user_'+case.replace('-','_')
                path = 'v1/'+('a'*32)+'/'+batch+'/'+evidence
                from commercial_write_cases import SETUP
                values = {k:str(uuid.uuid4()) for k in ('license','attempt','questionnaire','contribution','new_id','other','inbox')}
                values.update(a=account, batch=batch, evidence=evidence, case=case, issuer=issuer,
                    subject=subject, h='a'*64, h2='b'*64, sha='a'*40)
                run('psql', *conn, '-c', SETUP.format(**values))
                owner = 'null' if mode in ('manifest','parent') else "'"+(account if mode=='uuid' else subject)+"'"
                # Parent-only attribution: upload retains the UUID; part has neither owner nor manifest key.
                key = path if mode=='manifest' else case
                upload_owner = "'"+account+"'" if mode=='parent' else owner
                upload = f"insert into storage.s3_multipart_uploads(id,upload_signature,bucket_id,key,version,owner_id,user_metadata) values('{case}','fixture','testing-center-evidence','{key}','fixture',{upload_owner},'{{\"email\":\"before@example.invalid\"}}');"
                part = f"insert into storage.s3_multipart_uploads_parts(upload_id,part_number,bucket_id,key,etag,version,owner_id) values('{case}',1,'testing-center-evidence','{key}','fixture','fixture',{owner});"
                def write(statement):
                    return subprocess.run([str(bin_path/'psql'), *conn, '-q', '-c',
                        'begin; set local role supabase_storage_admin; '+statement+' commit;'],
                        env=env, text=True, capture_output=True, timeout=30)
                if operation=='part':
                    r=write(upload); check(r.returncode==0, case+' existing upload positive control')
                r=write(upload+part if operation=='upload' else part)
                check(r.returncode==0, case+' live service persistence')
                # Remove the positive-control part, retaining the pre-authorized upload.
                run('psql', *conn, '-c', f"delete from storage.s3_multipart_uploads_parts where upload_id='{case}';" + (f"delete from storage.s3_multipart_uploads where id='{case}'" if operation=='upload' else ''))
                deletion=f"select public.apply_clerk_user_event('{case}-delete',repeat('c',64),'{issuer}','{subject}','user.deleted',now(),null);"
                holder=writer=None
                try:
                    holder=subprocess.Popen([str(bin_path/'psql'),*conn,'-q'],env=env,
                        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                    holder.stdin.write(('begin; '+deletion+"select 'DELETED_PENDING:'||pg_backend_pid();\n").encode());holder.stdin.flush()
                    pid=int(read_marker(holder,'DELETED_PENDING:').split('DELETED_PENDING:')[1].splitlines()[0])
                    statement=upload+part if operation=='upload' else part
                    writer=subprocess.Popen([str(bin_path/'psql'),*conn,'-q','-c',
                        f"begin; set local statement_timeout='20s'; set local application_name='{case}'; set local role supabase_storage_admin; "+statement+' commit;'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                    deadline=time.monotonic()+10; blocked=False
                    while writer.poll() is None and time.monotonic()<deadline:
                        blocked=run('psql',*conn,'-c',f"select exists(select 1 from pg_stat_activity where application_name='{case}' and {pid}=any(pg_blocking_pids(pid)))").strip()=='t'
                        if blocked: break
                        time.sleep(.01) # Observe PG lock state; never schedule the race by time.
                    early_retry = False
                    if not blocked and writer.poll() is not None:
                        early_stdout,early_stderr=writer.communicate(timeout=30)
                        early_retry='40001' in early_stderr.decode()
                    check(blocked or early_retry,case+' final write waits or aborts with typed 40001 while deletion is pending')
                    holder.stdin.write(b'commit;\n');holder.stdin.close();holder.wait(timeout=30)
                    check(holder.returncode==0,case+' deletion committed')
                    stdout,stderr=writer.communicate(timeout=30);stderr=stderr.decode();write_exit=writer.returncode;log.append(stdout.decode()+stderr)
                    if early_retry:
                        retried=write(statement);stderr=retried.stderr;write_exit=retried.returncode
                        log.append('Full service persistence transaction retried after deletion commit: '+stderr)
                    check(write_exit!=0 and '28000' in stderr,case+' pending-authorized write rejected after tombstone')
                finally:
                    for proc in (holder,writer):
                        if proc is not None and proc.poll() is None: proc.kill();proc.wait(timeout=10)
                r=write(upload+part if operation=='upload' else part);log.append(r.stdout+r.stderr)
                check(r.returncode!=0 and '28000' in r.stderr,case+' committed tombstone rejects repeat service write')
                check(run('psql',*conn,'-c',f"select count(*) from storage.s3_multipart_uploads_parts where upload_id='{case}'").strip()=='0',case+' no resurrected parts')
                uploads_left=run('psql',*conn,'-c',f"select count(*) from storage.s3_multipart_uploads where id='{case}'").strip()
                check(uploads_left==('1' if operation=='part' else '0'),case+' no resurrected upload; prior upload only remains queued')
                if operation=='part':
                    try:
                        queue=run('psql',*conn,'-c',f"select upload_id from public.clerk_deletion_uploads('{issuer}','{subject}')").strip().splitlines()
                        check(queue==[case],case+' existing upload queued for API abort')
                    except RuntimeError as e: log.append(str(e));check(False,case+' upload abort queue missing')
    finally:
        (out/'storage-multipart.log').write_text('\n'.join(log)+'\n')
    if failures: raise AssertionError('\n'.join(failures))
    print('Storage multipart: 8 real two-transaction scenarios PASS',flush=True)
