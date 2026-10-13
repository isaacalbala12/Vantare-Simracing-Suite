"""Adversarial review regressions. Synthetic fixtures, no provider or network."""
import json
from pathlib import Path
import tempfile
import unittest
from state import State
import triage
from test_triage import report, response, NOW


class Tests(unittest.TestCase):
    def pipeline(self, body):
        r=report();r['title']=body;r['body']=body+' steps expected actual '*15
        r['attachments'][0]['content']='ERROR '+body
        r['context']['telemetry_summary']['errors']=[{'type':'Fixture','message':body,'first_line':body,'fingerprint':'review-fixture'}]
        captured=[];sent=[];proposal=response();proposal["evidence_refs"]=["log:L1-L1"]
        with tempfile.TemporaryDirectory() as root:
            state=State(root)
            try:
                triage.pass_once(state,[r],[],{'testers':['1.2.3']},lambda value:(captured.append(value) or proposal),sent.append,NOW)
            finally:state.close()
        self.assertEqual(len(captured),1);self.assertEqual(len(sent),1)
        return json.dumps(captured,ensure_ascii=False),json.dumps(sent,ensure_ascii=False)

    def test_review_p1_1_basic_and_sk_hyphen_never_reach_model_or_delivery(self):
        fixtures=[('Authorization: Basic c3ludGhldGljOmZpeHR1cmU=','c3ludGhldGljOmZpeHR1cmU='),
                  ('"Authorization":"bAsIc c3ludGhldGljOmZpeHR1cmU="','c3ludGhldGljOmZpeHR1cmU='),
                  ('sk-'+'proj-FixtureOpaqueCredential','sk-'+'proj-FixtureOpaqueCredential')]
        for raw,secret in fixtures:
            with self.subTest(raw=raw):
                model,delivery=self.pipeline(raw)
                self.assertNotIn(secret,model);self.assertNotIn(secret,delivery)

    def test_review_p1_2_account_label_variants_never_reach_model_or_delivery(self):
        secret='abcdefab-cdef-abcd-efab-abcdefabcdef'
        for label in ('accountId','AccountID','account-id','account_id'):
            with self.subTest(label=label):
                model,delivery=self.pipeline(json.dumps({label:secret}))
                self.assertNotIn(secret,model);self.assertNotIn(secret,delivery)

    def test_review_p1_3_foreign_unc_profile_never_reaches_model_or_delivery(self):
        for raw in (r'ERROR \\LAB\Profiles\SyntheticOther\log.txt',
                    'ERROR //LAB/Profiles/SyntheticOther/log.txt',
                    r'ERROR "\\LAB\Profiles\Synthetic Other\log.txt"'):
            with self.subTest(raw=raw):
                model,delivery=self.pipeline(raw)
                for output in (model,delivery):
                    self.assertNotIn('SyntheticOther',output);self.assertNotIn('Synthetic Other',output)
                    self.assertIn('ERROR',output)
