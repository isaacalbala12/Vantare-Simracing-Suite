import unittest
import spike_f0_1 as spike


class ClockAlignmentTests(unittest.TestCase):
    def test_initial_and_open_pit_visits_are_not_complete_stops(self):
        rows = [{"ts": ts, "values": [value]} for ts, value in
                [(10104.66, 1), (10167.6, 0), (13513.52, 1), (13588.52, 0), (16933.28, 1)]]
        self.assertEqual(spike.event_intervals(rows, require_entry=True), [(13513.52, 13588.52)])

    def test_missing_fuel_coverage_is_not_zero_refuelling(self):
        self.assertIsNone(spike.service_metrics([], 0, 20, 20, 0.01)["delta"])
        rows = [{"index": i, "values": [10.0]} for i in range(10)]
        self.assertIsNone(spike.service_metrics(rows, 0, 20, 20, 0.01)["delta"])

    def test_recording_offset_does_not_use_last_lap_as_recording_end(self):
        # Mathematical regression with the offset measured in Algarve;
        # these four timestamps are NOT a real telemetry fixture.
        resets = [50.0, 145.3, 242.8, 339.0]
        events = [value + 10104.62 for value in resets]
        result = spike.align_lap_clocks(resets, events, 10)
        self.assertAlmostEqual(result["estimated_event_to_continuous_offset_s"], 10104.62)
        self.assertEqual(result["matched_crossings"], 4)

    def test_extra_initial_crossing_is_explicit(self):
        resets = [1.0, 50.0, 145.3, 242.8, 339.0]
        events = [value + 25.44 for value in resets[1:]]
        result = spike.align_lap_clocks(resets, events, 10)
        self.assertAlmostEqual(result["estimated_event_to_continuous_offset_s"], 25.44)
        self.assertEqual(result["ordinal_shift"], -1)

    def test_ambiguous_periodic_laps_do_not_choose_an_offset(self):
        result = spike.align_lap_clocks([0, 100, 200, 300, 400], [20, 120, 220, 320, 420], 10)
        self.assertIsNone(result["estimated_event_to_continuous_offset_s"])

    def test_missing_drifting_or_invalid_data_do_not_fall_back_to_zero(self):
        for resets, events, hz in [([], [], 10), ([0, 100], [20, 120], 10),
                                  ([0, 100, 202, 305], [20, 121, 224, 328], 10),
                                  ([0, 100, float("nan")], [20, 120, 222], 10),
                                  ([0, 100, 202], [20, 120, 222], 0)]:
            with self.subTest(resets=resets, hz=hz):
                self.assertIsNone(spike.align_lap_clocks(resets, events, hz)["estimated_event_to_continuous_offset_s"])


if __name__ == "__main__":
    unittest.main()
