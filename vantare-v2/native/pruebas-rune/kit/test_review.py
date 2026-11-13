import json
from pathlib import Path
import subprocess
import unittest
from agregar import noise_metrics
from preparar_fuentes import provenance_source, electron_provenance_source, BENCH
from normalizar import valid_control_repair


class ReviewRegressions(unittest.TestCase):
    def test_repair_eligibility_uses_control_not_candidate_winner(self):
        def block(candidate,control):
            return [dict(block=kind,role=role,midpoint_qpc=i+1+offset,
                         metrics={'cpu_cycles_s':100*(control if kind=='aa' else candidate) if role=='B' else 100})
                    for kind,offset in [('aa',0),('ab',4)] for i,role in enumerate('ABBA')]
        self.assertFalse(valid_control_repair(block(.5,1.1)))
        self.assertTrue(valid_control_repair(block(2,1)))
        self.assertTrue(valid_control_repair(block(.5,1)))
        self.assertFalse(valid_control_repair(block(1,1)[:-1]))
    def test_background_cpu_uses_round_mean_not_single_peak(self):
        rows=[]
        for tick in range(1,61):
            rows.extend([dict(qpc=str(tick*1000),counter='process_id',instance='other',value='42',status='0'),
                         dict(qpc=str(tick*1000),counter='process_cpu',instance='other',value=str(160 if tick==1 else 0),status='0')])
        result=noise_metrics(rows,set(),8,1000,1000,60000)
        self.assertTrue(result['noise_ok'])
        self.assertEqual(result['max_other_cpu_percent'],20)
        self.assertAlmostEqual(result['max_other_mean_cpu_percent'],1/3)
        for row in rows:
            if row['counter']=='process_cpu':row['value']='24'
        self.assertFalse(noise_metrics(rows,set(),8,1000,1000,60000)['noise_ok'])

    def test_electron_snapshot_stamp_uses_verified_source_without_git(self):
        source=json.loads((BENCH/'fuentes-medicion.json').read_text())['variants']['electron']['source']
        original=subprocess.check_output(['git','show',source+':vantare-v2/hub-web/scripts/measurement-build.ts'],cwd=BENCH)
        transformed=electron_provenance_source(original).decode()
        self.assertIn('VANTARE_MEASUREMENT_SOURCE_SHA',transformed)
        self.assertIn('dirty=not_applicable',transformed)
        self.assertNotIn('execFileSync',transformed)
        self.assertNotIn('git(',transformed)

    def test_mac_transfer_accepts_snapshot_stamp_without_dirty_git_assertion(self):
        import tempfile
        from unittest.mock import patch
        from COPIAR_MAC import REMOTE
        sha='a'*40
        with tempfile.TemporaryDirectory() as directory:
            home=Path(directory)
            exe=home/'target-isa-2213-rune/x86_64-pc-windows-msvc/release/vantare-inicio-rune.exe'
            exe.parent.mkdir(parents=True)
            exe.write_bytes(('sha='+sha+';dirty=not_applicable;post_draw_dwm_flush').encode())
            logs=home/'orq/vanta141/logs';logs.mkdir(parents=True)
            for stem in ['inicio-runtime-visible-01','inicio-clippy-visible-01','inicio-windows-visible-01']:
                (logs/(stem+'.log.json')).write_text(json.dumps({'source_head':sha,'exit':0}))
            preflight=REMOTE.split('with tarfile.open',1)[0].replace('__SOURCE_SHA__',repr(sha))
            with patch.object(Path,'home',return_value=home):exec(preflight,{})
            exe.write_bytes(('sha='+'b'*40+';dirty=not_applicable;post_draw_dwm_flush').encode())
            with patch.object(Path,'home',return_value=home),self.assertRaises(AssertionError):exec(preflight,{})

    def test_snapshot_stamp_needs_no_git_or_dirty_claim(self):
        source=json.loads((BENCH/'fuentes-medicion.json').read_text())['variants']['gpui']['source']
        original=subprocess.check_output(['git','show',source+':vantare-v2/native/build-support/src/lib.rs'],cwd=BENCH)
        transformed=provenance_source(original).decode()
        function=transformed.split('pub fn measurement_provenance()',1)[1].split('pub fn embed()',1)[0]
        self.assertIn('VANTARE_MEASUREMENT_SOURCE_SHA',function)
        self.assertIn('not_applicable',function)
        self.assertNotIn('measurement_git',function)
        self.assertNotIn('Command::new("git")',function)


if __name__=='__main__':unittest.main()
