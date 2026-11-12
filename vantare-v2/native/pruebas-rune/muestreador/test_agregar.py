import unittest
from agregar import frame_metrics, presentmon, process_metrics


HEADER = 'ProcessID,SwapChainAddress,CPUStartQPC,MsCPUBusy,DisplayLatency,DisplayedTime,MsBetweenPresents\n'


class AggregationTests(unittest.TestCase):
    def test_qpc_and_millisecond_durations_are_not_mixed(self):
        rows = presentmon(HEADER + '42,0x1,1000000,2,7,16.667,16.667\n', {42}, 1000000, 0, 2000000)
        self.assertEqual(rows[0]['submit_qpc'], 1002000)
        self.assertEqual(rows[0]['display_qpc'], 1007000)
        self.assertAlmostEqual(frame_metrics(rows)['frame_p99_ms'], 16.667)

    def test_discarded_frame_has_no_invented_display_time(self):
        rows = presentmon(HEADER + '42,0x1,1000,2,NA,NA,16\n', {42}, 1000, 0, 2000)
        self.assertIsNone(rows[0]['display_qpc'])
        self.assertEqual(frame_metrics(rows)['dropped_frames'], 1)

    def test_other_process_does_not_enter_the_measurement(self):
        rows = presentmon(HEADER + '42,0x1,1000,1,4,16,16\n99,0x2,1010,1,4,16,1\n', {42}, 1000, 0, 2000)
        self.assertEqual(len(rows), 1)

    def test_different_chains_are_not_combined_into_fake_fps(self):
        rows = presentmon(HEADER + '42,0x1,1000,1,4,16,16\n42,0x2,1008,1,4,16,16\n', {42}, 1000, 0, 2000)
        with self.assertRaises(ValueError):
            frame_metrics(rows)
        self.assertEqual(frame_metrics(rows, expected_windows=2)['frame_p50_ms'], 16)

    def test_missing_clock_invalid_float_and_duplicate_frames_fail_closed(self):
        for text in (HEADER.replace('CPUStartQPC', 'CPUStartTime') + '42,0x1,1000,1,4,16,16\n',
                     HEADER + '42,0x1,1000,nan,4,16,16\n',
                     HEADER + '42,0x1,1000,1,4,16,16\n' * 2):
            with self.assertRaises(ValueError):
                presentmon(text, {42}, 1000, 0, 2000)

    def samples(self):
        return [{'qpc': clock, 'process_id': pid, 'created_utc': 'fixed-' + str(pid),
                 'cpu_cycles': 1000 + index * rate, 'cpu_time_100ns': index * 1000000,
                 'private_bytes': memory * 2**20, 'working_set_bytes': memory * 2**20}
                for index, clock in enumerate((0, 1000, 2000)) for pid, rate, memory in ((42, 100, 20), (43, 50, 10))]

    def test_family_is_summed_per_sample_and_cycles_use_elapsed_time(self):
        result = process_metrics(self.samples(), 42, 1000, 0, 2000)
        self.assertEqual(result['cpu_cycles_s'], 150)
        self.assertEqual(result['private_mib'], 30)
        self.assertEqual(result['family_processes'], 2)

    def test_process_reuse_missing_family_member_and_counter_reset_are_invalid(self):
        for mutation in ('identity', 'missing', 'reset'):
            rows = self.samples()
            if mutation == 'identity': rows[-1]['created_utc'] = 'reused'
            if mutation == 'missing': rows.pop()
            if mutation == 'reset': rows[-1]['cpu_cycles'] = 1
            with self.assertRaises(ValueError):
                process_metrics(rows, 42, 1000, 0, 2000)


if __name__ == '__main__':
    unittest.main()
