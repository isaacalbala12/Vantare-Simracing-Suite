"""Two real local PostgreSQL sessions race for one durable email claim."""
import concurrent.futures
import threading


def run_owner_alert_race(run, conn, out):
    barrier = threading.Barrier(2)
    def claim(number):
        barrier.wait(timeout=10)
        return run('psql', *conn, '-c', f"""
          set role service_role;
          select public.billing_owner_alert_claim('sandbox','checkout_review',repeat('d',64),
            'race_fixture','17250000-0000-4000-8000-{number:012d}')->>'state';
        """).strip().splitlines()[-1]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = sorted(pool.map(claim, [1, 2]))
    assert results == ['busy', 'claimed'], results
    count = run('psql', *conn, '-c', "select count(*) from private.billing_owner_alert_inbox where alert_id=repeat('d',64)").strip()
    assert count == '1', count
    run('psql', *conn, '-c', "delete from private.billing_owner_alert_inbox where alert_id=repeat('d',64)")
    (out/'owner-alert-race.log').write_text('Two real sessions: one durable row, one claimed sender, one busy retry PASS\n', encoding='utf-8')
