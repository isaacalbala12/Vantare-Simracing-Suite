"""Transport and evaluator regressions; no model/GPU, no timed performance assertions."""
import argparse
import io
import json
import threading
import unittest

import bench
from cases import build_cases
from mock_server import make_server


class EvaluatorTests(unittest.TestCase):
    def test_oracles_and_negative_answers(self):
        for case in build_cases():
            gold = case["gold"]
            if case["kind"] == "tool":
                calls = [{"function": {"name": gold["name"],
                                       "arguments": json.dumps(gold["arguments"])}}]
                self.assertTrue(bench.score(case, "", calls)["automatic_pass"])
                calls[0]["function"]["name"] = "confirm_pit"
                self.assertFalse(bench.score(case, "", calls)["automatic_pass"])
            else:
                text = gold if isinstance(gold, str) else json.dumps(gold, ensure_ascii=False)
                self.assertTrue(bench.score(case, text, [])["automatic_pass"], case["id"])
                self.assertFalse(bench.score(case, text + " invented 42", [])["automatic_pass"])

    def test_json_extra_keys_booleans_duplicates_nonfinite_and_wrong_numbers(self):
        case = next(c for c in build_cases() if c["id"] == "fuel-finish-es")
        for text in ('{"required_l":true}', '{"required_l":NaN}',
                     '{"required_l":30.8,"required_l":30.8}',
                     '{"required_l":30.8,"deficit_l":7.4,"consumption_l_per_lap":2.8,"invented":0}',
                     '{"required_l":31,"deficit_l":7.4,"consumption_l_per_lap":2.8}'):
            self.assertFalse(bench.score(case, text, [])["automatic_pass"])

    def test_language_and_missing_data(self):
        cases = {c["id"]: c for c in build_cases()}
        self.assertFalse(bench.score(cases["lmu-fuel-es"], cases["lmu-fuel-en"]["gold"], [])["automatic_pass"])
        self.assertFalse(bench.score(cases["stale-en"], '{"status":"live","fuel_l":1}', [])["automatic_pass"])

    def test_independent_arithmetic_expectations_and_provenance(self):
        cases = {c["id"]: c for c in build_cases()}
        self.assertEqual(cases["math-fuel-finish-es"]["gold"]["required_l"], 30.8)
        self.assertEqual(cases["math-fuel-finish-es"]["gold"]["deficit_l"], 7.4)
        self.assertNotIn("computed", cases["math-fuel-finish-es"]["inputs"])
        self.assertEqual(cases["acc-consumption-en"]["gold"]["fuel_per_lap_l"], 3.6)
        self.assertEqual(cases["acc-fuel-unit-es"]["gold"], {"fuel_l": None, "capacity_l": None})
        self.assertEqual(len(cases["acc-consumption-en"]["origin"]["sha256"]), 64)

    def test_engine_rate_units_are_not_ttft_proxies(self):
        rates = bench.engine_timings([{"timings": {"prompt_n": 200, "prompt_ms": 100,
                                                  "predicted_n": 30, "predicted_ms": 1500}}])
        self.assertEqual(rates["prefill_tokens_s"], 2000)
        self.assertEqual(rates["decode_tokens_s"], 20)
        self.assertIsNone(rates["load_ms"])
        self.assertIsNone(bench.engine_timings([])["prefill_tokens_s"])
        rates = bench.engine_timings([{"eval_count": 10, "eval_duration": 500000000,
                                       "load_duration": 100000000}])
        self.assertEqual(rates["decode_tokens_s"], 20)
        self.assertEqual(rates["load_ms"], 100)

    def test_real_run_requires_window_and_minimum_passes(self):
        with self.assertRaises(ValueError):
            bench.run(argparse.Namespace(passes=4))
        with self.assertRaises(ValueError):
            bench.run(argparse.Namespace(passes=5, mode="real", quiet_window=None))

    def test_sse_comments_crlf_and_multiline(self):
        raw = b': comment\r\n\r\ndata: {"a":\r\ndata: 1}\r\n\r\ndata: [DONE]\n\n'
        events = list(bench.sse(io.BytesIO(raw)))
        self.assertEqual(json.loads(events[0]), {"a": 1})
        self.assertEqual(events[1], "[DONE]")

    def test_failures_stay_in_denominator_and_variance(self):
        def row(value, error=False):
            return {"case_id": "test", "context_chars": 0, "concurrency": 1,
                    "error": error, "quality": {"automatic_pass": not error, "checks": {"facts": not error}},
                    "within_budget": not error, "ttft_ms": value, "total_ms": 10,
                    "completion_tokens_per_generation_s_proxy": None, "content": str(value), "tool_calls": []}
        summary = bench.summarize([row(1), row(None, True), row(3)])[0]
        self.assertEqual(summary["attempts"], 3)
        self.assertEqual(summary["automatic_passes"], 2)
        self.assertEqual(summary["errors"], 1)
        self.assertEqual(summary["ttft_ms"]["stdev"], 1)


class EndpointTests(unittest.TestCase):
    def run_endpoint(self, fault=None):
        server = make_server(fault=fault)
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
        thread.start()
        args = argparse.Namespace(base_url=f"http://127.0.0.1:{server.server_port}/v1",
                                  model="engineer-mock", seed=124, temperature=0, timeout=2)
        try:
            cases = {c["id"]: c for c in build_cases()}
            return [bench.request(args, cases[name], 0, 1, 0)
                    for name in ("lmu-fuel-es", "fuel-finish-en", "pilot-query-es")]
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_stream_content_json_and_fragmented_tool(self):
        for result in self.run_endpoint():
            self.assertIsNone(result["error"])
            self.assertTrue(result["quality"]["automatic_pass"])
            self.assertIsNotNone(result["ttft_ms"])
            self.assertEqual(result["usage"]["prompt_tokens"], 100)

    def test_incomplete_truncated_malformed_and_wrong(self):
        for fault in ("disconnect", "length", "malformed"):
            for result in self.run_endpoint(fault):
                self.assertIsNotNone(result["error"], fault)
                self.assertFalse(result["quality"]["automatic_pass"])
        self.assertFalse(self.run_endpoint("wrong")[0]["quality"]["automatic_pass"])


if __name__ == "__main__":
    unittest.main()
