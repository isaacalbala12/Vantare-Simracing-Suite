"""Adversarial review regressions. Synthetic fixtures, no provider or network."""
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
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

    def test_review_p2_5_main_drains_and_purges_spool_before_failed_poll(self):
        with tempfile.TemporaryDirectory() as root:
            root=Path(root);state=State(root/'state');r=report();events=[];sent=[]
            def offline(_):raise OSError('fixture offline')
            triage.pass_once(state,[r],[],{},lambda _:response(),offline,NOW)
            expired=dict(r,id='15940000-0000-0000-0000-000000000011')
            state.discover(expired,NOW)
            state.analyzed(expired['id'],{'delivery_id':expired['id']},NOW-86401)
            state.close()
            credentials=root/'credentials';credentials.mkdir()
            (credentials/'t3-hmac').write_bytes(b'fixture-hmac')
            config={'state_dir':str(root/'state'),'known_versions':{},'provider':{},'webhook_url':'https://fixture.invalid'}
            def poll(*_):events.append('poll');raise OSError('fixture polling failure')
            def send(payload,*_):events.append('deliver');sent.append(payload)
            with patch.object(triage,'load_config',return_value=config),patch.object(triage,'read_reports',side_effect=poll), \
                 patch.object(triage,'deliver',side_effect=send),patch.object(triage.model,'run',side_effect=AssertionError('unexpected model')), \
                 patch.dict(triage.os.environ,{'CREDENTIALS_DIRECTORY':str(credentials)}), \
                 patch.dict('sys.modules',{'fcntl':SimpleNamespace(flock=lambda *args:None,LOCK_EX=1,LOCK_NB=2)}), \
                 patch('sys.argv',['triage','--config','fixture']),patch.object(triage.time,'time',return_value=NOW+120):
                self.assertEqual(triage.main(),1)
            self.assertEqual(len(sent),1,'polling failure must not block prepared delivery')
            self.assertEqual(events,['deliver','poll'])
            self.assertFalse((root/'state'/(expired['id']+'.json')).exists(),'expired spool must purge during polling outage')
            state=State(root/'state')
            try:
                self.assertEqual(state.db.execute('select status from reports where id=?',(r['id'],)).fetchone()[0],'delivered')
                self.assertEqual(state.db.execute('select status from reports where id=?',(expired['id'],)).fetchone()[0],'delivery_expired')
            finally:state.close()

    def test_review_p2_6_restart_recovers_interrupted_attempts_without_a_fourth_call(self):
        for count,legacy in ((1,False),(2,False),(3,False),(3,True)):
            with self.subTest(count=count,legacy=legacy),tempfile.TemporaryDirectory() as root:
                state=State(root);r=report();state.discover(r,NOW)
                for previous in range(count-1):
                    self.assertEqual(state.attempt(r['id']),previous+1);state.analysis_failed(r['id'])
                self.assertEqual(state.attempt(r['id']),count)
                if legacy:state.analysis_failed(r['id'])
                partial=state.root/(r['id']+'.'+'a'*32+'.tmp')
                partial.write_text('fixture partial redacted spool',encoding='utf-8')
                state.close()  # Persisted increment, no result: crash/restart boundary.
                state=State(root);calls=[];sent=[]
                try:
                    triage.pass_once(state,[r],[],{},lambda value:(calls.append(value) or response()),sent.append,NOW+120)
                    self.assertEqual(len(sent),1,'restart must produce a proposal or terminal failure')
                    self.assertFalse(partial.exists())
                    self.assertEqual(sent[0]['type'],'triage.failed' if count==3 else 'triage.proposal')
                    self.assertEqual(len(calls),0 if count==3 else 1)
                    self.assertEqual(state.db.execute('select attempt from reports where id=?',(r['id'],)).fetchone()[0],3 if count==3 else count+1)
                    self.assertEqual(state.pending_ids(),[])
                    triage.pass_once(state,[r],[],{},lambda _:self.fail('fourth or duplicate analysis'),sent.append,NOW+240)
                    self.assertEqual(len(sent),1)
                finally:state.close()

    def test_review_p2_6_restart_reuses_spool_persisted_before_sqlite_result(self):
        with tempfile.TemporaryDirectory() as root:
            state=State(root);r=report();sent=[]
            def offline(_):raise OSError('fixture offline')
            triage.pass_once(state,[r],[],{},lambda _:response(),offline,NOW,intake=lambda *_:None)
            payload=state.payload(r['id'])
            # Durable state of SIGKILL after atomic spool replace, before SQL ACK.
            state.db.execute("update reports set status='analyzing',attempt=3,delivery_until=null,intake_pending=0 where id=?",(r['id'],));state.db.commit();state.close()
            state=State(root);plane=[]
            try:
                triage.pass_once(state,[r],[],{},lambda _:self.fail('persisted proposal reanalyzed'),sent.append,NOW+120,intake=lambda p,_:plane.append(p))
                self.assertEqual(sent,[payload]);self.assertEqual(plane,[payload])
                self.assertFalse((state.root/(r['id']+'.json')).exists())
            finally:state.close()
