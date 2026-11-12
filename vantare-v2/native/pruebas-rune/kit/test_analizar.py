import copy
import unittest

from analizar import CHECKLIST, METRICS, PRIMARY, InvalidEvidence, block_ratio, compare, evaluate, interval


BASE = dict(zip(METRICS, [100, 80, 64, 2, 10, 0, 10, 10, .5, 100, 10]))


def campaign(candidate="rune", ratio=1.05):
    hashes = {"gpui": "a" * 64, "rune": "b" * 64, "gpui_fast": "c" * 64}
    rounds = []
    for index in range(1, 9):
        order = "ABBA" if index % 2 else "BAAB"
        rowsets = {}
        blocks = ("aa", "ab") if index % 2 else ("ab", "aa")
        for block_index, block in enumerate(blocks):
            rows = []
            for offset, role in enumerate(order):
                variant = "gpui" if block == "aa" or role == "A" else candidate
                metrics = dict(BASE)
                metrics["cpu_cycles_s"] *= ratio if variant == candidate else 1
                rows.append({"id": f"{candidate}-{index}-{block}-{offset}", "role": role,
                             "variant": variant, "binary_sha256": hashes[variant],
                             "midpoint_qpc": index * 100_000 + block_index * 10_000 + offset * 1000,
                             "valid": True, "telemetry_complete": True, "duration_s": 60,
                             "warmup_s": 10, "noise_ok": True, "environment_ok": True,
                             "trace_overflow": 0, "trace_complete": True, "metrics": metrics})
            rowsets[block] = rows
        rounds.append({"id": index, **rowsets})
    endurance = {"complete": True, "duration_s": 14400, "crashes": 0, "bugchecks": 0,
                 "monitor_sleep_resume": True, "hide_show": True, "resolution_change": True,
                 "minidump_enabled": True, "memory_drift_fraction": .01}
    return {"schema": 1, "configuration": dict(PRIMARY), "binaries": hashes,
            "comparisons": {candidate: {"rounds": rounds, "manual": dict.fromkeys(CHECKLIST, True),
                                        "endurance": endurance}}}


def candidate_metrics(document, field, value, candidate="rune"):
    for round_ in document["comparisons"][candidate]["rounds"]:
        for row in round_["ab"]:
            if row["role"] == "B":
                row["metrics"][field] = value


class ThresholdTests(unittest.TestCase):
    def test_complete_campaign_passes_without_adopting_a_technology(self):
        result = evaluate(campaign())
        self.assertEqual(result["overlays"]["rune"]["verdict"], "cumple_umbrales")
        self.assertFalse(result["adopted"])

    def test_memory_exception_requires_discussion_and_is_strictly_below_fifteen_percent(self):
        data = campaign()
        candidate_metrics(data, "private_mib", 114.9)
        self.assertEqual(evaluate(data)["overlays"]["rune"]["verdict"], "consultar_isaac_solo_memoria")
        candidate_metrics(data, "private_mib", 115)
        self.assertEqual(evaluate(data)["overlays"]["rune"]["verdict"], "no_adoptar")

    def test_a_crash_is_rejection_even_when_a_manual_check_is_pending(self):
        data = campaign()
        data["comparisons"]["rune"]["endurance"]["crashes"] = 1
        del data["comparisons"]["rune"]["manual"]["obs_transparency"]
        self.assertEqual(evaluate(data)["overlays"]["rune"]["verdict"], "no_adoptar")

    def test_observed_manual_failure_is_not_reported_as_a_pending_check(self):
        data = campaign()
        data["comparisons"]["rune"]["manual"]["click_through"] = False
        self.assertEqual(evaluate(data)["overlays"]["rune"]["verdict"], "no_adoptar")

    def test_missing_manual_check_keeps_verdict_pending(self):
        data = campaign()
        del data["comparisons"]["rune"]["manual"]["exclude_from_capture"]
        self.assertEqual(evaluate(data)["overlays"]["rune"]["verdict"], "pendiente_validacion_fisica")

    def test_loss_missing_counter_and_mixed_binaries_invalidate_evidence(self):
        for mutation in (
            lambda row: row.update(telemetry_complete=False),
            lambda row: row["metrics"].pop("vram_mib"),
            lambda row: row.update(binary_sha256="d" * 64),
        ):
            data = campaign()
            mutation(data["comparisons"]["rune"]["rounds"][0]["ab"][1])
            with self.assertRaises(InvalidEvidence):
                evaluate(data)

    def test_reused_rounds_and_observations_are_rejected(self):
        data = campaign()
        data["comparisons"]["rune"]["rounds"][1] = copy.deepcopy(data["comparisons"]["rune"]["rounds"][0])
        with self.assertRaises(InvalidEvidence):
            evaluate(data)

    def test_aa_noise_cannot_be_relaxed_by_a_large_ab_gain(self):
        data = campaign(ratio=.5)
        for round_ in data["comparisons"]["rune"]["rounds"]:
            for row in round_["aa"]:
                if row["role"] == "B":
                    row["metrics"]["cpu_cycles_s"] *= 1.026
        self.assertEqual(evaluate(data)["overlays"]["rune"]["verdict"], "invalido_ruido")

    def test_fast_needs_ten_percent_cpu_and_no_other_regression(self):
        self.assertEqual(evaluate(campaign("gpui_fast", .85))["overlays"]["gpui_fast"]["verdict"], "cumple_umbrales")
        data = campaign("gpui_fast", .91)
        self.assertEqual(evaluate(data)["overlays"]["gpui_fast"]["verdict"], "no_adoptar")
        data = campaign("gpui_fast", .85)
        candidate_metrics(data, "visible_s", .51, "gpui_fast")
        self.assertEqual(evaluate(data)["overlays"]["gpui_fast"]["verdict"], "no_adoptar")

    def test_boundary_limits_are_not_rounded_before_comparison(self):
        values = dict(BASE, cpu_cycles_s=110, private_mib=100, vram_mib=96, gpu_percent=3,
                      frame_p99_ms=1000/60, latency_p95_ms=10+1000/60, load_p99_ms=10.3,
                      visible_s=.75)
        self.assertTrue(all(row["pass"] for row in compare(BASE, values, "rune").values()))
        values["private_mib"] += .0001
        self.assertFalse(compare(BASE, values, "rune")["private_mib"]["pass"])

    def test_block_removes_linear_time_drift(self):
        rows = [{"role": role, "midpoint_qpc": i+1, "metrics": {"cpu_cycles_s":
                 __import__("math").exp(.1*i) * (1.2 if role == "B" else 1)}} for i, role in enumerate("ABBA")]
        self.assertAlmostEqual(block_ratio(rows, "cpu_cycles_s"), 1.2)
        self.assertEqual(interval([1] * 8)["ci95"], [1, 1])

    def test_electron_only_reopens_discussion_for_its_own_limits(self):
        data = campaign()
        data["hub"] = {"electron": {"interactive_median_s": 3, "private_family_median_mib": 600,
                                     "cold_starts": 10, "warm_starts": 10, "interaction_rounds": 5}}
        self.assertEqual(evaluate(data)["hub"], "mantener_Electron")
        data["hub"]["electron"]["private_family_median_mib"] = 601
        self.assertEqual(evaluate(data)["hub"], "revisar_ADR_0107_con_Isaac")


if __name__ == "__main__":
    unittest.main()
