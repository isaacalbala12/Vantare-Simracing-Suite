import unittest
from resumir_aguante import memory_drift


def rows(growth=0):
    return [dict(qpc=t, process_id=7, created_utc="identity", private_bytes=1000000 + int(growth * t / 14400)) for t in range(0, 14401, 10)]


class StabilityTests(unittest.TestCase):
    def test_stable_and_increasing_private_memory(self):
        stable = memory_drift(rows(), 1, 0, 14400, 7)
        self.assertEqual(stable["memory_drift_fraction"], 0)
        growing = memory_drift(rows(200000), 1, 0, 14400, 7)
        self.assertGreater(growing["memory_drift_fraction"], .05)

    def test_gaps_missing_root_and_pid_reuse_are_rejected(self):
        cases = [rows()[10:], [r for r in rows() if not 5000 <= r["qpc"] <= 5100]]
        reused = rows()
        reused[-1]["created_utc"] = "reused"
        cases.append(reused)
        for data in cases:
            with self.subTest(data=data[-1]), self.assertRaises(ValueError):
                memory_drift(data, 1, 0, 14400, 7)
        with self.assertRaises(ValueError):
            memory_drift(rows(), 1, 0, 14400, 99)


if __name__ == "__main__":
    unittest.main()
