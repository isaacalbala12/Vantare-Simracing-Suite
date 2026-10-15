"""#1602 F8: exact native preview against combined SQL, disposable Unix socket only.

Run in WSL/Linux with existing PostgreSQL binaries and --preview from the native
review_r7_f8 test (VANTARE_TRIAGE_TEST_PREVIEW). No DSN or synthetic grants.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import re


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--preview', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--edge-rpc', type=Path, help='RPC envelope captured by the Edge regression from the same native preview')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    root = Path(__file__).resolve().parents[2]
    payload = json.loads(args.preview.read_text(encoding='utf-8'))
    assert set(payload) == {'p_id', 'p_channel', 'p_title', 'p_body', 'p_context', 'p_attachments'}
    assert payload['p_title'] == payload['p_body'] == '[contenido retirado por privacidad]'
    assert payload['p_attachments'] and payload['p_context']['telemetry_summary']
    account = '15940000-0000-4000-8000-000000000001'
    other = '15940000-0000-4000-8000-000000000002'
    if args.edge_rpc:
        envelope = json.loads(args.edge_rpc.read_text(encoding='utf-8'))
        assert envelope == {'name': 'testing_contribution_submit_admitted',
                            'body': {**payload, 'p_account': account}}
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    checks = []

    def run(binary, *parameters, log, expected=0):
        result = subprocess.run([str(args.pg_bin / binary), *map(str, parameters)], env=env,
                                capture_output=True, text=True, encoding='utf-8', timeout=60)
        output = result.stdout + result.stderr
        (args.output / log).write_text(output, encoding='utf-8')
        if result.returncode != expected:
            raise RuntimeError(f'{log}: exit {result.returncode}, expected {expected}')
        return output

    with tempfile.TemporaryDirectory(prefix='vantare-1602-f8-') as temporary:
        data = Path(temporary) / 'data'
        run('initdb', '-D', data, '-U', 'local_supervisor', '--auth-local=trust',
            '--auth-host=reject', '--encoding=UTF8', '--no-locale', log='init.log')
        run('pg_ctl', '-D', data, '-l', args.output / 'server.log', '-o', f'-h "" -k {temporary}',
            '-w', 'start', log='start.log')
        connection = ['-X', '-h', temporary, '-d', 'postgres', '-U', 'local_supervisor',
                      '-v', 'ON_ERROR_STOP=1', '-At']
        try:
            run('psql', *connection, '-f', root / 'supabase/tests/triage_local_bootstrap.sql', log='bootstrap.log')
            actor = connection.copy()
            actor[actor.index('-U') + 1] = 'postgres'
            names = ['20261010000000_testing_participation.sql',
                     '20261013160000_testing_contribution_triage.sql',
                     '20261013225629_testing_reports_followup.sql',
                     '20261014022701_testing_report_ip_admission.sql']
            names += [p.name for p in (root / 'supabase/migrations').glob('*_testing_triage_admitted.sql')]
            for name in sorted(names):
                run('psql', *actor, '-f', root / 'supabase/migrations' / name, log=name + '.log')
            run('psql', *connection, '-c', 'create extension pgtap;', log='pgtap.log')
            regression_counts = {}
            for regression in ['F1', 'F1IP', 'F2', 'F3']:
                output = run('psql', *connection, '-f', root / f'supabase/tests/testing_followup_{regression}.test.sql',
                             log=f'followup-{regression}.log')
                plan = re.search(r'^1\.\.(\d+)$', output, re.MULTILINE)
                passed = len(re.findall(r'^ok \d+\b', output, re.MULTILINE))
                assert plan and passed == int(plan.group(1)) and not re.search(r'^not ok |^# Looks like', output, re.MULTILINE)
                regression_counts[regression] = passed
            run('psql', *connection, '-c', f"""
              insert into public.profiles(id) values('{account}'),('{other}');
              insert into public.testing_center_memberships(user_id,actor_id,role) values
                ('{account}','f8-synthetic-tester','tester'),('{other}','f8-other-tester','tester');
            """, log='fixtures.log')
            def values(body):
                return ','.join(literal(body[key]) for key in ['p_id', 'p_channel', 'p_title', 'p_body']) + ',' + \
                    literal(json.dumps(body['p_context'])) + '::jsonb,' + literal(json.dumps(body['p_attachments'])) + '::jsonb'

            def check(label, sql, expected='t'):
                result = run('psql', *connection, '-c', sql, log=label + '.log').strip()
                assert result == expected, (label, result)
                checks.append(label)

            direct = f"select public.testing_contribution_submit_v2({values(payload)});"
            admitted = lambda body=payload, user=account: \
                f"select public.testing_contribution_submit_admitted('{user}',{values(body)});"
            # Real ACLs: no caller-chosen claims or RPC can replace server admission.
            for role in ['anon', 'authenticated', 'service_role']:
                run('psql', *connection, '-c', f"set role {role}; set request.jwt.claim.sub='{account}';" + direct,
                    log=role + '-direct-denied.log', expected=1)
                checks.append(role + '-direct-denied')
            for role in ['anon', 'authenticated', 'vantare_triage']:
                run('psql', *connection, '-c', f"set role {role};" + admitted(),
                    log=role + '-admitted-denied.log', expected=1)
                checks.append(role + '-admitted-denied')
            check('no-admission-no-rows', 'select count(*)=0 from public.testing_contributions;')
            week = "date_trunc('week',clock_timestamp() at time zone 'UTC')::date"
            for scope, subject in [('ip', 'a' * 64), ('account', account)]:
                check(scope + '-admission', f"set role service_role; select public.testing_report_admit('{scope}','{subject}',{week});", 'SET\nt')
            # Trusted Edge server principal only; call exactly the preview fields.
            run('psql', *connection, '-c', 'set role service_role;' + admitted(), log='store-preview.log')
            check('account-and-followup', f"select c.account_id='{account}' and f.consent and not f.credit from public.testing_contributions c join public.testing_report_followup f on f.contribution_id=c.id where c.id='{payload['p_id']}';")
            stored = run('psql', *connection, '-c', f"""select jsonb_build_object(
              'p_id',c.id,'p_channel',c.channel,'p_title',c.title,'p_body',c.body,
              'p_context',to_jsonb(ctx)-'contribution_id',
              'p_attachments',(select jsonb_agg(to_jsonb(a)-'contribution_id' order by kind)
                from public.testing_contribution_attachments a where a.contribution_id=c.id))
              from public.testing_contributions c join public.testing_contribution_context ctx
                on ctx.contribution_id=c.id where c.id='{payload['p_id']}';""", log='stored-preview.json')
            assert json.loads(stored) == payload
            checks.append('stored-exact-native-preview')
            run('psql', *connection, '-c', 'set role service_role;' + admitted(), log='exact-retry.log')
            check('retry-one-row', 'select count(*)=1 from public.testing_contributions;')
            run('psql', *connection, '-c', f"set role authenticated; set request.jwt.claim.sub='{account}'; select public.testing_report_credit('{payload['p_id']}',true);", log='credit-opt-in.log')
            run('psql', *connection, '-c', 'set role service_role;' + admitted(), log='credit-retry.log')
            check('retry-preserves-credit', f"select credit from public.testing_report_followup where contribution_id='{payload['p_id']}';")
            mutations = {'account': (payload, other),
                         'attachment': ({**payload, 'p_attachments': []}, account),
                         'context': ({**payload, 'p_context': {**payload['p_context'], 'game': 'lmu'}}, account)}
            for label, (body, user) in mutations.items():
                run('psql', *connection, '-c', 'set role service_role;' + admitted(body, user),
                    log=label + '-retry-conflict.log', expected=1)
                checks.append(label + '-retry-conflict')
            no_consent = {**payload, 'p_context': {**payload['p_context'], 'consent': None}}
            run('psql', *connection, '-c', 'set role service_role;' + admitted(no_consent), log='no-consent-denied.log', expected=1)
            checks.append('no-consent-denied')
            for label, body in {
                'tester-prose': {**payload, 'p_title': 'OrdinaryPrivateTesterNote'},
                'forged-hash': {**payload, 'p_attachments': [{**payload['p_attachments'][0], 'sha256': '0' * 64}]},
                'unconsented-attachment': {**payload, 'p_context': {**payload['p_context'], 'consent': {
                    **payload['p_context']['consent'], 'items': []}}},
            }.items():
                body = {**body, 'p_id': '15940000-0000-4000-8000-000000000099'}
                run('psql', *connection, '-c', 'set role service_role;' + admitted(body), log=label + '-denied.log', expected=1)
                checks.append(label + '-denied')
            for index in range(4):
                body = {**payload, 'p_id': f'15940000-0000-4000-8000-00000000009{index}'}
                run('psql', *connection, '-c', 'set role service_role;' + admitted(body), log=f'quota-row-{index}.log')
            sixth = {**payload, 'p_id': '15940000-0000-4000-8000-000000000099'}
            run('psql', *connection, '-c', 'set role service_role;' + admitted(sixth), log='sixth-row-denied.log', expected=1)
            check('structured-account-row-quota', 'select count(*)=5 from public.testing_contributions;')
            # Changed membership is checked at storage, even for verified server UUID.
            run('psql', *connection, '-c', f"update public.testing_center_memberships set active=false where user_id='{account}';", log='revoke.log')
            run('psql', *connection, '-c', 'set role service_role;' + admitted(), log='revoked-denied.log', expected=1)
            checks.append('revoked-denied')
            check('failures-preserve-rows', 'select count(*)=5 from public.testing_contributions;')
            # Adapter rollback preserves data/budgets and still closes direct RPCs.
            rollback = next((root / 'supabase/rollbacks').glob('*_testing_triage_admitted.down.sql'))
            run('psql', *actor, '-f', rollback, log='adapter-down.log')
            check('down-preserves-context', 'select count(*)=5 from public.testing_contribution_context;')
            check('down-preserves-budgets', 'select count(*)=2 from private.testing_report_attempts;')
            run('psql', *connection, '-c', f"set role authenticated; set request.jwt.claim.sub='{account}';" + direct,
                log='down-direct-still-denied.log', expected=1)
            checks.append('down-direct-still-denied')
            migration = root / 'supabase/migrations' / rollback.name.replace('.down.sql', '.sql')
            run('psql', *actor, '-f', migration, log='adapter-reapply.log')
            checks.append('adapter-reapply')
            (args.output / 'summary.json').write_text(json.dumps({'checks': checks, 'passed': len(checks),
                'migrations': sorted(names), 'preview_exact': True, 'edge_envelope_exact': bool(args.edge_rpc),
                'followup_regressions': regression_counts,
                'TCP': False, 'production': False}, indent=2) + '\n', encoding='utf-8')
            print(f'PASS: {len(checks)} combined SQL checks + {regression_counts}; exact native preview; real ACLs; no TCP/production')
        finally:
            run('pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop', log='stop.log')


if __name__ == '__main__':
    main()
