"""Real user-write transactions against the runner's disposable loopback cluster."""
import hashlib
import json
import re
import subprocess
import time
import uuid

from commercial_tombstone_race import read_marker
from commercial_write_cases import CASES, SETUP, INDIRECT_SETUP


def run_write_races(bin_path, conn, env, run, out):
    logs, failures = [], []
    coverage = {}
    quiet = [*conn, '-q']

    def sqlstate(stderr):
        match = re.search(r'ERROR:\s+([0-9A-Z]{5}):', stderr)
        return match.group(1) if match else None

    def sql(statement):
        return run('psql', *quiet, '-c', statement).strip()

    def check(ok, name):
        logs.append(('PASS ' if ok else 'FAIL ') + name)
        if not ok:
            failures.append(name)

    inventory = sql("""
select jsonb_pretty(jsonb_agg(x)) from (
 select n.nspname||'.'||c.relname as relation,
   exists(select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname='a_account_write_barrier'
     and t.tgenabled='O') as protected
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private','storage') and c.relkind='r'
 order by 1) x;
""")
    (out / 'inventory.json').write_text(inventory + '\n')
    # Observe actual successful live writes, without replacing guards or RPCs.
    # Each control transaction owns its temporary trace; it rolls back the write.
    sql("""
create function public.fixture_trace_write() returns trigger language plpgsql security definer
set search_path='' as $$ begin
 if to_regclass('pg_temp.write_trace') is not null then
  insert into pg_temp.write_trace values(tg_table_schema||'.'||tg_table_name);
 end if; return null; end $$;
revoke all on function public.fixture_trace_write() from public,anon,authenticated,service_role;
do $$ declare r record; begin
 for r in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private','storage') and c.relkind='r'
 loop execute format('create trigger zz_fixture_trace after insert or update on %s for each row execute function public.fixture_trace_write()',r.oid::regclass); end loop;
end $$;
""")
    try:
        for name, template in CASES:
            values = {k: str(uuid.uuid4()) for k in ('a', 'license', 'attempt', 'questionnaire',
                'contribution', 'batch', 'evidence', 'new_id', 'other', 'inbox')}
            values |= {'case': name, 'issuer': 'https://' + name + '.clerk.invalid',
                'subject': 'user_aaaaaaaaaaaaaaaaaaaaaaaaaaa'}
            values |= {'h': hashlib.sha256(name.encode()).hexdigest(),
                'h2': hashlib.sha256((name+'-2').encode()).hexdigest()}
            values['sha'] = values['h'][:40]
            sql(SETUP.format(**values))
            sql(INDIRECT_SETUP.format(**values))
            sql("insert into public.profiles(id) values('{other}'); insert into public.billing_webhook_inbox(id,provider,environment,provider_event_id,event_type,payload_hash,payload) values('{inbox}','polar','sandbox','seed-{case}','order.paid','{h}','{{\"data\":{{\"customer_id\":\"{case}\"}}}}')".format(**values))
            values['job'] = sql("select job_key from public.testing_center_agent_jobs where technical_issue_id='issue_{h}'".format(**values))
            if name == 'codex-control':
                sql("insert into public.testing_center_codex_runs(run_id,technical_issue_id,attempt,state,origin) values('{case}','issue_{h}',1,'queued','orchestrator')".format(**values))
            if name in ('dossier', 'owner-disposition'):
                sql("insert into public.testing_center_validation_snapshots(validation_id,technical_issue_id,candidate_id,channel,app_version,candidate_sha,actor_id,actor_user_id,actor_role,decision,replay_key,decision_digest,projection_digest,transport_digest,sanitized_projection,redacted_values,truncated_fields) values('validation-{case}','issue_{h}','candidate-{case}','testers','1.0.0','{sha}','{a}','{a}','tester','accepted','{case}','{h}','{h}','{h}','{{}}',0,0)".format(**values))
            if name in ('checkout-complete', 'checkout-uncertain'):
                sql("select * from public.claim_billing_checkout_attempt('{a}','{attempt}',"
                    "'pro_monthly','sandbox','fixture')".format(**values))
            if name == 'inbox-checkout':
                sql("select * from public.claim_billing_checkout_attempt('{a}','{attempt}','pro_monthly','sandbox','fixture'); select public.complete_billing_checkout_attempt('{a}','{attempt}','checkout-{case}','https://checkout.invalid/fixture')".format(**values))
            if name == 'inbox-subscription':
                sql("insert into public.billing_subscriptions(user_id,provider,provider_subscription_id,status,environment) values('{a}','polar','subscription-{case}','active','sandbox')".format(**values))
            if name == 'inbox-nested-customer':
                sql("insert into private.clerk_deleted_objects(issuer,subject,bucket_id,name) values('{issuer}','{subject}','testing-center-evidence','cleanup-slot')".format(**values))
            # The actual write must be valid while live, before testing its race.
            claims = {'iss': values['issuer'], 'sub': values['subject'], 'role': 'authenticated',
                'sid': 'sess_fixture', 'azp': 'https://app.invalid'}
            if name == 'reset-native':
                now = int(time.time())
                claims = {'iss': 'http://127.0.0.1:54321/native-data/v1', 'sub': values['a'],
                    'role': 'authenticated', 'aud': 'vantare-native-data', 'iat': now, 'exp': now + 300,
                    'vantare_identity_provider': 'clerk', 'clerk_issuer': values['issuer'],
                    'clerk_subject': values['subject']}
            command = "select set_config('request.jwt.claims','" + json.dumps(claims) + "',true); "
            command += template.format(**values) + ';'
            try:
                live = sql('begin; create temp table write_trace(relation text); ' + command +
                    " reset role; set constraints all immediate; select 'TRACE:'||coalesce(jsonb_agg(distinct relation),'[]')::text from write_trace; rollback;")
                coverage[name] = json.loads(live.split('TRACE:')[-1])
            except RuntimeError as error:
                logs.append('FIXTURE ERROR ' + name + ': ' + str(error))
                raise
            check(True, name + ': valid live write (rolled back)')
            deletion = ("select public.apply_clerk_user_event('{case}-delete',repeat('d',64),"
                "'{issuer}','{subject}','user.deleted',now(),null);").format(**values)
            holder = writer = None
            try:
                holder = subprocess.Popen([str(bin_path / 'psql'), *quiet], env=env,
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                holder.stdin.write(('begin; set local statement_timeout=\'20s\'; ' + deletion +
                    "select 'DELETION_PENDING:'||pg_backend_pid();\n").encode())
                holder.stdin.flush()
                ready = read_marker(holder, 'DELETION_PENDING:')
                pid = int(ready.split('DELETION_PENDING:')[1].splitlines()[0])
                writer = subprocess.Popen([str(bin_path / 'psql'), *quiet, '-c',
                    "begin; set local statement_timeout='20s'; set local application_name='r4-" + name +
                    "'; " + command + ' commit;'], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                deadline = time.monotonic() + 10
                barrier = False
                while writer.poll() is None and time.monotonic() < deadline:
                    if sql("select count(*) from pg_stat_activity where application_name='r4-" + name +
                        "' and " + str(pid) + "=any(pg_blocking_pids(pid))") == '1':
                        barrier = True
                        break
                    time.sleep(.01)  # Poll the observed lock, never schedule correctness by sleep.
                check(barrier, name + ': concurrent write waits on deletion transaction')
                holder.stdin.write(b"commit; select 'DELETE_COMMITTED';\n")
                holder.stdin.flush()
                read_marker(holder, 'DELETE_COMMITTED')
                holder.stdin.write(b'\\q\n')
                holder.stdin.flush()
                _, err = holder.communicate(timeout=20)
                if holder.returncode:
                    raise RuntimeError(err.decode())
                stdout, stderr = writer.communicate(timeout=20)
                logs.append(name + ': exit=' + str(writer.returncode) + ' output=' + stdout.decode().strip()
                    + ' error=' + stderr.decode().strip())
                # Revoked financial projections and cascaded-away rows may succeed.
                # Every other route must reject with the typed tombstone error.
                safe_success = name in ('grant', 'entitlement', 'operational', 'followup')
                check((writer.returncode == 0 and safe_success) or
                    (writer.returncode != 0 and sqlstate(stderr.decode()) == '28000'),
                    name + ': tombstone rejection or safe revoked/no-row result')
                state = sql("""
select email is null and display_name is null from public.profiles where id='{a}';
select count(*)=0 from public.devices where user_id='{a}';
select count(*)=0 from public.account_identities where account_id='{a}' and deleted_at is null;
select count(*)=0 from public.billing_customers where user_id='{a}' and (email is not null or metadata<>'{{}}');
select count(*)=0 from public.billing_access_grants where user_id='{a}' and (status<>'revoked' or metadata<>'{{}}');
select count(*)=0 from public.user_entitlements where user_id='{a}' and (status<>'revoked' or metadata<>'{{}}');
select count(*)=0 from public.operational_access_assignments where user_id='{a}' and status<>'revoked';
select count(*)=0 from public.testing_contributions where account_id='{a}';
select count(*)=0 from public.testing_answers where account_id='{a}';
select count(*)=0 from storage.objects where owner_id='{a}' or name='v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/{batch}/{evidence}';
select count(*)=0 from public.testing_center_report_payloads where report_id='report-{case}' and action_text<>'Deleted';
""".format(**values)).splitlines()
                check(state == ['t'] * 11, name + ': no restored PII/device/access/content/object')
                retry = sql(deletion)
                check(retry == 'unchanged', name + ': duplicate deletion remains idempotent')
            finally:
                for proc in (writer, holder):
                    if proc is not None and proc.poll() is None:
                        proc.kill()
                        proc.wait(timeout=10)
        # Independent catalog closure: a new FK-bound table cannot silently
        # escape the migration or the valid-write/concurrency inventory.
        missing = sql("""
with recursive expected(rel) as (
 select unnest(array['public.profiles'::regclass,'public.operational_access_audit',
 'public.operational_legacy_grant_retirements','storage.objects','private.testing_report_attempts',
 'public.billing_webhook_inbox','public.testing_center_idempotency','public.testing_center_audit',
 'public.admin_audit_log']::regclass[])::oid
 union select c.conrelid from expected e join pg_constraint c on c.confrelid=e.rel
 join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
 where c.contype='f' and n.nspname in ('public','private','storage'))
select coalesce(string_agg(rel::regclass::text,','),'') from expected where not exists(
 select 1 from pg_trigger t where t.tgrelid=rel and t.tgname='a_account_write_barrier'
 and t.tgenabled='O' and (t.tgtype & 31)=31);
""")
        check(not missing, 'catalog: every UUID root and FK descendant has INSERT/UPDATE/DELETE barrier: ' + missing)
        links_missing = sql("""
select coalesce(string_agg(c.conname,','),'') from pg_constraint c
join pg_trigger parent on parent.tgrelid=c.confrelid and parent.tgname='a_account_write_barrier'
left join pg_trigger child on child.tgrelid=c.conrelid and child.tgname='a_account_write_barrier'
where c.contype='f' and (child.oid is null or exists(
 select 1 from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k
 where position(format('$1->>%L',a.attname) in encode(child.tgargs,'escape'))=0));
""")
        check(not links_missing, 'catalog: compiled guard includes every current user FK column: ' + links_missing)
        check(sql("select case when to_regprocedure('private.lock_account_write(uuid)') is null then false else not has_function_privilege('service_role','private.lock_account_write(uuid)','execute') and not has_function_privilege('authenticated','private.guard_account_write()','execute') end") == 't',
            'guard ACL: no caller bypass or direct execution')
        # Expected SQLSTATEs, not text-message matching or swallowed failures.
        for label, statement, code in (
            ('repeatable-read', "begin isolation level repeatable read; insert into public.devices(user_id) values('{other}');", '25001'),
            ('serializable', "begin isolation level serializable; insert into public.devices(user_id) values('{other}');", '25001'),
            ('durable-profile', "delete from public.profiles where id='{a}';", '28000'),
            ('durable-alias', "delete from public.account_identities where account_id='{a}';", '28000'),
            ('alias-reassignment', "update public.account_identities set account_id='{other}' where account_id='{a}';", '28000'),
            ('alias-key-change', "update public.account_identities set subject='user_renamed' where account_id='{a}';", '28000'),
            ('profile-reinsert', "insert into public.profiles(id,email) values('{a}','restored@example.invalid');", '28000'),
        ):
            result = subprocess.run([str(bin_path/'psql'), *quiet, '-c', statement.format(**values)],
                env=env,capture_output=True,text=True,timeout=20)
            check(result.returncode != 0 and sqlstate(result.stderr) == code, label + ': SQLSTATE ' + code)
            logs.append(label + ': ' + result.stderr.strip())
        check(sql("select count(*)=0 from public.devices where user_id='{a}'".format(**values)) == 't',
            'boundary probes preserve erased device')
        # A parent inserted by a different, uncommitted transaction is not
        # visible to an owner lookup. Reject, then prove a valid retry commits.
        hidden_order = """insert into public.billing_orders(user_id,environment,provider_order_id,
provider_product_id,status,paid,net_amount,currency,remote_modified_at,snapshot_hash)
values('{other}','sandbox','hidden-parent','fixture','paid',true,100,'eur',now(),'{h}')""".format(**values)
        child = """insert into public.billing_refunds(environment,provider_refund_id,provider_order_id,
status,amount,currency,remote_modified_at,snapshot_hash)
values('sandbox','hidden-child','hidden-parent','pending',10,'eur',now(),'{h}')
on conflict(provider,environment,provider_refund_id) do nothing""".format(**values)
        holder = subprocess.Popen([str(bin_path/'psql'), *quiet], env=env,
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        child_proc = None
        try:
            holder.stdin.write(('begin; ' + hidden_order + "; select 'PARENT_PENDING:'||pg_backend_pid();\n").encode())
            holder.stdin.flush()
            parent_ready = read_marker(holder, 'PARENT_PENDING:')
            parent_pid = int(parent_ready.split('PARENT_PENDING:')[1].splitlines()[0])
            child_proc = subprocess.Popen([str(bin_path/'psql'), *quiet, '-c',
                "set application_name='hidden-child'; " + child], env=env,
                stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            deadline = time.monotonic()+10
            while child_proc.poll() is None:
                if sql("select count(*) from pg_stat_activity where application_name='hidden-child' and "+str(parent_pid)+"=any(pg_blocking_pids(pid))") == '1':
                    break
                if time.monotonic()>deadline:
                    raise TimeoutError('hidden child neither rejected nor blocked')
                time.sleep(.01)  # Observe FK visibility, not a timed race.
            rejected_before_commit = child_proc.poll() is not None
            check(rejected_before_commit, 'uncommitted parent: rejection before committing invisible parent')
            holder.stdin.write(b"commit; select 'PARENT_COMMITTED';\n")
            holder.stdin.flush()
            read_marker(holder, 'PARENT_COMMITTED')
            _, child_error = child_proc.communicate(timeout=20)
            check(child_proc.returncode != 0 and sqlstate(child_error.decode()) == '23503',
                'uncommitted parent: typed owner rejection (23503)')
            sql(child)
            check(sql("select count(*)=1 from public.billing_refunds where provider_refund_id='hidden-child'") == 't',
                'uncommitted parent: valid retry commits after parent visibility')
            holder.stdin.write(b'\\q\n')
            holder.stdin.flush()
            _, err = holder.communicate(timeout=20)
            if holder.returncode:
                raise RuntimeError(err.decode())
        finally:
            for proc in (child_proc, holder):
                if proc is not None and proc.poll() is None:
                    proc.kill()
                    proc.wait(timeout=10)
        drained = sql("""begin; set local role service_role;
select public.clerk_deletion_completed('{issuer}','{subject}','testing-center-evidence',array['cleanup-slot']);
reset role; select count(*)=0 from private.clerk_deleted_objects
where issuer='{issuer}' and subject='{subject}' and name='cleanup-slot'; commit;
""".format(**values))
        check(drained == 't', 'Storage ACK: service_role drains queue after tombstone through DELETE guard')
        covered = {table for tables in coverage.values() for table in tables}
        for table in json.loads(inventory):
            if table['protected']:
                check(table['relation'] in covered, table['relation'] + ': valid live write covered by a real race')
    finally:
        (out / 'coverage.json').write_text(json.dumps(coverage, indent=2) + '\n')
        (out / 'write-races.log').write_text('\n'.join(logs) + '\n')
    if failures:
        raise AssertionError('\n'.join(failures))
    sql("""do $$ declare r record; begin
 for r in select tgrelid from pg_trigger where tgname='zz_fixture_trace'
 loop execute format('drop trigger zz_fixture_trace on %s',r.tgrelid::regclass); end loop;
end $$; drop function public.fixture_trace_write();
""")
    print(f'user-write tombstone races: {len(CASES)} routes / {sum(line.startswith('PASS ') for line in logs)} checks PASS', flush=True)
