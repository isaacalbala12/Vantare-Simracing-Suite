"""Functional five-pass run against a local deterministic HTTP mock, no model."""
import argparse
import json
from pathlib import Path
import threading
import unittest

import bench
from mock_server import make_server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    parser.add_argument("--unittest", action="store_true", help="Run evaluator/transport tests in this same process")
    args = parser.parse_args()
    if args.unittest:
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromName("test_bench"))
        if not result.wasSuccessful():
            raise SystemExit(1)
    server = make_server()
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
    thread.start()
    try:
        bench.main(["run",
            "--base-url", f"http://127.0.0.1:{server.server_port}/v1", "--model", "engineer-mock",
            "--label", "MOCK-functional-only", "--mode", "mock", "--passes", "5",
            "--context-chars", "0", "4096", "--concurrency", "--output", args.output],
        )
        report = json.loads((Path(args.output) / "results.json").read_text(encoding="utf-8"))
        if not report["requests"] or not all(r["quality"]["automatic_pass"] for r in report["requests"]):
            raise SystemExit("Mock validation failed: inspect requests.jsonl")
        if not all(group["attempts"] == 5 for group in report["summary"]):
            raise SystemExit("Mock validation failed: missing measured passes")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
