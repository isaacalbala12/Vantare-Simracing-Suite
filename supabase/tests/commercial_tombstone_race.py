"""Two real transactions: deletion commits while another alias waits on the UUID.

Called only by the disposable loopback runner. No driver/dependency or remote DSN.
"""
import os
import select
import subprocess
import time


def read_marker(proc, marker):
    """Bounded pipe readiness, without relying on psql text-buffer prefetch."""
    output = b""
    deadline = time.monotonic() + 20
    while marker.encode() not in output:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([proc.stdout], [], [], remaining)[0]:
            raise TimeoutError("transaction did not reach " + marker)
        chunk = os.read(proc.stdout.fileno(), 4096)
        if not chunk:
            raise RuntimeError("transaction ended before " + marker)
        output += chunk
    return output.decode().strip()


def run_tombstone_race(bin_path, conn, env, run, output_path):
    failures = []
    log = []

    def check(condition, name):
        log.append(("PASS " if condition else "FAIL ") + name)
        if not condition:
            failures.append(name)

    try:
        for deleted_subject in ("user_delete", "user_alias"):
            for update_hour in ("10", "12"):
                case = deleted_subject + "-update-" + update_hour
                issuer = "https://" + case.replace("_", "-") + ".clerk.invalid"
                update_subject = "user_alias" if deleted_subject == "user_delete" else "user_delete"
                account = run("psql", *conn, "-c", "select gen_random_uuid()").strip()
                run("psql", *conn, "-c", f"""
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('{issuer}',array['https://app.invalid'],true);
insert into public.profiles(id,email,display_name,avatar_url,onboarding_completed)
 values('{account}','before@example.invalid','Before','https://app.invalid/avatar',true);
insert into public.account_identities(issuer,subject,account_id,user_event_at) values
 ('{issuer}','user_delete','{account}','2026-10-14T09:00Z'),
 ('{issuer}','user_alias','{account}','2026-10-14T09:00Z');
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,
 capability,status,resource_modified_at,snapshot_hash)
 values('{account}','polar','sandbox','order','{case}','launch_bundle','active',now(),repeat('a',64));
insert into storage.objects(bucket_id,name,owner_id)
 values('testing-center-evidence','{case}.png','{account}');
""")
                delete_call = f"""select public.apply_clerk_user_event('{case}-delete',repeat('c',64),
 '{issuer}','{deleted_subject}','user.deleted','2026-10-14T11:00Z',null);"""
                update_call = f"""select public.apply_clerk_user_event('{case}-update',repeat('b',64),
 '{issuer}','{update_subject}','user.updated','2026-10-14T{update_hour}:00Z','resurrected@example.invalid');"""
                holder = updater = None
                quiet_conn = [*conn, "-q"]
                try:
                    holder = subprocess.Popen([str(bin_path / "psql"), *quiet_conn], env=env,
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    holder.stdin.write(f"""begin;
set local statement_timeout='20s';
select pg_advisory_xact_lock(hashtextextended('{account}',1608));
select 'LOCK_HELD:'||pg_backend_pid();
""".encode())
                    holder.stdin.flush()
                    ready = read_marker(holder, "LOCK_HELD:")
                    holder_pid = int(ready.split("LOCK_HELD:")[1].splitlines()[0])
                    updater = subprocess.Popen([str(bin_path / "psql"), *quiet_conn, "-c",
                        "begin; set local statement_timeout='20s'; "
                        f"set local application_name='{case}'; " + update_call + " commit;"],
                        env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    deadline = time.monotonic() + 15
                    while True:
                        blocked = run("psql", *quiet_conn, "-c", f"""
select count(*) from pg_stat_activity where application_name='{case}'
 and wait_event='advisory' and {holder_pid}=any(pg_blocking_pids(pid));
""").strip()
                        if blocked == "1":
                            break
                        if updater.poll() is not None or time.monotonic() > deadline:
                            raise RuntimeError(case + ": updater did not wait on the account lock")
                        time.sleep(.01)  # Poll actual lock state, never select the race by elapsed time.
                    log.append(case + ": barrier reached (live alias, blocked by deletion transaction)")
                    holder.stdin.write((delete_call + """
select 'ERASED:'||(email is null)::text from public.profiles
 where id='""" + account + "'; commit;\nselect 'DELETE_COMMITTED';\n").encode())
                    holder.stdin.flush()
                    deleted = read_marker(holder, "DELETE_COMMITTED")
                    check("applied" in deleted and "ERASED:true" in deleted, case + ": deletion erased PII before commit")
                    holder.stdin.write(b"\\q\n")
                    holder.stdin.flush()
                    _, error = holder.communicate(timeout=20)
                    if holder.returncode:
                        raise RuntimeError(error.decode())
                    updated, error = updater.communicate(timeout=20)
                    if updater.returncode:
                        raise RuntimeError(error.decode())
                    result = updated.decode().strip()
                    log.append(case + ": delayed update=" + result)
                    check(result == "ignored", case + ": concurrent alias update ignored")
                    state = run("psql", *quiet_conn, "-c", f"""
select email is null and display_name is null and avatar_url is null
 and primary_simulator is null and not onboarding_completed from public.profiles where id='{account}';
select count(*)=2 and bool_and(deleted_at='2026-10-14T11:00Z' and user_event_at='2026-10-14T11:00Z')
 from public.account_identities where account_id='{account}';
select count(*)=1 and bool_and(status='revoked' and snapshot_hash=repeat('a',64) and source_id='{case}')
 from public.billing_access_grants where user_id='{account}';
select count(*)=1 from private.clerk_deleted_objects where issuer='{issuer}' and name='{case}.png';
select count(*)=1 from storage.objects where name='{case}.png';
select count(*)=2 from private.clerk_user_events where event_id in('{case}-update','{case}-delete');
""").strip().splitlines()
                    for actual, name in zip(state, ("PII stays erased", "UUID/aliases/versions stay tombstoned",
                        "commercial history retained and revoked", "Storage queue retained", "Storage bytes untouched",
                        "both events recorded durably")):
                        check(actual == "t", case + ": " + name)
                    check(len(state) == 6, case + ": complete state checks")
                    retries = run("psql", *quiet_conn, "-c", delete_call + update_call + f"""
select email is null from public.profiles where id='{account}';
""").strip().splitlines()
                    check(retries == ["unchanged", "unchanged", "t"], case + ": deletion/update retries keep PII erased")
                finally:
                    for proc in (updater, holder):
                        if proc is not None and proc.poll() is None:
                            proc.kill()
                            proc.wait(timeout=10)
    finally:
        output_path.write_text("\n".join(log) + "\n")
    if failures:
        raise AssertionError("\n".join(failures))
    print("concurrent Clerk deletion/aliases: 4 scenarios / 40 checks PASS", flush=True)
