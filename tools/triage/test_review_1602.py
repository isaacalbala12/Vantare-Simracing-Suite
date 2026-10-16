"""Adversarial review regressions. Synthetic fixtures, no provider or network."""
import json
import copy
import hashlib
import re
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from state import State
import triage
from test_triage import report, response, NOW
from test_plane_intake import MockPlane, CONFIG
from privacy import redact
import privacy
import plane_intake


class Tests(unittest.TestCase):
    def test_review_r2_f1_json_representations_never_reach_any_sink(self):
        account='abcdefab-cdef-abcd-efab-abcdefabcdef'
        basic='c3ludGhldGlj'+'OmZpeHR1cmU='
        fixtures=[(json.dumps({'accountId':account}),account),
                  (json.dumps({'Authorization':'Basic '+basic}),basic),
                  (json.dumps({'username':'SyntheticOther'}),'SyntheticOther')]
        for raw,secret in fixtures:
            for depth in range(4):
                with self.subTest(label=raw.split(':')[0],depth=depth),tempfile.TemporaryDirectory() as root:
                    text=raw.replace('"','\\'*depth+'"')
                    r=report();r['title']=text;r['body']=text+' steps expected actual '*15
                    proposal=response();proposal['summary']='ERROR '+text
                    captured=[];sent=[];api=MockPlane()
                    client=plane_intake.Intake(CONFIG,'test-sink-token',api)
                    state=State(root)
                    try:
                        with patch('socket.socket',side_effect=AssertionError('network forbidden')):
                            triage.pass_once(state,[r],[],{},lambda value:(captured.append(value) or proposal),
                                             sent.append,NOW,intake=client.publish)
                        self.assertEqual(len(captured),1);self.assertEqual(len(sent),1)
                        post=next(c[2] for c in api.calls if c[0]=='POST')
                        for value in (captured,sent,post):
                            self.assertNotIn(secret,json.dumps(value))
                            self.assertNotIn('body_redacted',json.dumps(value))
                        self.assertEqual(redact(redact(text)),redact(text))
                    finally:state.close()
        self.assertEqual(redact(r'ERROR unicode=\u00e9 public="session"'),r'ERROR unicode=\u00e9 public="session"')

    def pipeline(self, body):
        r=report();r['title']=body;r['body']=body+' steps expected actual '*15
        r['attachments'][0]['content']='ERROR '+body
        r['attachments'][0]['sha256']=hashlib.sha256(r['attachments'][0]['content'].encode()).hexdigest()
        r['context']['telemetry_summary']['errors']=[{'type':'Fixture','message':body,'first_line':body,'fingerprint':'review-fixture'}]
        captured=[];sent=[];proposal=response();proposal["evidence_refs"]=["error:" + privacy.error_record(r["context"]["telemetry_summary"]["errors"][0])["fingerprint"]]
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
                    self.assertNotIn('body_redacted',output)

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

    def polling_fixture(self, visible, state, credential):
        # Minimal read-only SQL fixture models visibility and tuple predicates,
        # not producer/model code. No subprocess or network leaves this process.
        def psql(args,**options):
            sql=options['input'].decode();rows=copy.deepcopy(visible)
            self.assertIn('begin read only',sql.lower());self.assertNotIn('account_id',sql)
            cursor=re.search(r"\(c.created_at,c.id\) > \(timestamptz '([^']+)','([^']+)'::uuid\)",sql)
            if cursor:
                point=(triage.utc(cursor[1]),cursor[2])
                rows=[r for r in rows if (triage.utc(r['created_at']),r['id'])>point or r['id'] in state.pending_ids()]
            rows.sort(key=lambda r:(triage.utc(r['created_at']),r['id']))
            if "'queue'" in sql:
                selected=re.search(r"c.id in \(([^)]+)\)",sql)
                if selected and not cursor:rows=[r for r in rows if r['id'] in selected[1]]
                if re.search(r"c.state='received' and \(false\)",sql):rows=[]
                value={'queue':rows[:20],'history':[]}
            else:
                value=[{k:r[k] for k in ('id','created_at')} for r in rows[:200]]
            return SimpleNamespace(returncode=0,stdout=json.dumps(value).encode())
        with patch.object(triage.subprocess,'run',side_effect=psql):
            return triage.read_reports({'ca':'fixture-only'},state,credential)

    def test_review_p2_7_late_visible_report_behind_persisted_cursor_is_discovered_once(self):
        with tempfile.TemporaryDirectory() as root:
            state=State(Path(root)/'state');credential=Path(root)/'fixture-connection'
            credential.write_text('postgresql://vantare_triage.'+triage.PROJECT+':fixture@fixture.pooler.supabase.com:5432/postgres',encoding='utf-8')
            a=report();a['created_at']='2026-10-13T00:00:01Z'
            b=copy.deepcopy(a);b['id']='15940000-0000-0000-0000-000000000011';b['created_at']='2026-10-13T00:00:02Z'
            sent=[];calls=[]
            def analyze(value):calls.append(value);return response()
            try:
                reports,history=self.polling_fixture([b],state,credential)
                triage.pass_once(state,reports,history,{},analyze,sent.append,NOW+120)
                self.assertEqual(state.cursor()[1],b['id'])
                # A commits after B was discovered/ACKed, with an earlier creation.
                reports,history=self.polling_fixture([a,b],state,credential)
                self.assertIn(a['id'],[r['id'] for r in reports],'late commit excluded forever by cursor')
                triage.pass_once(state,reports,history,{},analyze,sent.append,NOW+240)
                reports,history=self.polling_fixture([a,b],state,credential)
                self.assertEqual(reports,[])
                triage.pass_once(state,reports,history,{},analyze,sent.append,NOW+360)
                self.assertEqual([p['delivery_id'] for p in sent],[b['id'],a['id']])
                self.assertEqual(len(calls),2)
            finally:state.close()

    def test_review_p2_7_seen_first_page_does_not_starve_later_unseen_reports(self):
        with tempfile.TemporaryDirectory() as root:
            state=State(Path(root)/'state');credential=Path(root)/'fixture-connection'
            credential.write_text('postgresql://vantare_triage.'+triage.PROJECT+':fixture@fixture.pooler.supabase.com:5432/postgres',encoding='utf-8')
            visible=[]
            try:
                for index in range(225):
                    r=report();r['id']='15940000-0000-0000-0000-'+format(index,'012x');visible.append(r)
                    if index<205:
                        state.discover(r,NOW)
                        state.db.execute("update reports set status='delivered' where id=?",(r['id'],));state.db.commit()
                reports,_=self.polling_fixture(visible,state,credential)
                self.assertEqual([r['id'] for r in reports],[r['id'] for r in visible[205:]])
            finally:state.close()
