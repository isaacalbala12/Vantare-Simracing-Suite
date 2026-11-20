import csv
import json
import tempfile
import unittest
from pathlib import Path
from summarize import frames, percentile, resources, summarize


class SummaryTests(unittest.TestCase):
    def test_percentiles_and_fps_use_intervals_not_mean_instantaneous_fps(self):
        self.assertEqual(percentile([10, 20], .99), 19.9)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'frames.csv'
            with path.open('w', newline='') as stream:
                writer = csv.writer(stream)
                writer.writerow(['SwapChainAddress', 'MsBetweenPresents'])
                writer.writerows([['a', 9999]] + [['a', 10], ['a', 30]] * 100 + [['b', 1]] * 20)
            result = frames(path)
            self.assertEqual(result['fps'], 50)
            self.assertEqual(result['frames'], 200)
            self.assertEqual(result['frametime_p99_ms'], 30)

    def test_resource_sum_uses_all_overlay_processes_and_flags_builds(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'resources.csv'
            with path.open('w', newline='') as stream:
                writer = csv.writer(stream)
                writer.writerow(['seconds', 'name', 'cpu_percent', 'working_set_bytes',
                                 'system_cpu_percent', 'system_used_bytes'])
                writer.writerows([[1, 'vantare-core', 3, 1048576, 70, 100*1048576],
                                  [1, 'vantare-overlays', 7, 2*1048576, 70, 100*1048576],
                                  [1, 'rustc', 40, 20*1048576, 70, 100*1048576]])
            result = resources(path, ['vantare'])
            self.assertEqual(result['overlay_cpu_percent'], 10)
            self.assertEqual(result['overlay_working_set_mib'], 3)
            self.assertEqual(result['background_build_processes'], ['rustc'])

    def test_calibration_cannot_be_accepted_as_a_comparative_run(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            with (folder / 'frames.csv').open('w', newline='') as stream:
                writer = csv.writer(stream)
                writer.writerow(['SwapChainAddress', 'msBetweenPresents'])
                writer.writerows([['a', 1000]] * 181)
            with (folder / 'resources.csv').open('w', newline='') as stream:
                writer = csv.writer(stream)
                writer.writerow(['seconds', 'name', 'cpu_percent', 'working_set_bytes',
                                 'system_cpu_percent', 'system_used_bytes'])
                writer.writerow([1, 'Le Mans Ultimate', 5, 1048576, 10, 10485760])
            metadata = {'scenario': 'Base', 'seconds': 180}
            (folder / 'run.json').write_text(json.dumps(metadata))
            self.assertTrue(summarize(folder)['valid'])
            metadata['purpose'] = 'calibration'
            (folder / 'run.json').write_text(json.dumps(metadata))
            self.assertFalse(summarize(folder)['valid'])


if __name__ == '__main__':
    unittest.main()
