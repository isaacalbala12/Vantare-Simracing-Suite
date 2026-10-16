"""Pause the deployed operational RPC's exact prefix, not a replacement function."""
import subprocess, time, uuid
from commercial_tombstone_race import read_marker


def run_lock_order(bin_path,conn,env,run,out):
    log,failures=[],[]
    def check(ok,label):
        log.append(('PASS ' if ok else 'FAIL ')+label)
        if not ok: failures.append(label)
    try:
        for order in ('writer-first','delete-first','dml-row-first'):
            account=str(uuid.uuid4());issuer='https://'+order+'.clerk.invalid';subject='user_lock_order'
            run('psql',*conn,'-c',f"insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('{issuer}',array['https://app.invalid'],true); insert into public.profiles(id,email) values('{account}','before@example.invalid'); insert into public.account_identities(issuer,subject,account_id) values('{issuer}','{subject}','{account}');")
            deletion=f"select public.apply_clerk_user_event('{order}-delete',repeat('a',64),'{issuer}','{subject}','user.deleted',now(),null);"
            grant=f"select * from public.operational_access_set('{account}','tester','grant','fixture:admin','fixture grant','{order}');"
            holder=other=None
            try:
                holder=subprocess.Popen([str(bin_path/'psql'),*conn,'-q'],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                if order!='delete-first':
                    source=run('psql',*conn,'-c',"select prosrc from pg_proc where oid='public.operational_access_set(uuid,text,text,text,text,text,timestamptz)'::regprocedure")
                    # Execute the exact entry through the first profiles FOR UPDATE,
                    # with the same arguments. Pause, then continue via the real RPC.
                    prefix=source[:source.index('  if not found then')]
                    params=f"p_user_id uuid:='{account}'; p_role text:='tester'; p_action text:='grant'; p_actor_ref text:='fixture:admin'; p_reason text:='fixture grant'; p_correlation_id text:='{order}'; p_expires_at timestamptz:=null;"
                    prefix=prefix.replace('declare','declare\n'+params,1)
                    first='do $prefix$'+prefix+' end $prefix$;'
                    if order=='dml-row-first':
                        first=f"select 1 from public.profiles where id='{account}' for update;"
                        grant=f"update public.profiles set email='late@example.invalid' where id='{account}';"
                    second=deletion
                else: first=deletion;second=grant
                holder.stdin.write(("begin; set local statement_timeout='15s'; set local deadlock_timeout='5s'; "+first+"select 'PREFIX_HELD:'||pg_backend_pid();\n").encode());holder.stdin.flush()
                pid=int(read_marker(holder,'PREFIX_HELD:').split('PREFIX_HELD:')[1].splitlines()[0])
                other=subprocess.Popen([str(bin_path/'psql'),*conn,'-q','-c',f"begin; set local statement_timeout='15s'; set local deadlock_timeout='100ms'; set local application_name='{order}'; "+second+' commit;'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                deadline=time.monotonic()+10;wait=None
                while time.monotonic()<deadline:
                    wait=run('psql',*conn,'-c',f"select wait_event from pg_stat_activity where application_name='{order}' and {pid}=any(pg_blocking_pids(pid))").strip()
                    if wait: break
                    if other.poll() is not None:break
                    time.sleep(.01) # Read actual blocker, not a timing-based schedule.
                check(bool(wait),order+' other transaction waits on deployed prefix')
                log.append(order+' observed wait='+str(wait))
                holder.stdin.write(((grant if order!='delete-first' else '')+" commit;\n").encode());holder.stdin.close();holder.wait(timeout=20)
                stdout,stderr=other.communicate(timeout=20);stderr=stderr.decode();log.append(stdout.decode()+stderr)
                holder_error=holder.stderr.read().decode();log.append(holder_error)
                check((holder.returncode!=0 and '40001' in holder_error) if order=='dml-row-first' else holder.returncode==0,order+' first transaction committed or misordered DML rejected with 40001')
                if order!='delete-first':
                    check(other.returncode==0,order+' deletion succeeds without 40P01')
                    if order=='writer-first':check(wait=='advisory',order+' UUID held before profile row')
                else:check(other.returncode!=0 and '28000' in stderr,order+' live grant cannot follow tombstone')
                state=run('psql',*conn,'-c',f"select email is null from public.profiles where id='{account}'; select bool_and(deleted_at is not null) from public.account_identities where account_id='{account}'; select count(*) from public.operational_access_assignments where user_id='{account}' and status='active'").strip().splitlines()
                check(state==['t','t','0'],order+' erased identity and no live assignment')
            finally:
                for proc in (holder,other):
                    if proc is not None and proc.poll() is None:proc.kill();proc.wait(timeout=10)
        # Two transactions acquire different UUIDs, then attempt the opposite
        # account. A row trigger must never wait and form a multi-UUID cycle.
        a=str(uuid.uuid4());b=str(uuid.uuid4())
        run('psql',*conn,'-c',f"insert into public.profiles(id) values('{a}'),('{b}');")
        def insert(account,source):
            return f"insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash) values('{account}','polar','sandbox','order','{source}','launch_bundle','active',now(),repeat('b',64));"
        left=right=None
        try:
            def opened(account,source):
                proc=subprocess.Popen([str(bin_path/'psql'),*conn,'-q'],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                proc.stdin.write((f"begin; set local application_name='{source}'; set local statement_timeout='15s'; "+insert(account,source)+"select 'FIRST_WRITTEN';\n").encode());proc.stdin.flush();read_marker(proc,'FIRST_WRITTEN');return proc
            left=opened(a,'left-first');right=opened(b,'right-first')
            left.stdin.write((insert(b,'left-second')+' commit;\n').encode());left.stdin.close()
            deadline=time.monotonic()+10
            while left.poll() is None and time.monotonic()<deadline:
                waiting=run('psql',*conn,'-c',"select exists(select 1 from pg_stat_activity where application_name='left-first' and wait_event='advisory')").strip()=='t'
                if waiting:break
                time.sleep(.01) # Actual advisory wait in RED; immediate 40001 in GREEN.
            right.stdin.write((insert(a,'right-second')+' commit;\n').encode());right.stdin.close()
            left.wait(timeout=15);right.wait(timeout=15)
            error=left.stderr.read().decode();log.append(error)
            check(left.returncode!=0 and '40001' in error and '40P01' not in error,'multi UUID reverse order rejects whole transaction without deadlock')
            check(right.returncode==0,'multi UUID other transaction commits after rollback')
            check(run('psql',*conn,'-c',"select count(*) from public.billing_access_grants where source_id like 'left-%'").strip()=='0','multi UUID no half-committed effects')
            run('psql',*conn,'-c','begin; '+insert(a,'left-first')+insert(b,'left-second')+' commit;')
            check(run('psql',*conn,'-c',"select count(*) from public.billing_access_grants where source_id in ('left-first','left-second','right-first','right-second')").strip()=='4','multi UUID full transaction retry commits both effects')
        finally:
            for proc in (left,right):
                if proc is not None and proc.poll() is None:proc.kill();proc.wait(timeout=10)
    finally:(out/'lock-order.log').write_text('\n'.join(log)+'\n')
    if failures:raise AssertionError('\n'.join(failures))
    print('UUID -> row lock order: both real transaction orders PASS',flush=True)
