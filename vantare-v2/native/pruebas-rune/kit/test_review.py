import json
from pathlib import Path
import subprocess
import unittest
from agregar import noise_metrics
from preparar_fuentes import provenance_source, BENCH
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
