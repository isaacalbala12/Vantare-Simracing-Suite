import unittest

from latencia import complete_replay, cross_display, read_trace


class LatencyTests(unittest.TestCase):
    def test_replay_rejects_loss_duplicates_and_missing_footer(self):
        text = "# latency-v1,frequency=10000000,overflow=0\nphase,qpc,epoch,sequence,window\norigin,100,1,1,0\norigin,200,1,2,0\n# end,rows=2\n"
        hz, rows = read_trace(text)
        self.assertEqual(hz, 10_000_000)
        rows += [dict(row,phase="sent") for row in rows]
        received = [dict(row, phase="received") for row in rows if row["phase"]=="sent"]
        self.assertEqual(complete_replay(rows, received), 2)
        for bad in (received[:1], received + received[:1], list(reversed(received))):
            with self.assertRaises(ValueError):
                complete_replay(rows, bad)
        for bad in (text.replace("overflow=0", "overflow=1"), text.replace("# end,rows=2\n", "")):
            with self.assertRaises(ValueError):
                read_trace(bad)

    def test_product_cadence_is_not_misreported_as_pipe_loss(self):
        origin = [{"phase":"origin","epoch":1,"sequence":sequence,"qpc":sequence*100} for sequence in (1,2,3)]
        sent = [dict(origin[index],phase="sent") for index in (0,2)]
        received = [dict(row,phase="received") for row in sent]
        self.assertEqual(complete_replay(origin+sent,received),2)
        with self.assertRaises(ValueError):
            complete_replay(origin+sent,received[:1])

    def test_display_time_is_used_instead_of_submit_time(self):
        origin = [{"phase": "origin", "epoch": 1, "sequence": 7, "qpc": 1_000}]
        submission = [{"epoch": 1, "sequence": 7, "qpc": 1_200, "window": 9}]
        presents = [{"submit_qpc": 1_201, "display_qpc": 1_500, "chain": "0x1"}]
        result = cross_display(origin, submission, presents, 10_000)
        self.assertEqual(result[0]["latency_ms"], 50)
        self.assertEqual(result[0]["chain"], "0x1")

    def test_ambiguous_and_dropped_frames_do_not_create_a_latency(self):
        origin = [{"phase": "origin", "epoch": 1, "sequence": 7, "qpc": 1_000}]
        submission = [{"epoch": 1, "sequence": 7, "qpc": 1_200, "window": 9}]
        for presents in ([{"submit_qpc": 1_200, "display_qpc": None, "chain": "1"}],
                         [{"submit_qpc": 1_200, "display_qpc": 1_500, "chain": "1"},
                          {"submit_qpc": 1_200, "display_qpc": 1_500, "chain": "2"}]):
            with self.assertRaises(ValueError):
                cross_display(origin, submission, presents, 10_000)


if __name__ == "__main__":
    unittest.main()
