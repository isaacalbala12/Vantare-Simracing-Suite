"""F5 and export allowlists: synthetic data, no real sinks or provider."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import analysis
import privacy
import triage
import plane_intake
from state import State
from test_triage import report, response, NOW
from test_plane_intake import MockPlane, CONFIG

CASES = Path(__file__).with_name('export-cases.json')


class Tests(unittest.TestCase):
    def test_f5_exact_and_property_every_external_sink(self):
        cases = json.loads(CASES.read_text(encoding='utf-8'))
        old = json.loads(CASES.with_name('redaction-cases.json').read_text(encoding='utf-8'))
        for case in cases + old:
            for generated in (False, True):
                with self.subTest(case=case['name'], generated=generated), tempfile.TemporaryDirectory() as root:
                    text = case['input']
                    r = report(); r['title'] = text; r['body'] = text
                    r['attachments'][0]['content'] = text
                    r['context']['telemetry_summary']['errors'] = [
                        {'type':'Fixture', 'fingerprint':'fixture', 'message':text, 'first_line':text}]
                    r['context']['telemetry_summary']['events'] = [{'name':text, 'at':text}]
                    old_report = report(); old_report['id'] = '15940000-0000-0000-0000-000000000011'
                    old_report['title'] = text
                    proposal = response(); proposal['evidence_refs'] = ['error:fixture']
                    if generated:
                        proposal.update(summary=text[:200], preliminary_fix=text[:600], reasons=[text[:200]])
                    captured=[]; sent=[]; api=MockPlane()
                    client=plane_intake.Intake(CONFIG, 'test-sink-token', api)
                    state=State(root)
                    try:
                        with patch('socket.socket', side_effect=AssertionError('network forbidden')):
                            triage.pass_once(state, [r], [old_report], {},
                                             lambda v: (captured.append(v) or proposal), sent.append,
                                             NOW, intake=client.publish)
                        self.assertEqual(len(captured), 1); self.assertEqual(len(sent), 1)
                        post=next(c[2] for c in api.calls if c[0]=='POST')
                        for output in (captured, sent, post):
                            for secret in case['secrets']:
                                self.assertNotIn(secret, json.dumps(output))
                        self.assertEqual(captured[0]['log'], [])
                        self.assertNotIn('message', captured[0]['errors'][0])
                        self.assertEqual(captured[0]['events'], [])
                    finally:
                        state.close()

    def test_shared_text_limits_and_structured_log_projection(self):
        for case in json.loads(CASES.read_text(encoding='utf-8')):
            with self.subTest(case=case['name']):
                self.assertEqual(privacy.external_text(case['input'], 120), case['expected'])
                self.assertEqual(privacy.external_text(case['expected'], 120), case['expected'])
        for case in json.loads(CASES.with_name('log-field-cases.json').read_text(encoding='utf-8')):
            with self.subTest(case=case['name']):
                self.assertEqual(privacy.log_fields(case['input']), case['expected'])
        self.assertEqual(privacy.external_text('a\n b\r\n c', 4), 'a b ')
        self.assertEqual(privacy.external_text('x'*500, 120), 'x'*120)
        self.assertEqual(privacy.log_fields('{"module":"services","module":"OpaqueTailSecret"}'), [])

    def test_log_allowlist_has_no_raw_text_even_in_valid_json(self):
        r=report()
        r['attachments'][0]['content']=json.dumps([
            {'level':'ERROR', 'error_type':'Timeout', 'module':'services', 'count':2,
             'relative_ms':500, 'version':'1.2.3', 'message':'OpaqueTailSecret',
             'password':'OpaqueTailSecret', 'payload':{'level':'OpaqueTailSecret'}}])
        value, facts=analysis.extract(r, [], {})
        self.assertEqual(value['log'], [{'line':1, 'level':'ERROR', 'error_type':'Timeout',
                         'module':'services', 'count':2, 'relative_ms':500, 'version':'1.2.3'}])
        self.assertNotIn('OpaqueTailSecret', json.dumps(value))
        self.assertEqual(facts['lines'], {1})

    def test_discarded_body_and_raw_log_cannot_claim_missing_evidence(self):
        r=report();r['body']='password=OpaqueTailSecret '+('steps '*50)
        r['attachments'][0]['content']='ERROR arbitrary raw text'
        r['context']['telemetry_summary']={}
        value,facts=analysis.extract(r,[],{'testers':['1.2.3']})
        self.assertEqual(value['body'],privacy.REMOVED)
        self.assertFalse(facts['content_minimum']);self.assertFalse(facts['evidence'])
        self.assertEqual(facts['lines'],set())
        proposal=response();proposal['evidence_refs']=[]
        result=analysis.validate(proposal,facts)
        self.assertEqual(result['verdict'],'dudoso')
        self.assertEqual(result['criteria']['contenido_minimo'],'no')
        self.assertEqual(result['criteria']['evidencia'],'no')

    def test_legacy_pending_spool_uses_current_contract_without_reanalysis(self):
        with tempfile.TemporaryDirectory() as root:
            state=State(root); r=report(); state.discover(r,NOW)
            text='ERROR {\n "password"\n : "OpaqueTailSecret"\n}'
            payload={'delivery_id':r['id'],'sent_at':r['created_at'],'type':'triage.proposal',
                     'contribution':{'id':r['id'],'channel':'testers','title':text,'body_redacted':text,
                                     'game':'lmu','logs':[text]}, 'triage':response()}
            payload['triage']['summary']=text; payload['triage']['logs']=[text]
            state.analyzed(r['id'],payload,NOW,intake=True)
            sent=[];api=MockPlane();client=plane_intake.Intake(CONFIG,'test-sink-token',api)
            try:
                triage.pass_once(state,[],[],{},lambda _:self.fail('reanalysis'),sent.append,NOW,
                                 intake=client.publish)
                self.assertEqual(len(sent),1)
                for value in (sent,next(c[2] for c in api.calls if c[0]=='POST')):
                    self.assertNotIn('OpaqueTailSecret',json.dumps(value))
                    self.assertNotIn('logs',json.dumps(value))
                self.assertEqual(sent[0]['contribution']['title'],privacy.REMOVED)
            finally:
                state.close()
