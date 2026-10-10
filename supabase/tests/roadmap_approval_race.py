"""Two real local psql sessions: expiry cannot be frozen by BEGIN or lock waits."""
import json
import queue
import subprocess
import threading
import time


class Session:
    def __init__(self, psql, connection, env):
        self.process = subprocess.Popen([str(psql), *connection, '-Atq'], env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1)
        self.lines = queue.Queue()
        self.log = []
        def read():
            for line in self.process.stdout:
                self.log.append(line)
                self.lines.put(line.rstrip())
            self.lines.put(None)
        self.reader = threading.Thread(target=read, daemon=True)
        self.reader.start()

    def send(self, sql):
        self.process.stdin.write(sql + "\n")
        self.process.stdin.flush()

    def query(self, sql):
        self.send(sql + "; select 'END_QUERY';")
        output = []
        while True:
            line = self.lines.get(timeout=10)
            if line is None:
                raise RuntimeError('local session exited unexpectedly')
            if line == 'END_QUERY':
                return output
            output.append(line)

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.reader.join(timeout=5)


def check_approval_races(psql, admin_connection, login_connection, env, output):
    items = [dict(id=f'15350000-0000-0000-0000-{n:012d}', section='now',
        title=dict(es='LOCAL', en='', pt='', it=''),
        body=dict(es='', en='', pt='', it=''), area='Feature') for n in (31, 32, 33)]
    full = json.dumps(dict(schemaVersion=2, items=items))
    small = json.dumps(dict(schemaVersion=2, items=items[:1]))
    admin = Session(psql, admin_connection, env)
    ci = Session(psql, login_connection, env)
    try:
        admin.query(f"select public.visual_roadmap_publish('{full}'::jsonb)")
        for blocked in (False, True):
            admin.query('delete from public.visual_roadmap_sync_approvals')
            pid = ci.query('begin; select pg_backend_pid()')[0]
            # Approval is committed after CI BEGIN; READ COMMITTED must see it.
            admin.query(f"insert into public.visual_roadmap_sync_approvals values('{small}',clock_timestamp()+interval '2 seconds')")
            if blocked:
                admin.query('begin; lock table public.visual_roadmap in exclusive mode')
                ci.send(f"\\set VERBOSITY verbose\nselect public.visual_roadmap_sync('{small}'::jsonb);\n\\q")
                deadline = time.monotonic() + 5
                while admin.query(f"select exists(select 1 from pg_stat_activity where pid={pid} and wait_event_type='Lock')") != ['t']:
                    if time.monotonic() > deadline:
                        raise RuntimeError('publisher never waited for publication lock')
                    time.sleep(0.01)
            admin.query("select pg_sleep(greatest(0,extract(epoch from (expires_at-clock_timestamp())))+0.05) from public.visual_roadmap_sync_approvals")
            if admin.query('select bool_and(expires_at < clock_timestamp()) from public.visual_roadmap_sync_approvals') != ['t']:
                raise RuntimeError('test did not cross real approval expiry')
            if blocked:
                admin.query('commit')
            else:
                ci.send(f"\\set VERBOSITY verbose\nselect public.visual_roadmap_sync('{small}'::jsonb);\n\\q")
            ci.process.wait(timeout=10)  # ON_ERROR_STOP exits on expected denial.
            ci.reader.join(timeout=5)
            label = 'lock-wait' if blocked else 'old-begin'
            (output / f'approval-{label}.log').write_text(''.join(ci.log))
            if ci.process.returncode == 0 or not any('42501' in line and 'roadmap_mass_removal_requires_approval' in line for line in ci.log):
                raise RuntimeError('expired approval accepted after BEGIN/lock wait')
            if admin.query("select jsonb_array_length(document->'items') from public.visual_roadmap_current_v2()") != ['3']:
                raise RuntimeError('denied replacement changed publication')
            if admin.query('select count(*) from public.visual_roadmap_sync_approvals') != ['1']:
                raise RuntimeError('denied replacement consumed approval')
            (output / f'approval-{label}.log').write_text(''.join(ci.log) +
                'PASS: expired approval denied 42501; publication and approval preserved\n')
            ci.close()
            ci = Session(psql, login_connection, env)
    finally:
        ci.close()
        admin.close()
