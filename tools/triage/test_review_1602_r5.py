"""F6 closed values and derived hashes, offline synthetic fixtures only."""
import copy
import json
import re
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
import analysis
import privacy
import triage
import plane_intake
from state import State
from test_triage import report, response, NOW
from test_plane_intake import MockPlane, CONFIG, Reply

CASES = Path(__file__).with_name('structured-f6-cases.json')
SECRETS = ['sk-proj-FixtureOpaqueCredential', '192.168.12.7',
           'aa:bb:cc:dd:ee:ff', 'abcdefab-cdef-abcd-efab-abcdefabcdef',
           'SyntheticOtherPerson']


class Tests(unittest.TestCase):
    def test_catalog_is_backed_by_real_service_errors_and_native_modules(self):
        native = Path(__file__).resolve().parents[2] / 'vantare-v2' / 'native'
        source = (native / 'services/src/error.rs').read_text(encoding='utf-8')
        enum = source.split('pub enum Error {', 1)[1].split('}', 1)[0]
        self.assertEqual(set(privacy.CATALOG['errors']),
                         set(re.findall(r'^    (\w+),$', enum, re.M)) | {'ServicesCommandFailure'})
        self.assertIn('"ServicesCommandFailure"',
                      (native / 'services/src/triage.rs').read_text(encoding='utf-8'))
        self.assertEqual(set(privacy.CATALOG['modules']),
                         {p.parent.name for p in native.glob('*/Cargo.toml')})

    def test_shared_derived_fingerprints(self):
        cases = json.loads(CASES.with_name('error-f6-cases.json').read_text(encoding='utf-8'))
        for case in cases:
            self.assertEqual(privacy.error_record(case['input']), case['expected'])

    def test_shared_f6_exact_projection_and_boundaries(self):
        for case in json.loads(CASES.read_text(encoding='utf-8')):
            with self.subTest(case=case['name']):
                self.assertEqual(privacy.log_fields(case['input']), case['expected'])

    def test_f6_extract_model_t3_intake_and_derived_error_refs(self):
        exact = json.loads(CASES.read_text(encoding='utf-8'))[0]['input']
        for secret, raw_log in [(secret, json.dumps({
                'level':'ERROR', **{k:secret for k in ('error_code','error_type','module','version')}}))
                for secret in SECRETS] + [(SECRETS[0], exact)]:
            with self.subTest(secret=secret), tempfile.TemporaryDirectory() as root:
                r = report()
                r['attachments'][0]['content'] = raw_log
                r['context'].update(app_version=secret, game_version=secret)
                r['context']['telemetry_summary']['errors'] = [
                    {'type':secret, 'message':'owner only', 'fingerprint':secret}]
                old = copy.deepcopy(r); old['id'] = '15940000-0000-0000-0000-000000000011'
                captured = []; sent = []; api = MockPlane()
                client = plane_intake.Intake(CONFIG, 'test-sink-token', api)
                def analyze(value):
                    captured.append(value)
                    proposal = response()
                    proposal['evidence_refs'] = ['error:' + value['errors'][0]['fingerprint']]
                    # Simulate a model echoing the structured fields it received.
                    proposal['summary'] = value['errors'][0]['type']
                    return proposal
                state = State(root)
                try:
                    with patch('socket.socket', side_effect=AssertionError('network forbidden')):
                        triage.pass_once(state, [r], [old], {}, analyze, sent.append, NOW,
                                         intake=client.publish)
                    self.assertEqual(len(captured), 1); self.assertEqual(len(sent), 1)
                    post = next(c[2] for c in api.calls if c[0] == 'POST')
                    http = []
                    def open_request(request, timeout):
                        http.append(json.loads(request.data))
                        reply = Reply({}); reply.status = 200
                        return reply
                    with patch('triage.urllib.request.build_opener',
                               return_value=SimpleNamespace(open=open_request)):
                        triage.deliver(sent[0], 'https://fixture.invalid/', b'fixture-only')
                    self.assertEqual(http, sent)
                    for output in (captured, sent, http, post):
                        for private in SECRETS:
                            self.assertNotIn(private, json.dumps(output))
                    self.assertEqual(captured[0]['errors'][0]['type'], 'otro')
                    self.assertRegex(captured[0]['errors'][0]['fingerprint'], r'^[0-9a-f]{64}$')
                    _, facts = analysis.extract(r, [], {})
                    forged = response(); forged['evidence_refs'] = ['error:' + secret]
                    with self.assertRaises(ValueError):
                        analysis.validate(forged, facts)
                finally:
                    state.close()

    def test_supplied_fingerprint_never_controls_derived_hash(self):
        r = report()
        error = {'type':'ServicesCommandFailure', 'message':'owner only', 'fingerprint':'a'*64}
        r['context']['telemetry_summary']['errors'] = [error]
        first, _ = analysis.extract(r, [], {})
        error.update(fingerprint='b'*64, message='different private message')
        second, _ = analysis.extract(r, [], {})
        self.assertEqual(first['errors'], second['errors'])
        self.assertNotEqual(first['errors'][0]['fingerprint'], 'a'*64)
        _, facts = analysis.extract(r, [], {})
        forged = response(); forged['evidence_refs'] = ['error:' + 'b'*64]
        with self.assertRaises(ValueError):
            analysis.validate(forged, facts)

    def test_exact_sql_error_type_or_fingerprint_private_in_isolation(self):
        for field in ('type', 'fingerprint'):
            r = report()
            error = {'type':'ServicesCommandFailure', 'message':'owner only', 'fingerprint':'a'*64}
            error[field] = SECRETS[0]
            r['context']['telemetry_summary']['errors'] = [error]
            value, facts = analysis.extract(r, [], {})
            self.assertNotIn(SECRETS[0], json.dumps(value))
            self.assertRegex(value['errors'][0]['fingerprint'], r'^[0-9a-f]{64}$')
            self.assertEqual(facts['refs'] & {'error:' + SECRETS[0]}, set())

    def test_legacy_spool_private_reference_and_versions_do_not_export(self):
        with tempfile.TemporaryDirectory() as root:
            state = State(root); r = report(); state.discover(r, NOW)
            payload = {'delivery_id':r['id'], 'sent_at':r['created_at'], 'type':'triage.proposal',
                       'contribution':{'id':r['id'], 'channel':'testers', 'title':'Failure',
                                       'game':'lmu','app_version':SECRETS[0], 'game_version':SECRETS[4]},
                       'triage':response()}
            payload['triage']['evidence_refs'] = ['error:' + SECRETS[0], 'error:' + 'a'*64]
            state.analyzed(r['id'], payload, NOW, intake=True)
            sent = []; api = MockPlane(); client = plane_intake.Intake(CONFIG, 'test-sink-token', api)
            try:
                with patch('socket.socket', side_effect=AssertionError('network forbidden')):
                    triage.pass_once(state, [], [], {}, lambda _:self.fail('reanalysis'), sent.append,
                                     NOW, intake=client.publish)
                self.assertEqual(sent[0]['triage']['evidence_refs'], [])
                for output in (sent, next(c[2] for c in api.calls if c[0] == 'POST')):
                    for secret in SECRETS:
                        self.assertNotIn(secret, json.dumps(output))
            finally:
                state.close()
