import unittest

from cruce_rune import cross_encoded


def source():
    return [{"phase": "origin", "qpc": 100, "epoch": 7, "sequence": 1}]


def encoded(times=(110, 130, 160)):
    return [{"phase": "encoded", "qpc": value, "epoch": 7, "sequence": 1,
             "window": 1} for value in times]


def present(submit, display, chain="one"):
    return {"submit_qpc": submit, "display_qpc": display, "chain": chain}


class CrossingTests(unittest.TestCase):
    def test_only_first_display_of_repeated_photo_counts_as_latency(self):
        result = cross_encoded(source(), encoded(), [present(120, 140), present(150, 170)],
                               1000, 105, 155)
        self.assertEqual(len(result["frames"]), 2)
        self.assertEqual([row["latency_ms"] for row in result["first_display"]], [40])

    def test_dropped_first_frame_does_not_get_a_display_time(self):
        result = cross_encoded(source(), encoded(), [present(120, None), present(150, 170)],
                               1000, 105, 155)
        self.assertIsNone(result["frames"][0]["latency_ms"])
        self.assertEqual(result["first_display"][0]["latency_ms"], 70)

    def test_missing_or_ambiguous_present_is_rejected(self):
        for rows in ([present(150, 170)],
                     [present(115, 135), present(120, 140), present(150, 170)]):
            with self.assertRaises(ValueError):
                cross_encoded(source(), encoded(), rows, 1000, 105, 155)

    def test_two_chains_cannot_be_combined_into_one_window(self):
        with self.assertRaises(ValueError):
            cross_encoded(source(), encoded(), [present(120, 140), present(150, 170, "two")],
                          1000, 105, 155)

    def test_truncated_trace_and_reversed_clocks_are_rejected(self):
        for stamps, rows in ((encoded((110, 130)), [present(120, 140), present(150, 170)]),
                             (encoded(), [present(120, 119), present(150, 170)])):
            with self.assertRaises(ValueError):
                cross_encoded(source(), stamps, rows, 1000, 105, 155)

    def test_warmup_photo_is_not_assigned_a_foreign_origin(self):
        stamps = encoded((90, 110, 130, 160))
        stamps[0]["epoch"] = 6
        result = cross_encoded(source(), stamps,
                               [present(95, 105), present(120, 140), present(150, 170)],
                               1000, 85, 155)
        self.assertEqual(len(result["frames"]), 2)
        self.assertTrue(all(row["epoch"] == 7 for row in result["frames"]))


if __name__ == "__main__":
    unittest.main()
