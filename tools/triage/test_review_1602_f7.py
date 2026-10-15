"""Isaac F7=C: no tester prose in provider, HTTP, Intake or old spools."""
import copy
import json
import tempfile
import unittest
from unittest.mock import patch
import analysis
import triage
import plane_intake
from state import State
from test_triage import report, response, NOW
from test_plane_intake import MockPlane, CONFIG, Reply

TEXTS = [r'account\u0049d=SyntheticOtherPerson',
         r'accountId\u003aSyntheticOtherPerson',
         r'Authorization\x3a Basic OpaqueTailSecret',
         '{"account id":"SyntheticOtherPerson"}',
         '{"user.name":"SyntheticOtherPerson"}',
         'épassword=OpaqueTailSecret', 'OrdinaryPrivateTesterNote']


class F7(unittest.TestCase):
    def setUp(self):
        self.network = patch('socket.socket', side_effect=AssertionError('network forbidden'))
        self.network.start()

    def tearDown(self):
        self.network.stop()

    def test_system_fields_cannot_hide_tester_prose(self):
        r = report()
        r['context']['system'] = {
            'cpu':{'model':TEXTS[-1], 'cores':8},
            'os':{'name':TEXTS[-1], 'version':TEXTS[-1], 'build':TEXTS[-1]},
            'gpu':[{'model':TEXTS[-1], 'driver_version':TEXTS[-1]}],
            'displays':[{'width':TEXTS[-1], 'height':1080, 'primary':True}],
            'ram_gb':32, 'overlays_active':['OBS',TEXTS[-1]], 'obs_active':True}
        value, _ = analysis.extract(r, [], {})
        self.assertNotIn(TEXTS[-1], json.dumps(value))
        self.assertEqual(value['system']['cpu']['cores'], 8)
        self.assertEqual(value['system']['ram_gb'], 32)
        self.assertEqual(value['system']['overlays_active'], ['OBS'])

    def test_tester_text_is_absent_from_model_and_both_http_sinks(self):
        for text in TEXTS:
            with self.subTest(text=text), tempfile.TemporaryDirectory() as root:
                r = report(); r.update(title=text, body=text)
                old = copy.deepcopy(r)
                old.update(id='15940000-0000-0000-0000-000000000011',
                           created_at='2026-10-12T00:00:00Z')
                state = State(root); model_inputs = []; delivered = []
                mock = MockPlane(); intake = plane_intake.Intake(CONFIG, 'test-sink-token', mock)
                def analyze(value):
                    model_inputs.append(value)
                    raw = response()
                    # Provider output is untrusted as well; an old/provider echo
                    # cannot reintroduce tester prose through generated text.
                    raw.update(summary=text, preliminary_fix=text, reasons=[text])
                    return raw
                def send(payload):
                    class Capture:
                        def open(self, request, timeout):
                            delivered.append(json.loads(request.data))
                            reply = Reply({}); reply.status = 200; return reply
                    with patch.object(triage.urllib.request, 'build_opener', return_value=Capture()):
                        triage.deliver(payload, 'http://unused.invalid/', b'synthetic-fixture')
                try:
                    triage.pass_once(state, [r], [old], {'testers':['1.2.3']},
                                     analyze, send, NOW, intake=intake.publish)
                finally:
                    state.close()
                self.assertEqual(len(model_inputs), 1)
                self.assertEqual(len(delivered), 1)
                self.assertEqual(mock.posts, 1)
                for value in (model_inputs[0], delivered[0], [data for method, url, data in mock.calls if method == 'POST'][0]):
                    encoded = json.dumps(value, ensure_ascii=False)
                    self.assertNotIn(text, encoded)
                    self.assertNotIn('SyntheticOtherPerson', encoded)
                    self.assertNotIn('OpaqueTailSecret', encoded)
                    self.assertNotIn('OrdinaryPrivateTesterNote', encoded)
                self.assertNotIn('title', model_inputs[0])
                self.assertNotIn('body', model_inputs[0])
                self.assertNotIn('title', model_inputs[0]['duplicate_candidates'][0])
                self.assertNotIn('title', delivered[0]['contribution'])
                self.assertNotIn('body_redacted', delivered[0]['contribution'])

    def test_legacy_spool_and_direct_intake_drop_free_text(self):
        r = report(); raw = response()
        raw.update(summary=TEXTS[-1], preliminary_fix=TEXTS[-1], reasons=[TEXTS[-1]])
        payload = {'delivery_id':r['id'], 'sent_at':r['created_at'], 'type':'triage.proposal',
                   'contribution':{'id':r['id'], 'channel':'testers', 'title':TEXTS[-1],
                                   'body_redacted':TEXTS[-1], 'game':'lmu', 'game_version':'1.0.0'},
                   'triage':raw}
        with tempfile.TemporaryDirectory() as root:
            state = State(root); state.discover(r, NOW)
            state.analyzed(r['id'], payload, NOW, intake=True)
            sent = []; mock = MockPlane()
            intake = plane_intake.Intake(CONFIG, 'test-sink-token', mock)
            try:
                triage.pass_once(state, [], [], {},
                                 lambda _: self.fail('replay must not reanalyze'),
                                 sent.append, NOW, intake=intake.publish)
            finally:
                state.close()
            self.assertEqual(len(sent), 1); self.assertEqual(mock.posts, 1)
            self.assertNotIn(TEXTS[-1], json.dumps([sent, mock.calls]))
        _, content = plane_intake.content(payload)
        self.assertNotIn(TEXTS[-1], json.dumps(content))


if __name__ == '__main__':
    unittest.main()
