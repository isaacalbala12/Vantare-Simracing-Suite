"""F4: structural JSON redaction at each export boundary; synthetic/offline."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from privacy import redact, clean_tree
from state import State
import triage
import plane_intake
from test_triage import report, response, NOW
from test_plane_intake import MockPlane, CONFIG


CASES = Path(__file__).with_name('redaction-cases.json')


class Tests(unittest.TestCase):
    def test_review_r3_f4_structural_cases(self):
        for case in json.loads(CASES.read_text(encoding='utf-8')):
            with self.subTest(case=case['name']):
                clean = redact(case['input'])
                self.assertEqual(clean, case['expected'])
                self.assertEqual(redact(clean), clean)

    def test_review_r3_f4_keys_redacted_in_existing_tree(self):
        self.assertEqual(clean_tree({'outer': [{'PassWord': {'anything': 'OpaqueTailSecret'}}]}),
                         {'outer': [{'PassWord': '<redacted>'}]})

    def test_review_r3_f4_model_t3_intake_with_clean_and_generated_summary(self):
        fixtures = [('password', 'StartFixture"OpaqueTailSecret', 'OpaqueTailSecret'),
                    ('username', 'Synthetic "OtherPerson"', 'OtherPerson'),
                    ('token', 'StartFixture"OpaqueTailToken', 'OpaqueTailToken')]
        for key, value, secret in fixtures:
            for depth in range(4):
                text = json.dumps({key: value})
                for _ in range(depth):
                    text = json.dumps(text)
                for generated in (False, True):
                    with self.subTest(key=key, depth=depth, generated=generated), tempfile.TemporaryDirectory() as root:
                        r = report(); r['title'] = text; r['body'] = text
                        r['attachments'][0]['content'] = 'ERROR ' + text
                        r['context']['telemetry_summary']['errors'] = [{'type': 'Fixture', 'message': text,
                                                                       'first_line': text, 'fingerprint': 'fixture'}]
                        proposal = response()
                        proposal['evidence_refs'] = ['error:fixture']
                        if generated:
                            proposal['summary'] = text
                            proposal['preliminary_fix'] = text
                            proposal['reasons'] = [text]
                        captured = []; sent = []; api = MockPlane()
                        client = plane_intake.Intake(CONFIG, 'test-sink-token', api)
                        state = State(root)
                        try:
                            with patch('socket.socket', side_effect=AssertionError('network forbidden')):
                                triage.pass_once(state, [r], [], {}, lambda v: (captured.append(v) or proposal),
                                                 sent.append, NOW, intake=client.publish)
                            self.assertEqual(len(captured), 1); self.assertEqual(len(sent), 1)
                            post = next(c[2] for c in api.calls if c[0] == 'POST')
                            for output in (captured, sent, post):
                                self.assertNotIn(secret, json.dumps(output))
                        finally:
                            state.close()
