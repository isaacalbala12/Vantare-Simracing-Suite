"""Docker-only, disposable full-schema checkout checks. No DSN or real services.
Acquires ~/orq/docker.lock and always removes its container and releases the lock.
"""
import argparse
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import time
import uuid

from commercial_tombstone_race import read_marker

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--baseline", action="store_true", help="RED: omit the new migration, run the new regression only")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    args.output.mkdir(parents=True, exist_ok=True)
    env = {k:v for k,v in os.environ.items() if not k.startswith(("PG","PGRST"))}
    lock = Path.home() / "orq/docker.lock"
    while True:
        try:
            lock.mkdir()
            break
        except FileExistsError:
            print("Waiting for the authorized Docker slot", flush=True)
            time.sleep(30)
    container = "vantare-checkout-web-" + uuid.uuid4().hex[:10]
    running = False
    def docker(*parameters, input=None, check=True):
        result = subprocess.run(["docker", *parameters], input=input, env=env, capture_output=True, text=True)
        if check and result.returncode:
            raise RuntimeError(result.stderr)
        return result
    try:
        docker("run","--rm","-d","--name",container,"--network","none","--memory","2g","--cpus","2",
               "-e","POSTGRES_PASSWORD=checkout-web-local-fixture","public.ecr.aws/supabase/postgres:17.6.1.165")
        running = True
        deadline = time.monotonic() + 45
        while (docker("exec",container,"cat","/proc/1/comm",check=False).stdout.strip() not in ("postgres",".postgres-wrapp")
               or docker("exec",container,"pg_isready","-U","postgres",check=False).returncode):
            if time.monotonic() > deadline:
                raise TimeoutError("local PostgreSQL container readiness")
            time.sleep(.1)  # service readiness, never the race oracle
        # Canonical plain-PG fixtures use postgres as the bootstrap superuser.
        # Supabase's image restricts that role; change it ONLY in this disposable,
        # network-none test container. Runtime anon/authenticated/service_role ACLs stay real.
        docker("exec",container,"psql","-X","-U","supabase_admin","-d","postgres",
               "-v","ON_ERROR_STOP=1","-c","ALTER ROLE postgres SUPERUSER")
        def sql(statement):
            return docker("exec","-i",container,"psql","-X","-U","postgres","-d","postgres",
                          "-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-At","-q",input=statement).stdout.strip()
        text = (root/"supabase/tests/run-supabase-hardening-postgres.ps1").read_text()
        bootstrap = text.split("Write-Utf8NoBom $bootstrap @'",1)[1].split("'@",1)[0]
        bootstrap += "\nalter default privileges in schema public grant all on tables to service_role;\n"
        bootstrap += """create or replace function auth.uid() returns uuid language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid $$;"""
        # Profile RLS migrations reference the Storage path helper even though
        # this billing runner uses synthetic Storage tables and no Storage service.
        bootstrap += """create or replace function storage.foldername(name text)
        returns text[] language sql immutable as $$
        select parts[1:array_length(parts,1)-1] from (select string_to_array(name,'/') parts) p $$;"""
        sql(bootstrap)
        migrations = []
        for migration in sorted((root/"supabase/migrations").glob("*.sql")):
            if args.baseline and "checkout_web_shared_guard" in migration.name:
                continue
            try:
                sql(migration.read_text())
            except Exception as error:
                raise RuntimeError(migration.name + ": " + str(error)) from error
            migrations.append(migration.name)
            if len(migrations)%50==0: print(str(len(migrations))+" migrations loaded",flush=True)
        (args.output/"migrations.txt").write_text("\n".join(migrations)+"\n")
        suites = ["checkout_web_shared_guard_regression.test.sql"] if args.baseline else [
            "checkout_web_shared_guard_regression.test.sql",
            "billing_checkout_attempts_test.sql","checkout_web_shared_guard.test.sql",
            "native_checkout_internal_account.test.sql","native_checkout_annual.test.sql",
            "clerk_identity_cutover_test.sql","commercial_tombstone.test.sql",
            "billing_order_refund_ledger.test.sql","commercial_admin_deleted.test.sql"]
        total = 0
        for name in suites:
            result = sql((root/"supabase/tests"/name).read_text())
            (args.output/(name+".log")).write_text(result+"\n")
            if re.search(r"(^|\n)not ok |# Looks like", result):
                raise AssertionError(name+" failed; see output log")
            count = len(re.findall(r"(^|\n)ok \d+",result))
            total += count
            print(name+": "+str(count)+" PASS",flush=True)
        with tempfile.TemporaryDirectory(prefix="vantare-checkout-client-") as temp:
            binary = Path(temp)/"psql"
            binary.write_text("#!/bin/sh\nexec docker exec -i "+shlex.quote(container)+" psql \"$@\"\n")
            binary.chmod(0o700)
            connection = ["-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-At","-q"]
            checks = []
            def seed():
                account,subject,issuer = str(uuid.uuid4()),"user_"+uuid.uuid4().hex,"https://"+uuid.uuid4().hex+".clerk.invalid"
                sql(f"""insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('{issuer}',array['https://app.invalid'],true);
                    insert into public.profiles(id) values('{account}');
                    insert into public.account_identities(issuer,subject,account_id) values('{issuer}','{subject}','{account}');""")
                return account,subject,issuer
            def claim(account,attempt,plan="pro_monthly",catalog="fixture"):
                return f"select outcome from claim_billing_checkout_attempt('{account}','{attempt}','{plan}','sandbox','{catalog}');"
            def race(first,second,expected,label):
                holder = subprocess.Popen([str(binary),*connection],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                contender = None
                try:
                    holder.stdin.write(("begin; set local statement_timeout='20s';"+first+"select 'HELD:'||pg_backend_pid();\n").encode())
                    holder.stdin.flush()
                    pid = int(read_marker(holder,"HELD:").split("HELD:")[1].splitlines()[0])
                    contender = subprocess.Popen([str(binary),*connection,"-c","set application_name='checkout-contender';"+second],
                        env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                    deadline = time.monotonic()+10
                    while True:
                        wait = sql(f"select wait_event from pg_stat_activity where application_name='checkout-contender' and {pid}=any(pg_blocking_pids(pid));")
                        if wait:
                            assert wait=="advisory",label+": UUID must precede rows"
                            break
                        if contender.poll() is not None or time.monotonic()>deadline:
                            raise AssertionError(label+": contender did not wait for the real UUID lock")
                        time.sleep(.01)  # Observe actual blocker, not elapsed-time correctness.
                    holder.stdin.write(b"commit;\n")
                    holder.stdin.close()
                    holder.wait(timeout=20)
                    assert holder.returncode==0,holder.stderr.read().decode()
                    output,error = contender.communicate(timeout=20)
                    if expected=="28000":
                        assert contender.returncode!=0 and "28000" in error.decode(),error.decode()
                    else:
                        assert contender.returncode==0,error.decode()
                        assert output.decode().strip().splitlines()[-1]==expected,output.decode()
                    checks.append(label+" PASS")
                finally:
                    for process in (holder,contender):
                        if process is not None and process.poll() is None:
                            process.kill();process.wait(timeout=10)
            for direction in ["app-first","web-first"]:
                account,_,_ = seed()
                first,second = str(uuid.uuid4()),str(uuid.uuid4())
                race(claim(account,first),claim(account,second,"pro_plus_annual"),"busy",direction+" blocks duplicate family")
                assert sql(f"select count(*) from billing_checkout_attempts where user_id='{account}';")=="1"
            for operation in ["claim","complete","uncertain"]:
                for direction in ["write-first","delete-first"]:
                    account,subject,issuer = seed()
                    attempt = str(uuid.uuid4())
                    if operation!="claim":
                        assert sql(claim(account,attempt))=="claimed"
                    write = {
                        "claim":claim(account,attempt),
                        "complete":f"select complete_billing_checkout_attempt('{account}','{attempt}','race-checkout-{attempt}','https://sandbox.polar.sh/checkout/race');",
                        "uncertain":f"select mark_billing_checkout_attempt_uncertain('{account}','{attempt}');",
                    }[operation]
                    deletion = f"select apply_clerk_user_event('delete-{attempt}',repeat('d',64),'{issuer}','{subject}','user.deleted',now(),null);"
                    if direction=="delete-first":
                        race(deletion,write,"28000",operation+" / "+direction)
                    else:
                        # apply_clerk_user_event returns applied for the deletion.
                        race(write,deletion,"applied",operation+" / "+direction)
                    assert sql(f"select bool_and(deleted_at is not null) from account_identities where account_id='{account}';")=="t"
            (args.output/"checkout-races.txt").write_text("\n".join(checks)+"\n")
            print(str(len(checks))+" real app/web + #1622 transaction-order races PASS",flush=True)
        print(f"PASS: {len(migrations)} migrations, {total} pgTAP assertions, no remote services",flush=True)
    finally:
        if running:
            docker("rm","-f",container,check=False)
        lock.rmdir()

if __name__=="__main__":
    main()
