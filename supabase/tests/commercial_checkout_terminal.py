"""Two real checkout claims after a full refund, on the disposable runner only."""
import subprocess
import time
import uuid

from commercial_tombstone_race import read_marker


def run_terminal_checkout_race(bin_path, conn, env, run, out):
    ids = [str(uuid.uuid4()) for _ in range(7)]
    account, old, checkout, order, product, first, second = ids
    quiet = [*conn, "-q"]
    holder = waiter = None
    log = []

    def sql(statement):
        return run("psql", *quiet, "-c", statement).strip()

    sql(f"""
insert into public.profiles(id) values('{account}');
select * from public.claim_billing_checkout_attempt('{account}','{old}','pro_monthly','sandbox','terminal-race');
select public.billing_begin_checkout_request('{account}','{old}','{product}');
select public.complete_billing_checkout_attempt('{account}','{old}','{checkout}','https://sandbox.polar.sh/checkout/race');
select * from public.billing_record_order_snapshot('sandbox','{order}','{account}','{product}','{checkout}','refunded',true,599,'eur',599,now(),repeat('a',64));
select public.billing_sync_order_access('sandbox','{order}','["vantare.plan.pro"]'::jsonb);
""")
    try:
        holder = subprocess.Popen([str(bin_path / "psql"), *quiet], env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        holder.stdin.write(f"""begin;
set local statement_timeout='20s';
select 'FIRST:'||outcome from public.claim_billing_checkout_attempt('{account}','{first}','pro_monthly','sandbox','terminal-race');
select 'CLAIM_LOCKED:'||pg_backend_pid();
""".encode())
        holder.stdin.flush()
        ready = read_marker(holder, "CLAIM_LOCKED:")
        assert "FIRST:claimed" in ready, ready
        pid = int(ready.split("CLAIM_LOCKED:")[1].splitlines()[0])
        app = "terminal-checkout-" + second
        waiter = subprocess.Popen([str(bin_path / "psql"), *quiet, "-c", f"""
begin; set local statement_timeout='20s'; set local application_name='{app}';
select outcome from public.claim_billing_checkout_attempt('{account}','{second}','pro_monthly','sandbox','terminal-race'); commit;
"""], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.monotonic() + 10
        blocked = False
        while waiter.poll() is None and time.monotonic() < deadline:
            blocked = sql(f"select count(*) from pg_stat_activity where application_name='{app}' and {pid}=any(pg_blocking_pids(pid))") == "1"
            if blocked:
                break
            time.sleep(.01)  # Observe the actual lock, not a scheduling delay.
        assert blocked, "second claim did not wait for the account lock"
        holder.stdin.write(b"commit; select 'FIRST_COMMITTED';\n")
        holder.stdin.flush()
        read_marker(holder, "FIRST_COMMITTED")
        holder.stdin.write(b"\\q\n")
        holder.stdin.flush()
        _, err = holder.communicate(timeout=20)
        assert holder.returncode == 0, err.decode()
        stdout, stderr = waiter.communicate(timeout=20)
        assert waiter.returncode == 0, stderr.decode()
        assert stdout.decode().strip() == "busy", stdout.decode()
        assert sql(f"select count(*) from public.billing_checkout_attempts where user_id='{account}' and environment='sandbox' and resolution is null") == "1"
        assert sql(f"select resolution from public.billing_checkout_attempts where user_id='{account}' and attempt_id='{old}'") == "refunded"
        assert sql(f"select count(*) from public.billing_checkout_bindings where user_id='{account}'") == "1"
        log.append("PASS real concurrent claims: one claimed, second waits then busy; one unresolved attempt; old refunded binding retained")
    finally:
        for process in (holder, waiter):
            if process and process.poll() is None:
                process.kill()
                process.communicate(timeout=10)
        (out / "checkout-terminal-race.log").write_text("\n".join(log) + "\n")
    print(log[0], flush=True)
