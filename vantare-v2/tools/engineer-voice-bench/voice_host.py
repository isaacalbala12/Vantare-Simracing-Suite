"""Isolated lifecycle-only voice host for ENG-11 tests.

It deliberately performs no STT or TTS inference.
"""

from __future__ import annotations

import argparse
import hmac
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from voice_artifacts import ArtifactManager, load_manifest


PROTOCOL = "vantare.engineer.voice-host.v1"
MAX_REQUEST_BYTES = 64 * 1024
REQUEST_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")


class VoiceHTTPServer(HTTPServer):
    allow_reuse_address = False

    def __init__(self, address, handler, *, token: str, nonce: str):  # noqa: ANN001
        super().__init__(address, handler)
        self.token = token
        self.nonce = nonce


class Handler(BaseHTTPRequestHandler):
    server: VoiceHTTPServer

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _authorized(self) -> bool:
        supplied = self.headers.get("Authorization", "")
        expected = f"Bearer {self.server.token}"
        return hmac.compare_digest(supplied, expected)

    def _json(self, status: int, body: dict[str, object]) -> None:
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _require_auth(self) -> bool:
        if self._authorized():
            return True
        self._json(401, {"error": "unauthorized"})
        return False

    def do_GET(self) -> None:
        if self.path != "/v1/heartbeat":
            self._json(404, {"error": "not_found"})
            return
        if not self._require_auth():
            return
        self._json(
            200,
            {
                "protocol": PROTOCOL,
                "status": "ready",
                "pid": os.getpid(),
                "nonce": self.server.nonce,
            },
        )

    def do_POST(self) -> None:
        if not self._require_auth():
            return
        if self.path == "/v1/shutdown":
            self._json(200, {"status": "stopping"})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if self.path != "/v1/request":
            self._json(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            length = -1
        if not 0 <= length <= MAX_REQUEST_BYTES:
            self._json(413, {"error": "request_too_large"})
            return
        raw = self.rfile.read(length)
        try:
            request = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"error": "invalid_json"})
            return
        if not isinstance(request, dict) or set(request) != {"protocol", "request_id", "operation", "delay_ms"}:
            self._json(400, {"error": "invalid_request"})
            return
        request_id = request["request_id"]
        delay_ms = request["delay_ms"]
        if (
            request["protocol"] != PROTOCOL
            or request["operation"] != "probe"
            or not isinstance(request_id, str)
            or not REQUEST_ID.fullmatch(request_id)
            or isinstance(delay_ms, bool)
            or not isinstance(delay_ms, int)
            or not 0 <= delay_ms <= 10_000
        ):
            self._json(400, {"error": "invalid_request"})
            return
        if delay_ms:
            time.sleep(delay_ms / 1000)
        self._json(
            200,
            {
                "protocol": PROTOCOL,
                "request_id": request_id,
                "status": "ok",
                "host_pid": os.getpid(),
            },
        )


def serve(args: argparse.Namespace) -> None:
    token = os.environ.get("VANTARE_TEST_VOICE_HOST_TOKEN", "")
    nonce = os.environ.get("VANTARE_TEST_VOICE_HOST_NONCE", "")
    if not re.fullmatch(r"[0-9a-f]{64}", token) or not re.fullmatch(r"[0-9a-f]{32}", nonce):
        raise ValueError("missing bounded host credentials")
    manifest_path = Path(args.manifest)
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError("manifest must be a regular trusted file")
    manifest = load_manifest(
        manifest_path.read_text(encoding="utf-8"),
        platform="windows",
        architecture="x86_64",
    )
    manager = ArtifactManager(manifest, Path(args.artifact_root), args.storage_limit)
    for artifact_id in args.required_artifact:
        if manager.status(artifact_id)["state"] != "verified":
            raise ValueError("required artifact is not verified")

    server = VoiceHTTPServer(("127.0.0.1", args.port), Handler, token=token, nonce=nonce)
    lease: Path | None = None
    try:
        lease = manager.create_host_lease(nonce, os.getpid())
        readiness = {
            "protocol": PROTOCOL,
            "pid": os.getpid(),
            "host": "127.0.0.1",
            "port": server.server_address[1],
            "nonce": nonce,
        }
        print(json.dumps(readiness, separators=(",", ":")), flush=True)
        server.serve_forever(poll_interval=0.05)
    finally:
        server.server_close()
        if lease is not None and lease.exists():
            manager.remove_host_lease(nonce)


def main() -> None:
    parser = argparse.ArgumentParser(description="Vantare ENG-11 test-only voice host")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--artifact-root", required=True)
    parser.add_argument("--required-artifact", action="append", required=True)
    parser.add_argument("--storage-limit", type=int, required=True)
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        raise ValueError("invalid loopback port")
    serve(args)


if __name__ == "__main__":
    main()
