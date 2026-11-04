"""Exact admin rollback and real owner/revocation serialization, local DB only."""
import json
import select
import subprocess
import time
from pathlib import Path

STEM = '20261104005000_isa_1910_admin_owner_authority'
SNAPSHOT = """select json_object_agg(p.oid::regprocedure::text,json_build_object(
 'digest',md5(replace(pg_get_functiondef(p.oid),E'\\r\\n',E'\\n')),'acl',p.proacl::text))
 from pg_proc p where p.oid in ('private.native_admin_require_owner(uuid)'::regprocedure,
 'public.testing_contribution_review(uuid,text,text,jsonb)'::regprocedure)"""


def run_admin_owner_precheck(run, conn, out, bin_dir, env):
    actor = '19100400-0000-4000-8000-000000000091'
    target = '19100400-0000-4000-8000-000000000092'
    report = '19100400-0000-4000-8000-000000000093'
    claims = json.dumps(dict(iss='https://owner-precheck.invalid',sub='user_precheck',
        role='authenticated',sid='sess_fixture',azp='https://app.invalid'))
    run('psql',*conn,'-c',f"""insert into public.profiles(id) values('{actor}'),('{target}');
      insert into private.clerk_issuers(issuer,authorized_parties,enabled)
        values('https://owner-precheck.invalid',array['https://app.invalid'],true);
      insert into public.account_identities(issuer,subject,account_id)
        values('https://owner-precheck.invalid','user_precheck','{actor}');
      insert into public.testing_contributions(id,account_id,channel,title,body)
        values('{report}','{target}','master','Synthetic','Synthetic');""")
    holder = subprocess.Popen([str(bin_dir/'psql'),*conn,'-q'],env=env,
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        holder.stdin.write(f"begin; do $$begin perform private.lock_accounts_before_rows(array['{target}'::uuid]); end$$; select 'ready';\n")
        holder.stdin.flush()
        assert select.select([holder.stdout],[],[],10)[0]
        assert holder.stdout.readline().strip() == 'ready'
        # The target is explicitly locked until this request finishes. Lock
        # timeout makes any attempted target lock fail; elapsed time is no oracle.
        result = subprocess.run([str(bin_dir/'psql'),*conn,'-q','-c',
            "set lock_timeout='1s'; set statement_timeout='5s'; set role authenticated; "+
            f"select set_config('request.jwt.claims','{claims}',false); "+
            f"select public.testing_contribution_review('{report}','declined','Synthetic',null);"],
            env=env,text=True,capture_output=True,timeout=10)
        (out/'admin-owner-precheck.log').write_text(result.stdout+result.stderr,encoding='utf-8')
        assert result.returncode and '42501' in result.stderr and 'testing_owner_required' in result.stderr, result.stderr
        assert '55P03' not in result.stderr
    finally:
        if holder.poll() is None:
            holder.communicate('rollback;\n\\q\n',timeout=10)
        # Other suites assert global report counts. Remove the committed report
        # after releasing its locks, including on failure. Durable identities,
        # like other race fixtures, live only until this disposable DB is dropped.
        run('psql',*conn,'-c',f"delete from public.testing_contributions where id='{report}'")
    assert run('psql',*conn,'-c',f"select count(*) from public.testing_contributions where id='{report}'").strip()=='0'
    print('Admin owner: non-owner denied while target UUID remains locked PASS',flush=True)


def run_admin_owner_regressions(run, conn, out, bin_dir, env, previous):
    root = Path(__file__).resolve().parents[2]
    current = json.loads(run('psql', *conn, '-c', SNAPSHOT))
    probe = out/'owner-missing-authority.sql'
    probe.write_text("begin; alter function private.is_owner(uuid) rename to is_owner_unavailable_1910;\n\\ir "+
        str(root/'supabase/migrations'/(STEM+'.sql'))+'\n',encoding='utf-8')
    missing = subprocess.run([str(bin_dir/'psql'),*conn,'-f',str(probe)],
        env=env,text=True,capture_output=True,timeout=20)
    (out/'owner-missing-authority.log').write_text(missing.stdout+missing.stderr,encoding='utf-8')
    assert missing.returncode and '55000' in missing.stderr and 'native_admin_requires_r6_owner_authority' in missing.stderr
    assert json.loads(run('psql',*conn,'-c',SNAPSHOT)) == current, 'missing dependency changed admin bodies/ACLs'
    assert run('psql',*conn,'-c',"select to_regprocedure('private.is_owner(uuid)') is not null").strip()=='t'
    run('psql', *conn, '-f', root/'supabase/rollbacks'/(STEM+'.down.sql'))
    assert json.loads(run('psql', *conn, '-c', SNAPSHOT)) == previous, 'owner rollback must restore both exact bodies and ACLs'
    run('psql', *conn, '-f', root/'supabase/migrations'/(STEM+'.sql'))
    assert json.loads(run('psql', *conn, '-c', SNAPSHOT)) == current, 'owner reapply drift'
    assert all(current[key]['acl'] == previous[key]['acl'] for key in current), 'owner cutover changed ACLs'
    (out/'admin-owner-fingerprints.json').write_text(json.dumps(dict(previous=previous,current=current),indent=2)+'\n')
    actor = '19100400-0000-4000-8000-000000000099'
    run('psql', *conn, '-c', f"insert into public.profiles(id) values('{actor}')")
    def assignment(action):
        return f"select * from public.operational_access_set('{actor}','owner','{action}','test:owner-race','Owner serialization','test:owner-race-{action}',null)"
    authorize = f"do $$begin perform private.native_admin_require_owner('{actor}'); end$$;"
    results = []
    for revoke_first in (False, True):
        run('psql', *conn, '-c', assignment('grant'))
        first, second = (assignment('revoke')+';', authorize) if revoke_first else (authorize, assignment('revoke')+';')
        # DO consumes any result so the readiness marker is unambiguous.
        if revoke_first:
            first = first.replace('select * from ', 'do $$begin perform ', 1).rstrip(';')+'; end$$;'
        holder = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q'], env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        waiter = None
        try:
            holder.stdin.write("begin; set local statement_timeout='12s'; "+first+" select 'ready';\n")
            holder.stdin.flush()
            assert select.select([holder.stdout], [], [], 10)[0], 'owner lock readiness timeout'
            assert holder.stdout.readline().strip() == 'ready', 'owner first transaction failed'
            waiter = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q', '-c',
                "set statement_timeout='12s'; "+second], env={**env,'PGAPPNAME':'vanta132-owner-waiter'},
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            deadline = time.monotonic()+8
            while True:
                blocked = run('psql', *conn, '-c', """select exists(select 1 from pg_stat_activity
                  where application_name='vanta132-owner-waiter' and wait_event_type='Lock'
                  and cardinality(pg_blocking_pids(pid))>0)""").strip()
                if blocked == 't': break
                assert time.monotonic() < deadline, 'owner/revocation did not serialize'
                time.sleep(.02)  # Poll throttle; observed lock is the synchronization.
            _, error = holder.communicate('commit;\n\\q\n', timeout=12)
            assert holder.returncode == 0, error
            stdout, stderr = waiter.communicate(timeout=12)
            assert waiter.returncode == (1 if revoke_first else 0), (stdout,stderr)
            if revoke_first: assert '42501' in stderr and 'native_admin_forbidden' in stderr
            assert run('psql', *conn, '-c', f"select private.is_owner('{actor}')").strip() == 'f'
            results.append(dict(revoke_first=revoke_first,blocked=True,second_exit=waiter.returncode))
        finally:
            for process in (waiter, holder):
                if process is not None and process.poll() is None:
                    process.kill()
                    process.communicate()
    # Lower target UUID is held first. Public review must wait BEFORE taking
    # the actor UUID, so this transaction can then take that higher UUID.
    target = '19100400-0000-4000-8000-000000000098'
    report = '19100400-0000-4000-8000-000000000097'
    run('psql', *conn, '-c', assignment('grant'))
    run('psql', *conn, '-c', f"""insert into public.profiles(id) values('{target}');
      insert into private.clerk_issuers(issuer,authorized_parties,enabled)
        values('https://owner-race.invalid',array['https://app.invalid'],true);
      insert into public.account_identities(issuer,subject,account_id)
        values('https://owner-race.invalid','user_ownerrace','{actor}');
      insert into public.testing_contributions(id,account_id,channel,title,body)
        values('{report}','{target}','master','Synthetic','Synthetic');""")
    proposal = json.dumps(dict(schema='vantare.triage.v2',verdict='dudoso',
        criteria=dict(contenido_minimo='si',evidencia='debil',no_duplicado='si'),
        duplicate_of=None,severity='baja',area='testing-center',evidence_refs=[],
        summary='Synthetic',preliminary_fix=None,confidence=.5,reasons=[],trazable='si'))
    claims = json.dumps(dict(iss='https://owner-race.invalid',sub='user_ownerrace',
        role='authenticated',sid='sess_fixture',azp='https://app.invalid'))
    holder = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q'], env=env,
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    waiter = None
    try:
        holder.stdin.write(f"begin; set local statement_timeout='8s'; do $$begin perform private.lock_accounts_before_rows(array['{target}'::uuid]); end$$; select 'ready';\n")
        holder.stdin.flush()
        assert select.select([holder.stdout],[],[],10)[0]
        assert holder.stdout.readline().strip() == 'ready'
        waiter = subprocess.Popen([str(bin_dir/'psql'), *conn, '-q', '-c',
            "set statement_timeout='12s'; set role authenticated; "+
            f"select set_config('request.jwt.claims','{claims}',false); "+
            f"select public.testing_contribution_review('{report}','declined','Synthetic','{proposal}'::jsonb);"],
            env={**env,'PGAPPNAME':'vanta132-public-review-waiter'},
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        deadline = time.monotonic()+8
        while True:
            blocked = run('psql',*conn,'-c',"""select exists(select 1 from pg_stat_activity
              where application_name='vanta132-public-review-waiter' and wait_event_type='Lock'
              and cardinality(pg_blocking_pids(pid))>0)""").strip()
            if blocked == 't': break
            if waiter.poll() is not None:
                stdout,stderr=waiter.communicate()
                raise AssertionError(('public review exited before target lock',stdout,stderr))
            assert time.monotonic() < deadline, 'public review did not reach target lock'
            time.sleep(.02)  # Readiness is the lock, not elapsed time.
        _, error = holder.communicate(authorize+' commit;\n\\q\n',timeout=12)
        stdout, stderr = waiter.communicate(timeout=15)
        assert holder.returncode == 0 and waiter.returncode == 0, (error,stdout,stderr)
        assert run('psql',*conn,'-c',f"select state from public.testing_contributions where id='{report}'").strip()=='declined'
        results.append(dict(case='lower-target-before-owner',blocked=True,second_exit=0))
    finally:
        for process in (waiter,holder):
            if process is not None and process.poll() is None:
                process.kill()
                process.communicate()
    (out/'admin-owner-races.json').write_text(json.dumps(results,indent=2)+'\n')
    print('Admin owner: exact rollback/ACL/reapply, revocation orders and public UUID order PASS',flush=True)
