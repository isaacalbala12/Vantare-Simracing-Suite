"""Functional five-pass run against a local deterministic HTTP mock, no model."""
import argparse
from pathlib import Path
import subprocess
import sys
import threading

from mock_server import make_server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    server = make_server()
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
    thread.start()
    try:
        subprocess.run([sys.executable, str(Path(__file__).with_name("bench.py")), "run",
            "--base-url", f"http://127.0.0.1:{server.server_port}/v1", "--model", "engineer-mock",
            "--label", "MOCK-functional-only", "--mode", "mock", "--passes", "5",
            "--context-chars", "0", "4096", "--concurrency", "--output", args.output],
            check=True, timeout=120)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
