import io
import json
import sqlite3
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest.mock import patch
import plane_intake as plane
from state import State
import triage
from test_triage import ID, NOW, report, response

ISSUE='15940000-0000-0000-0000-000000000042'
INTAKE='15940000-0000-0000-0000-000000000099'
CONFIG={'base_url':'http://sapphireos.tail357eab.ts.net:8088','workspace':plane.WORKSPACE,'project_id':plane.PROJECT}


def payload():
    return {'type':'triage.proposal','contribution':{'id':ID,'channel':'testers','title':'Error user@example.invalid <script>','game':'lmu','game_version':'1.0.0','account_id':'PRIVATE-ACCOUNT','body_redacted':'PRIVATE-BODY','logs':['PRIVATE-LOG']},
            'triage':{**response(),'summary':'Falló token=private-token-value <script>'}}


class Reply:
    def __init__(self,value):self.value=value
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def read(self,limit):return json.dumps(self.value,ensure_ascii=False).encode('utf-8')


class MockPlane:
    """v1 contract: POST ignores external metadata; PATCH targets ISSUE UUID."""
    def __init__(self):
        self.enabled=True;self.rows=[];self.calls=[];self.posts=0
        self.lose_response=False;self.ignore_metadata=False;self.enable_denied=False
        self.unavailable=False;self.paginate=False;self.accepted=False
    def open(self,req,timeout):
        self.calls.append((req.get_method(),req.full_url,None if req.data is None else json.loads(req.data)))
        if self.unavailable:raise OSError('private-network-diagnostic')
        self_key=req.get_header('X-api-key')
        if self_key!='test-sink-token':raise AssertionError('dedicated credential')
        url=urllib.parse.urlsplit(req.full_url);path=url.path;method=req.get_method();data=self.calls[-1][2]
        if path.endswith('/projects/'+plane.PROJECT+'/'):
            if method=='PATCH':
                if self.enable_denied:raise urllib.error.HTTPError(req.full_url,403,'Forbidden',{},io.BytesIO(b'private-response'))
                if data!={'intake_view':True}:raise AssertionError('only Intake enable')
                self.enabled=True
            return Reply({'id':plane.PROJECT,'intake_view':self.enabled})
        if path.endswith('/work-items/'):
            query=urllib.parse.parse_qs(url.query)
            for row in self.rows:
                issue=row['issue_detail']
                if issue.get('external_id')==query['external_id'][0] and issue.get('external_source')==query['external_source'][0]:return Reply(issue)
            raise urllib.error.HTTPError(req.full_url,404,'Not found',{},io.BytesIO(b'private-response'))
        if path.endswith('/intake-issues/'):
            if method=='POST':
                self.posts+=1
                # source CE v1 ignores both external fields on creation.
                issue={'id':ISSUE,**data['issue']}
                self.rows.append({'id':INTAKE,'issue':ISSUE,'issue_detail':issue,'status':-2})
                if self.lose_response:self.lose_response=False;raise OSError('private-uncertain-response')
                return Reply(self.rows[-1])
            if self.paginate and 'cursor=' not in url.query:return Reply({'results':[],'next_page_results':True,'next_cursor':'second'})
            return Reply({'results':self.rows,'next_page_results':False,'next_cursor':None})
        if path.endswith('/intake-issues/'+ISSUE+'/') and method=='PATCH':
            if set(data)!={'issue'} or set(data['issue'])!={'external_id','external_source'}:raise AssertionError('no status/review mutation')
            if not self.ignore_metadata:self.rows[0]['issue_detail'].update(data['issue'])
            return Reply(self.rows[0])
        raise AssertionError('unexpected Plane path or mutation')


