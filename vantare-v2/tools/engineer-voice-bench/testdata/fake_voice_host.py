"""Adversarial child used only by ENG-11 lifecycle tests."""

from __future__ import annotations

import argparse
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


PROTOCOL = "vantare.engineer.voice-host.v1"


class Server(HTTPServer):
    allow_reuse_address = False

    def __init__(self, address, handler, token: str, nonce: str, mode: str):  # noqa: ANN001
        super().__init__(address, handler)
        self.token = token
        self.nonce = nonce
        self.mode = mode


class Handler(BaseHTTPRequestHandler):
    server: Server

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _write(self, payload: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        self._write(
            json.dumps(
                {"protocol": PROTOCOL, "status": "ready", "pid": os.getpid(), "nonce": self.server.nonce}
            ).encode("utf-8")
        )

    def do_POST(self) -> None:
        if self.path == "/v1/shutdown":
            if self.server.mode == "hang-shutdown":
                time.sleep(10)
                return
            self._write(b'{"status":"stopping"}')
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if self.server.mode == "invalid-json":
            self._write(b"not-json")
            return
        if self.server.mode == "huge-response":
            self._write(b"x" * (64 * 1024 + 1))
            return
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length))
        self._write(
            json.dumps(
                {
                    "protocol": PROTOCOL,
                    "request_id": request["request_id"],
                    "status": "ok",
                    "host_pid": os.getpid(),
                }
            ).encode("utf-8")
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--manifest")
    parser.add_argument("--artifact-root")
    parser.add_argument("--storage-limit")
    parser.add_argument("--required-artifact", action="append")
    args = parser.parse_args()
    mode = os.environ["VANTARE_TEST_VOICE_HOST_MODE"]
    nonce = os.environ["VANTARE_TEST_VOICE_HOST_NONCE"]
    token = os.environ["VANTARE_TEST_VOICE_HOST_TOKEN"]
    lease = Path(os.environ["VANTARE_TEST_VOICE_HOST_LEASE"])
    lease.write_text(str(os.getpid()), encoding="ascii")
    server = Server(("127.0.0.1", args.port), Handler, token, nonce, mode)
    try:
        if mode == "never-ready":
            time.sleep(10)
            return
        ready = {
            "protocol": "wrong" if mode == "bad-protocol" else PROTOCOL,
            "pid": os.getpid() + 1 if mode == "bad-pid" else os.getpid(),
            "host": "127.0.0.1",
            "port": server.server_address[1],
            "nonce": nonce,
        }
        print(json.dumps(ready), flush=True)
        if mode == "crash-after-ready":
            return
        server.serve_forever(poll_interval=0.05)
    finally:
        server.server_close()
        lease.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
