import importlib.util
import pathlib
import json
import tempfile
import unittest
import math

SPEC = importlib.util.spec_from_file_location('ab', pathlib.Path(__file__).with_name('aggregate-overlay-ab.py'))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class BalancedComparisonTest(unittest.TestCase):
    def test_baab_and_abba_preserve_effect_and_cancel_quadratic_bias(self):
        effects=[]
        for labels in (('A','B','B','A'),('B','A','A','B')):
            values=[100*math.exp(.01*i*i)*(.95 if label=='B' else 1) for i,label in enumerate(labels)]
            effects.append(M.round_ratio(values,labels=labels))
        self.assertAlmostEqual(math.sqrt(effects[0]*effects[1]),.95)

    def test_t_interval_uses_round_degrees_of_freedom(self):
        result=M.log_t_interval([math.exp(-.1),math.exp(.1)])
        self.assertEqual(result['degrees_of_freedom'],1)
        self.assertAlmostEqual(result['ratio'],1)
        self.assertAlmostEqual(result['interval_95'][0],math.exp(-1.2706))
        self.assertAlmostEqual(result['interval_95'][1],math.exp(1.2706))

    def test_no_change_is_not_accepted(self):
        self.assertEqual(M.compare([1]*8,[1]*8)['verdict'],'inconclusive')
        self.assertFalse(M.compare([1]*8,[1]*8)['accepted'])
    def test_linear_log_drift_cancels(self):
        values = [100 * 1.03 ** i for i in range(4)]
        self.assertAlmostEqual(M.round_ratio(values), 1)

    def test_engine_effect_survives_drift(self):
        values = [100 * 1.03 ** i * (0.95 if i in (1, 2) else 1) for i in range(4)]
        self.assertAlmostEqual(M.round_ratio(values), 0.95)

    def test_unequal_run_spacing_compensates_log_drift(self):
        times=[0,1,4,8]
        values=[100*1.03**time for time in times]
        self.assertAlmostEqual(M.round_ratio(values,times),1)

    def test_incomplete_or_nonpositive_round_rejected(self):
        for values in ([1, 2, 3], [1, 0, 2, 3]):
            with self.assertRaises(ValueError):
                M.round_ratio(values)

    def test_noise_floor_blocks_small_claim(self):
        result = M.compare([1.04, 0.96] * 4, [0.98] * 8)
        self.assertEqual(result['verdict'],'invalid_noise')
        self.assertFalse(result['accepted'])

    def test_campaign_rejects_mixed_collectors_and_changed_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            order=[]
            (root/'ab-plan.json').write_text(json.dumps(dict(protocol=3,primary_metric=M.PRIMARY,rounds=8,study='engine',role='primary',config=dict(a_hash='A',b_hash='B',core_hash='core',recording_hash='recording',widgets=22,phases=False,stress=False,quiet=False))))
            observation=0
            for number in range(1,9):
                experiments=('aa','ab') if number%2 else ('ab','aa')
                pattern=('A','B','B','A') if number%2 else ('B','A','A','B')
                for experiment in experiments:
                    for slot,label in enumerate(pattern):
                        name=f'{experiment}-{number}-{slot}'
                        folder=root/name
                        folder.mkdir()
                        (folder/'complete.txt').write_text('ok')
                        digest='A' if experiment=='aa' else label
                        run=dict(metadata=dict(collector_sha='collector',core_sha256='core',
                            recording_sha256='recording',profile='release',measurement_version=3,widgets=22,phases=False,
                            qpc_frequency=1000,executable_sha256=digest),
                            stable_qpc=[observation*10000,observation*10000+9000],
                            ui=dict(cycles_per_second=100 if digest=='A' else 95))
                        (folder/'summary.json').write_text(json.dumps(run))
                        # Deliberately useless pre-queue wall time: analysis must use QPC.
                        order.append(dict(experiment=experiment,round=number,slot=slot,label=label,directory=name,started='not-a-timestamp'))
                        observation+=1
            (root/'ab-order.json').write_text(json.dumps(order))
            result=M.aggregate(root)
            self.assertAlmostEqual(result['ab']['median'],0.95)
            self.assertTrue(result['noise_gate_passed'])
            self.assertTrue(result['accepted'])
            self.assertEqual(result['verdict'],'improvement')
            self.assertEqual(result['inference']['degrees_of_freedom'],7)
            path=root/'ab-8-3'/'summary.json'
            run=json.loads(path.read_text())
            run['metadata']['collector_sha']='different'
            path.write_text(json.dumps(run))
            with self.assertRaisesRegex(ValueError,'mixed collector'):
                M.aggregate(root)
            run['metadata']['collector_sha']='collector'
            run['metadata']['executable_sha256']='A'
            path.write_text(json.dumps(run))
            with self.assertRaisesRegex(ValueError,'binary changed|predeclared artifact'):
                M.aggregate(root)


if __name__ == '__main__':
    unittest.main()
