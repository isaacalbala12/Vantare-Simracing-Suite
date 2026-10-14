"""Round 2 startup regressions. Temporary SQLite, synthetic credentials, no network."""
import io
import json
from contextlib import redirect_stdout
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import plane_intake
from state import State
import triage
from test_plane_intake import CONFIG, MockPlane
from test_triage import report, response, NOW


class Tests(unittest.TestCase):
    def test_review_r2_f2_plane_initialization_failure_preserves_t3_purge_and_retry(self):
        for failure in (FileNotFoundError('fixture-private-path'), PermissionError('fixture-private-path'),
                        plane_intake.PlaneError('restricted_credential_required'),
                        plane_intake.PlaneError('invalid_credential'), 'empty', 'public_mode', 'interrupted'):
            with self.subTest(failure=type(failure).__name__),tempfile.TemporaryDirectory() as root:
                root=Path(root);state=State(root/'state');r=report();sent=[];polls=[]
                def offline(*_):raise OSError('fixture offline')
                triage.pass_once(state,[r],[],{},lambda _:response(),offline,NOW,intake=offline)
                expired=dict(r,id='15940000-0000-0000-0000-000000000011')
                state.discover(expired,NOW)
                state.analyzed(expired['id'],{'delivery_id':expired['id']},NOW-86401,intake=True)
                original=state.payload(r['id']);state.close()
                credentials=root/'credentials';credentials.mkdir()
                (credentials/'t3-hmac').write_bytes(b'fixture-hmac')
                if failure in ('empty','public_mode'):
                    token=credentials/'plane-token'
                    token.write_text('' if failure=='empty' else 'test-sink-token',encoding='utf-8')
                    token.chmod(0o600 if failure=='empty' else 0o644)
                if failure=='interrupted':
                    state=State(root/'state')
                    state.db.execute("update reports set status='analyzing',attempt=3,intake_pending=0 where id=?",(r['id'],))
                    state.db.commit();state.close()
                config={'state_dir':str(root/'state'),'known_versions':{},'provider':{},
                        'webhook_url':'https://fixture.invalid','plane_intake':{**CONFIG,'enabled':True}}
                api=MockPlane();client=plane_intake.Intake(CONFIG,'test-sink-token',api)
                logs=io.StringIO()
                with patch('socket.socket',side_effect=AssertionError('network forbidden')), \
                     patch.object(triage,'load_config',return_value=config), \
                     patch.object(triage,'read_reports',side_effect=lambda *_:(polls.append('poll') or ([],[]))), \
                     patch.object(triage,'deliver',side_effect=lambda payload,*_:sent.append(payload)), \
                     patch.object(triage.model,'run',side_effect=AssertionError('unexpected model')), \
                     patch.dict(triage.os.environ,{'CREDENTIALS_DIRECTORY':str(credentials)}), \
                     patch.dict('sys.modules',{'fcntl':SimpleNamespace(flock=lambda *args:None,LOCK_EX=1,LOCK_NB=2)}), \
                     patch('sys.argv',['triage','--config','fixture']), \
                     patch.object(triage.time,'time',return_value=NOW+120), redirect_stdout(logs):
                    # Missing fixture file exercises the real reader; other cases
                    # reproduce permission/validation failures without real secrets.
                    if isinstance(failure,(str,FileNotFoundError)):
                        self.assertEqual(triage.main(),0)
                    else:
                        with patch.object(plane_intake,'read_token',side_effect=failure):
                            self.assertEqual(triage.main(),0)
                    self.assertEqual(sent,[original]);self.assertEqual(polls,['poll'])
                    self.assertFalse((root/'state'/(expired['id']+'.json')).exists())
                    state=State(root/'state')
                    try:
                        self.assertEqual(state.payload(r['id']),original)
                        row=state.db.execute('select status,intake_pending from reports where id=?',(r['id'],)).fetchone()
                        self.assertEqual(row,('delivered',1))
                    finally:state.close()
                    # Next timer invocation retries initialization and ONLY Plane.
                    with patch.object(plane_intake,'read_token',return_value='test-sink-token'), \
                         patch.object(plane_intake,'Intake',return_value=client):
                        self.assertEqual(triage.main(),0)
                    self.assertEqual(sent,[original]);self.assertEqual(api.posts,1)
                    self.assertFalse((root/'state'/(r['id']+'.json')).exists())
                self.assertNotIn('fixture-private-path',logs.getvalue())
                self.assertNotIn('test-sink-token',logs.getvalue())
                self.assertIn('intake_pending',logs.getvalue())

    def test_review_r2_f2_unit_plane_credential_is_optional(self):
        unit=Path(__file__).with_name('vantare-triage.service').read_text(encoding='utf-8')
        loads=[line for line in unit.splitlines() if line.startswith('LoadCredential=plane-token')]
        self.assertEqual(loads,['LoadCredential=plane-token:vantare-triage.plane-token'])
        self.assertIn('LoadCredential=t3-hmac:/etc/vantare-triage/credentials/t3-hmac',unit)
