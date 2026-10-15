"""Pause the deployed admin entry, then continue the real RPC; no replacement guards."""
import json
import subprocess
import time
import uuid
from commercial_tombstone_race import read_marker


def run_admin_lock_order(bin_path, conn, env, run, out):
    log, failures = [], []
    def sql(statement):
        return run('psql', *conn, '-c', statement).strip()
    def check(ok, label):
        log.append(('PASS ' if ok else 'FAIL ') + label)
        if not ok:
            failures.append(label)
    try:
        # Actor has its own locked assignment; target has the locked profile.
        for erased in ('actor', 'target'):
            for order in ('writer-first', 'delete-first'):
                actor, target = str(uuid.uuid4()), str(uuid.uuid4())
                label = erased + '-' + order
                issuer = 'https://' + label + '.clerk.invalid'
                account = actor if erased == 'actor' else target
                sql(f"""insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values('{issuer}',array['https://app.invalid'],true);
insert into public.profiles(id,email) values('{actor}','owner@example.invalid'),('{target}','target@example.invalid');
insert into public.account_identities(issuer,subject,account_id) values
('{issuer}','user_admin_actor','{actor}'),('{issuer}','user_admin_target','{target}');
select * from public.operational_access_set('{actor}','owner','grant','fixture:admin','fixture owner','{label}');""")
                params = json.dumps({'account_id': target, 'enabled': True})
                grant = f"select public.native_admin_execute('{actor}','{issuer}','set_tester','{params}','sandbox');"
                subject = 'user_admin_' + erased
                deletion = f"select public.apply_clerk_user_event('{label}',repeat('a',64),'{issuer}','{subject}','user.deleted',now(),null);"
                check('"enabled": true' in sql('begin; ' + grant + ' rollback;'), label + ' valid live RPC')
                source = sql("select prosrc from pg_proc where oid='public.native_admin_execute(uuid,text,text,jsonb,text)'::regprocedure")
                # The R3 admin entry delegates set_tester to its private v1 body.
                # Pause after the actual outer UUID/Owner guards, before that
                # delegation. This also works with nightly's inline mutations;
                # no replacement lock or authorization is installed by the test.
                marker = 'perform private.native_admin_require_owner(p_actor);'
                prefix = source[:source.index(marker) + len(marker)]
                args = f"p_actor uuid:='{actor}'; p_issuer text:='{issuer}'; p_action text:='set_tester'; p_params jsonb:='{params}'; p_environment text:='sandbox';"
                prefix = prefix.replace('declare', 'declare\n' + args, 1)
                # A jsonb helper preserves early RETURN branches of the deployed
                # dispatcher (DO would reject them even for another action).
                first = ("create function pg_temp.admin_prefix() returns jsonb language plpgsql as $prefix$" +
                         prefix + " return '{}'::jsonb; end $prefix$; select pg_temp.admin_prefix();") if order == 'writer-first' else deletion
                second = deletion if order == 'writer-first' else grant
                holder = other = None
                try:
                    holder = subprocess.Popen([str(bin_path/'psql'), *conn, '-q'], env=env,
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    holder.stdin.write(("begin; set local statement_timeout='15s'; set local deadlock_timeout='5s'; " + first + "select 'HELD:'||pg_backend_pid();\n").encode())
                    holder.stdin.flush()
                    pid = int(read_marker(holder, 'HELD:').split('HELD:')[1].splitlines()[0])
                    other = subprocess.Popen([str(bin_path/'psql'), *conn, '-q', '-c',
                        f"begin; set local application_name='{label}'; set local statement_timeout='15s'; set local deadlock_timeout='100ms'; " + second + ' commit;'],
                        env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    deadline, wait = time.monotonic() + 10, ''
                    while time.monotonic() < deadline:
                        wait = sql(f"select wait_event from pg_stat_activity where application_name='{label}' and {pid}=any(pg_blocking_pids(pid))")
                        if wait or other.poll() is not None:
                            break
                        time.sleep(.01)  # Observe the blocker; time does not schedule the race.
                    log.append(label + ' observed wait=' + wait)
                    check(wait == 'advisory', label + ' waits on UUID before rows')
                    holder.stdin.write(((grant if order == 'writer-first' else '') + ' commit;\n').encode())
                    holder.stdin.close()
                    holder.wait(timeout=20)
                    stdout, stderr = other.communicate(timeout=20)
                    holder_error = holder.stderr.read().decode()
                    error = stderr.decode()
                    log += [stdout.decode(), error, holder_error]
                    check(holder.returncode == 0, label + ' first transaction commits')
                    check('40P01' not in error + holder_error, label + ' no deadlock')
                    check(other.returncode == 0 if order == 'writer-first' else other.returncode != 0 and '28000' in error,
                        label + ' deletion commits or late admin rejected')
                    state = sql(f"select email is null from public.profiles where id='{account}'; select bool_and(deleted_at is not null) from public.account_identities where account_id='{account}'; select count(*) from public.operational_access_assignments where user_id='{account}' and status='active';")
                    check(state.splitlines() == ['t', 't', '0'], label + ' erased identity and no active assignment')
                finally:
                    for proc in (holder, other):
                        if proc is not None and proc.poll() is None:
                            proc.kill()
                            proc.wait(timeout=10)
    finally:
        (out/'admin-lock-order.log').write_text('\n'.join(log) + '\n')
    if failures:
        raise AssertionError('\n'.join(failures))
    print('Native admin actor/target, both real transaction orders: PASS', flush=True)
