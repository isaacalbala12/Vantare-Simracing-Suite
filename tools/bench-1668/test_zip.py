import csv
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from analyze_zip import analyze, extract

ORDER = ['Base', 'Vantare', 'RaceLab', 'TinyPedal', 'TinyPedal', 'RaceLab',
         'Vantare', 'Base', 'RaceLab', 'Base', 'TinyPedal', 'Vantare']


def fixture(directory, skip_race=False):
    root = Path(directory) / 'synthetic-test'
    root.mkdir()
    (root / 'campaign.json').write_text(json.dumps(dict(schema=1, order=ORDER, seconds=180,
                                                    mode='SYNTHETIC TEST ONLY', track='TEST')))
    for position, scenario in enumerate(ORDER, 1):
        folder = root / f'{position:02}-{scenario}'
        folder.mkdir()
        meta = dict(scenario=scenario, position=position, seconds=180, status='complete')
        if skip_race and scenario == 'RaceLab':
            meta.update(status='skipped', reason='test unavailable')
        (folder / 'run.json').write_text(json.dumps(meta))
        if meta['status'] == 'skipped':
            continue
        with (folder / 'frames.csv').open('w', newline='') as stream:
            writer = csv.writer(stream)
            writer.writerow(['SwapChainAddress', 'msBetweenPresents'])
            writer.writerows([['a', 1000]] * 181)
        with (folder / 'resources.csv').open('w', newline='') as stream:
            writer = csv.writer(stream)
            writer.writerow(['seconds', 'name', 'cpu_percent', 'working_set_bytes',
                             'system_cpu_percent', 'system_used_bytes', 'game_present',
                             'foreground_pid', 'pid'])
            writer.writerow([1, 'Le Mans Ultimate', 10, 1048576, 20, 10485760, 'True', 42, 42])
            overlay = {'Vantare': 'vantare-overlays', 'RaceLab': 'RacelabApps', 'TinyPedal': 'tinypedal'}.get(scenario)
            if overlay:
                writer.writerow([1, overlay, 5, 1048576, 20, 10485760, 'True', 42, 43])
    archive = Path(directory) / 'test.zip'
    with zipfile.ZipFile(archive, 'w') as target:
        for file in root.rglob('*'):
            if file.is_file():
                target.write(file, file.relative_to(root))
    return archive


class ZipTests(unittest.TestCase):
    def test_complete_campaign_is_recomputed_from_raw_csv(self):
        with tempfile.TemporaryDirectory() as directory:
            runs = analyze(fixture(directory), Path(directory) / 'report')
            self.assertEqual(sum(run['valid'] for run in runs), 12)
            self.assertEqual(runs[1]['overlay_cpu_percent'], 5)

    def test_unavailable_racelab_stays_missing_not_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            runs = analyze(fixture(directory, skip_race=True), Path(directory) / 'report')
            race = [run for run in runs if run['scenario'] == 'RaceLab']
            self.assertEqual(len(race), 3)
            self.assertTrue(all(not run['valid'] and 'fps' not in run for run in race))
            self.assertIn('PARCIAL', (Path(directory) / 'report/RESULTADOS.md').read_text(encoding='utf-8'))

    def test_zip_cannot_write_outside_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'bad.zip'
            with zipfile.ZipFile(archive, 'w') as target:
                target.writestr('../outside.json', '{}')
            with self.assertRaises(ValueError):
                extract(archive, Path(directory) / 'extract')
            self.assertFalse((Path(directory) / 'outside.json').exists())


if __name__ == '__main__':
    unittest.main()
