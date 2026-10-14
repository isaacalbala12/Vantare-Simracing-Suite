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
