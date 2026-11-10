import importlib.util
import pathlib
import json
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('ab', pathlib.Path(__file__).with_name('aggregate-overlay-ab.py'))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class BalancedComparisonTest(unittest.TestCase):
    def test_linear_log_drift_cancels(self):
        values = [100 * 1.03 ** i for i in range(4)]
        self.assertAlmostEqual(M.round_ratio(values), 1)

    def test_engine_effect_survives_drift(self):
        values = [100 * 1.03 ** i * (0.95 if i in (1, 2) else 1) for i in range(4)]
        self.assertAlmostEqual(M.round_ratio(values), 0.95)

    def test_incomplete_or_nonpositive_round_rejected(self):
        for values in ([1, 2, 3], [1, 0, 2, 3]):
            with self.assertRaises(ValueError):
                M.round_ratio(values)

    def test_noise_floor_blocks_small_claim(self):
        result = M.compare([1.04, 0.96] * 4, [0.98] * 8)
        self.assertFalse(result['separates_from_noise'])

    def test_campaign_rejects_mixed_collectors_and_changed_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            order=[]
            for experiment in ('aa','ab'):
                for number in range(8):
                    for slot in range(4):
                        label='A' if slot in (0,3) else 'B'
                        name=f'{experiment}-{number}-{slot}'
                        folder=root/name
                        folder.mkdir()
                        (folder/'complete.txt').write_text('ok')
                        digest='A' if experiment=='aa' else label
                        run=dict(metadata=dict(collector_sha='collector',core_sha256='core',
                            recording_sha256='recording',profile='release',widgets=4,phases=False,
                            executable_sha256=digest),ui=dict(cycles_per_second=100 if digest=='A' else 95))
                        (folder/'summary.json').write_text(json.dumps(run))
                        order.append(dict(experiment=experiment,round=number,slot=slot,label=label,directory=name))
            (root/'ab-order.json').write_text(json.dumps(order))
            result=M.aggregate(root)
            self.assertAlmostEqual(result['ab']['median'],0.95)
            self.assertTrue(result['noise_gate_passed'])
            self.assertFalse(result['acceptance_gates']['accepted'])
            path=root/'ab-7-3'/'summary.json'
            run=json.loads(path.read_text())
            run['metadata']['collector_sha']='different'
            path.write_text(json.dumps(run))
            with self.assertRaisesRegex(ValueError,'mixed collector'):
                M.aggregate(root)
            run['metadata']['collector_sha']='collector'
            run['metadata']['executable_sha256']='B'
            path.write_text(json.dumps(run))
            with self.assertRaisesRegex(ValueError,'binary changed'):
                M.aggregate(root)


if __name__ == '__main__':
    unittest.main()