class Tests(unittest.TestCase):
    def setUp(self):
        self.network=patch('socket.socket',side_effect=AssertionError('network forbidden'));self.network.start()
        self.root=tempfile.TemporaryDirectory();self.state=State(self.root.name)
        self.api=MockPlane();self.client=plane.Intake(CONFIG,'test-sink-token',self.api)
    def tearDown(self):
        self.state.close();self.root.cleanup();self.network.stop()

    def test_minimal_redacted_entry_exact_external_identity_and_no_acceptance(self):
        self.client.publish(payload(),self.state)
        post=next(c[2] for c in self.api.calls if c[0]=='POST');text=json.dumps(post)
        for private in ('PRIVATE-ACCOUNT','account_id','user@example','PRIVATE-BODY','PRIVATE-LOG','private-token-value','source_email'):
            self.assertNotIn(private,text)
        self.assertEqual(post['issue']['name'],'[contenido retirado por privacidad]')
        self.assertNotIn('<script>',post['issue']['description_html'])
        safe=payload();safe['contribution']['title']='Error <script>';safe['triage']['summary']='Falló <script>'
        _,entry=plane.content(safe)
        self.assertEqual(entry['issue']['name'],'Error <script>')  # Plain title, HTML escaped body.
        self.assertIn('&lt;script&gt;',entry['issue']['description_html'])
        for value in ('testers','lmu','1.0.0','válido','0.900',ID):self.assertIn(value,text if value!='válido' else post['issue']['description_html'])
        self.assertEqual(self.state.intake_record(ID),('published',ISSUE))
        self.assertEqual(self.api.rows[0]['status'],-2)
        self.assertFalse(any('/review' in c[1] for c in self.api.calls))
        self.client.publish(payload(),self.state);self.assertEqual(self.api.posts,1)

    def test_existing_external_work_item_dedupes_after_restart_or_intake_acceptance(self):
        self.api.rows=[{'id':INTAKE,'issue':ISSUE,'status':1,'issue_detail':{'id':ISSUE,'external_id':ID,'external_source':plane.SOURCE}}]
        self.client.publish(payload(),self.state)
        self.assertEqual(self.api.posts,0);self.assertEqual(self.state.intake_record(ID),('published',ISSUE))

    def test_lost_create_response_reconciles_paginated_marker_without_second_post(self):
        self.api.lose_response=True
        with self.assertRaises(plane.PlaneError):self.client.publish(payload(),self.state)
        self.assertEqual(self.state.intake_record(ID),('creating',None))
        self.api.paginate=True
        self.client.publish(payload(),self.state)
        self.assertEqual(self.api.posts,1);self.assertEqual(self.state.intake_record(ID),('published',ISSUE))

    def test_uncertain_absent_create_is_never_repeated_automatically(self):
        self.state.intake_recorded(ID,'creating',None)
        with self.assertRaises(plane.PlaneError):self.client.publish(payload(),self.state)
        self.assertEqual(self.api.posts,0)

    def test_ignored_metadata_requires_readback_and_retries_patch_only(self):
        self.api.ignore_metadata=True
        with self.assertRaises(plane.PlaneError):self.client.publish(payload(),self.state)
        self.assertEqual(self.state.intake_record(ID),('created',ISSUE))
        self.api.ignore_metadata=False
        self.client.publish(payload(),self.state)
        self.assertEqual(self.api.posts,1)

    def test_disabled_intake_is_enabled_and_denial_never_creates_entry(self):
        self.api.enabled=False;self.client.publish(payload(),self.state)
        self.assertTrue(self.api.enabled);self.assertEqual(self.api.posts,1)
        api=MockPlane();api.enabled=False;api.enable_denied=True
        with self.assertRaises(plane.PlaneError):plane.Intake(CONFIG,'test-sink-token',api).publish(payload(),StateIsolated())
        self.assertEqual(api.posts,0)

    def test_intake_retry_survives_t3_ack_and_never_reanalyzes(self):
        self.api.unavailable=True;analyzed=[];delivered=[]
        def analyze(value):analyzed.append(value);return response()
        triage.pass_once(self.state,[report()],[],{'testers':['1.2.3']},analyze,delivered.append,NOW,intake=self.client.publish)
        self.assertEqual(len(analyzed),1);self.assertEqual(len(delivered),1)
        self.assertEqual(self.state.intake_deliveries(NOW),[ID]);self.assertTrue((Path(self.root.name)/(ID+'.json')).exists())
        self.api.unavailable=False
        triage.pass_once(self.state,[],[],{},lambda _:self.fail('reanalysis'),lambda _:self.fail('duplicate T3'),NOW+120,intake=self.client.publish)
        self.assertEqual(self.api.posts,1);self.assertEqual(self.state.intake_deliveries(NOW+120),[])
        self.assertFalse((Path(self.root.name)/(ID+'.json')).exists())

    def test_t3_retry_does_not_recreate_acknowledged_intake(self):
        def fail(_):raise OSError('webhook unavailable')
        triage.pass_once(self.state,[report()],[],{'testers':['1.2.3']},lambda _:response(),fail,NOW,intake=self.client.publish)
        self.assertEqual(self.api.posts,1);self.assertEqual(self.state.intake_deliveries(NOW),[])
        delivered=[]
        triage.pass_once(self.state,[],[],{},lambda _:self.fail('reanalysis'),delivered.append,NOW+120,intake=self.client.publish)
        self.assertEqual(len(delivered),1);self.assertEqual(self.api.posts,1)

    def test_pending_intake_spool_expires_after_24_hours_without_reanalysis(self):
        self.api.unavailable=True
        triage.pass_once(self.state,[report()],[],{'testers':['1.2.3']},lambda _:response(),lambda _:None,NOW,intake=self.client.publish)
        self.assertTrue((Path(self.root.name)/(ID+'.json')).exists())
        self.api.unavailable=False
        triage.pass_once(self.state,[],[],{},lambda _:self.fail('reanalysis'),lambda _:self.fail('duplicate T3'),NOW+86401,intake=self.client.publish)
        self.assertEqual(self.api.posts,0);self.assertEqual(self.state.intake_deliveries(NOW+86401),[])
        self.assertFalse((Path(self.root.name)/(ID+'.json')).exists())

    def test_non_testers_and_failed_analysis_never_create_model_verdict(self):
        nightly=report();nightly['channel']='nightly';nightly['context']['app_channel']='nightly'
        triage.pass_once(self.state,[nightly],[],{'nightly':['1.2.3']},lambda _:response(),lambda _:None,NOW,intake=self.client.publish)
        self.assertEqual(self.api.posts,0)
        with self.assertRaises(plane.PlaneError):self.client.publish({**payload(),'type':'triage.failed'},self.state)

    def test_legacy_sqlite_schema_upgrade_preserves_receipts(self):
        with tempfile.TemporaryDirectory() as root:
            db=sqlite3.connect(Path(root)/'state.db')
            db.execute('create table reports(id text primary key,status text,attempt int default 0,seen_at int,delivery_until int,delivered_at int)')
            db.execute('insert into reports values (?,?,?,?,?,?)',(ID,'delivered',1,NOW,NOW+86400,NOW));db.commit();db.close()
            upgraded=State(root)
            try:self.assertEqual(upgraded.db.execute('select status,intake_pending from reports where id=?',(ID,)).fetchone(),('delivered',0))
            finally:upgraded.close()

    def test_credentials_and_redirects_cannot_escape_to_another_destination(self):
        with self.assertRaises(plane.PlaneError):plane.Intake({**CONFIG,'base_url':'http://public.example'},'test-sink-token',self.api)
        self.assertIsNone(plane.NoRedirect().redirect_request(None,None,302,'',{},'https://elsewhere.invalid'))
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'token';path.write_text('test-sink-token',encoding='utf-8')
            with patch.object(plane.os,'name','posix'):
                with patch.object(Path,'lstat',return_value=type('Info',(),{'st_mode':0o100644})()):
                    with self.assertRaises(plane.PlaneError):plane.read_token(path)


class StateIsolated:
    def intake_record(self,id):return None
