"""Claim/cancel serializes real requests; loopback fixture clone only."""
import json
import select
import subprocess
import time


def run_claim_cancel_races(run, conn, out, bin_dir, env):
    source=conn[conn.index('-d')+1]
    assert conn[conn.index('-h')+1]=='127.0.0.1' and source in ('postgres','commercial')
    admin=list(conn);admin[admin.index('-d')+1]='template1'
    fixture=list(conn);fixture[fixture.index('-d')+1]='vanta132_mail_cancel_race'
    run('psql',*admin,'-c',f'create database vanta132_mail_cancel_race template "{source}"')
    try:
        _races(run,fixture,out,bin_dir,env)
    finally:
        run('psql',*admin,'-c','drop database vanta132_mail_cancel_race')


def _races(run,conn,out,bin_dir,env):
    actor='19100660-0000-4000-8000-000000000001'
    run('psql',*conn,'-c',f"""insert into public.profiles(id)values('{actor}');
      select * from public.operational_access_set('{actor}','owner','grant','fixture','Cancel race','cancel-race',null);
      select public.mail_record_consent(null,'cancel-race@example.invalid','es',true,'fixture',true);""")
    def call(action,campaign,extra=''):
        return f"public.mail_admin_execute('{actor}','{action}','{{\"campaign_id\":\"{campaign}\",\"revision\":1{extra}}}'::jsonb,'sandbox')"
    results=[]
    for n,(first,second) in enumerate((('mail_claim','mail_cancel'),('mail_cancel','mail_claim')),10):
        campaign=f'19100660-0000-4000-8000-{n:012}'
        run('psql',*conn,'-c',f"""insert into private.mail_campaigns(id,environment,state,approved_by,target_group)
         values('{campaign}','sandbox','sending','{actor}','waitlist');
         insert into private.mail_deliveries(campaign_id,email,locale)values('{campaign}','cancel-race@example.invalid','es');""")
        blocker=subprocess.Popen([str(bin_dir/'psql'),*conn,'-q'],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        waiter=None
        try:
            blocker.stdin.write(f"begin;set role service_role;do $$begin perform {call(first,campaign)};end$$;select 'ready:'||pg_backend_pid();\n");blocker.stdin.flush()
            assert select.select([blocker.stdout],[],[],10)[0],'claim/cancel readiness timeout'
            ready=blocker.stdout.readline().strip();assert ready.startswith('ready:'),ready
            pid=int(ready.split(':')[1])
            waiter=subprocess.Popen([str(bin_dir/'psql'),*conn,'-q','-c',f"set statement_timeout='12s';set role service_role;select {call(second,campaign)};"],env={**env,'PGAPPNAME':'vanta132-mail-cancel-waiter'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            deadline=time.monotonic()+8
            while run('psql',*conn,'-c',f"select exists(select 1 from pg_stat_activity where application_name='vanta132-mail-cancel-waiter' and wait_event_type='Lock' and {pid}=any(pg_blocking_pids(pid)))").strip()!='t':
                assert time.monotonic()<deadline,'second request did not wait for first'
                time.sleep(.02)  # Throttle only: pg_stat_activity is the synchronization.
            _,error=blocker.communicate('commit;\n\\q\n',timeout=10);assert blocker.returncode==0,error
            stdout,error=waiter.communicate(timeout=12);assert waiter.returncode==0,error
            reply=json.loads(stdout.strip())
            if first=='mail_cancel': assert reply['delivery'] is None
            else:
                delivery=run('psql',*conn,'-c',f"select id from private.mail_deliveries where campaign_id='{campaign}'").strip()
                allowed=json.loads(run('psql',*conn,'-c',f"select public.mail_admin_execute('{actor}','mail_can_send','{{\"delivery_id\":\"{delivery}\"}}','sandbox')"))
                assert allowed['allowed'] is False
                run('psql',*conn,'-c',f"select public.mail_admin_execute('{actor}','mail_finish','{{\"delivery_id\":\"{delivery}\",\"status\":\"skipped\"}}','sandbox')")
            assert run('psql',*conn,'-c',f"select state='canceled' and not exists(select 1 from private.mail_deliveries where campaign_id='{campaign}' and status<>'skipped') from private.mail_campaigns where id='{campaign}'").strip()=='t'
            results.append(dict(first=first,second=second,waited_on_first=True,no_dispatching=True))
        finally:
            for process in (waiter,blocker):
                if process is not None and process.poll() is None:process.kill();process.communicate()
    (out/'mail-claim-cancel-races.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print('Mail claim/cancel: both real session orderings, blocked PID and no dispatching PASS',flush=True)
