import importlib.util
import json
import pathlib
import tempfile
import unittest

SPEC=importlib.util.spec_from_file_location('campaign',pathlib.Path(__file__).with_name('aggregate-overlay-campaign.py'))
M=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class CampaignTest(unittest.TestCase):
    def test_insufficient_repetitions_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError,'five|>=5'):
                M.aggregate(pathlib.Path(directory))

    def test_median_and_range_are_per_run_not_per_present(self):
        import contextlib
        import io
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            for widgets in (1,4,22):
                for phases in (False,True):
                    for n in range(5):
                        path=root/f'round-{n}-w{widgets}-p{phases}'
                        path.mkdir()
                        (path/'complete.txt').write_text('complete')
                        run=dict(metadata=dict(profile='release',measurement_version=2,executable_sha256='a',recording_sha256='b',widgets=widgets,phases=phases))
                        for process in ('ui','dwm'):
                            run[process]=dict(cycles_per_second=n+1,cycles_per_received_photo=10*(n+1),mean_private_mib=20,mean_working_set_mib=10)
                        run['gpu']={p:dict(mean_busiest_engine_percent=1,mean_engine_sum_percent=1,peak_dedicated_mib=2) for p in ('ui','dwm')}
                        for key in ('present_interval_p99_ms','receive_to_paint_p99_ms','receive_to_submit_p99_ms'):
                            run[key]=n+1
                        (path/'summary.json').write_text(json.dumps(run))
            with contextlib.redirect_stdout(io.StringIO()):
                result=M.aggregate(root)
            value=result['widgets=22,phases=True']['metrics']['ui.cycles_per_second']
            self.assertEqual(value,dict(median=3,minimum=1,maximum=5))


if __name__=='__main__':
    unittest.main()
