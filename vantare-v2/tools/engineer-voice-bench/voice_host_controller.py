"""Parent-side lifecycle guard for the ENG-11 test-only voice host."""

from __future__ import annotations

import json
import math
import os
import queue
import re
import secrets
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path

from voice_artifacts import ArtifactManager, ArtifactError, load_manifest


PROTOCOL = "vantare.engineer.voice-host.v1"
MAX_RESPONSE_BYTES = 64 * 1024
REQUEST_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")
MAX_START_TIMEOUT_SECONDS = 60.0
MAX_REQUEST_TIMEOUT_SECONDS = 120.0
MAX_SHUTDOWN_TIMEOUT_SECONDS = 30.0


class VoiceHostError(Exception):
    pass


class HostStateError(VoiceHostError):
    pass


class HostProtocolError(VoiceHostError):
    pass


class HostTimeoutError(VoiceHostError):
    pass


def _bounded_timeout(name: str, value: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise HostStateError(f"{name} must be a finite positive number")
    timeout = float(value)
    if not math.isfinite(timeout) or timeout <= 0 or timeout > maximum:
        raise HostStateError(f"{name} must be greater than zero and at most {maximum:g} seconds")
    return timeout


class VoiceHostController:
    def __init__(
        self,
        *,
        host_script: Path,
        manifest_path: Path,
        artifact_root: Path,
        required_artifacts: tuple[str, ...],
        storage_limit_bytes: int,
        start_timeout_seconds: float,
        request_timeout_seconds: float,
        shutdown_timeout_seconds: float,
        mode: str = "normal",
        port: int = 0,
    ) -> None:
        self.host_script = Path(host_script)
        self.manifest_path = Path(manifest_path)
        if self.host_script.is_symlink() or not self.host_script.is_file():
            raise HostStateError("voice-host script must be a regular file")
        if self.manifest_path.is_symlink() or not self.manifest_path.is_file():
            raise HostStateError("voice manifest must be a regular file")
        if not required_artifacts:
            raise HostStateError("at least one required artifact is needed")
        if not 0 <= port <= 65535:
            raise HostStateError("invalid loopback port")
        self.manifest = load_manifest(
            self.manifest_path.read_text(encoding="utf-8"),
            platform="windows",
            architecture="x86_64",
        )
        self.manager = ArtifactManager(self.manifest, artifact_root, storage_limit_bytes)
        self.required_artifacts = required_artifacts
        self.start_timeout_seconds = _bounded_timeout(
            "start timeout", start_timeout_seconds, MAX_START_TIMEOUT_SECONDS
        )
        self.request_timeout_seconds = _bounded_timeout(
            "request timeout", request_timeout_seconds, MAX_REQUEST_TIMEOUT_SECONDS
        )
        self.shutdown_timeout_seconds = _bounded_timeout(
            "shutdown timeout", shutdown_timeout_seconds, MAX_SHUTDOWN_TIMEOUT_SECONDS
        )
        self.mode = mode
        self.requested_port = port
        self._state_lock = threading.RLock()
        self._request_lock = threading.Lock()
        self._process: subprocess.Popen[str] | None = None
        self._port = 0
        self._token = ""
        self._nonce = ""
        self._last_pid = 0
        self._last_exit_code: int | None = None

    @property
    def running(self) -> bool:
        with self._state_lock:
            return self._process is not None and self._process.poll() is None

    @property
    def pid(self) -> int:
        with self._state_lock:
            return self._process.pid if self._process is not None else 0

    @property
    def port(self) -> int:
        with self._state_lock:
            return self._port

    @property
    def last_pid(self) -> int:
        with self._state_lock:
            return self._last_pid

    @property
    def last_exit_code(self) -> int | None:
        with self._state_lock:
            return self._last_exit_code

    @property
    def test_token(self) -> str:
        """Exposed only so adversarial tests can send unauthorized/oversized requests."""
        with self._state_lock:
            return self._token

    def lease_exists(self) -> bool:
        with self._state_lock:
            return bool(self._nonce) and self.manager.host_lease_path(self._nonce).exists()

    def _assert_artifacts(self) -> None:
        for artifact_id in self.required_artifacts:
            try:
                state = self.manager.status(artifact_id)
            except ArtifactError as error:
                raise HostStateError("required voice artifact is unavailable") from error
            if state["state"] != "verified":
                raise HostStateError("required voice artifact is not verified")

    def start(self) -> dict[str, object]:
        with self._state_lock:
            if self._process is not None:
                raise HostStateError("voice-host already started")
            self._assert_artifacts()
            self._token = secrets.token_hex(32)
            self._nonce = secrets.token_hex(16)
            environment = os.environ.copy()
            environment.update(
                {
                    "VANTARE_TEST_VOICE_HOST_TOKEN": self._token,
                    "VANTARE_TEST_VOICE_HOST_NONCE": self._nonce,
                    "VANTARE_TEST_VOICE_HOST_MODE": self.mode,
                    "VANTARE_TEST_VOICE_HOST_LEASE": str(self.manager.host_lease_path(self._nonce)),
                }
            )
            command = [
                sys.executable,
                str(self.host_script),
                "--manifest",
                str(self.manifest_path),
                "--artifact-root",
                str(self.manager.root),
                "--storage-limit",
                str(self.manager.storage_limit_bytes),
                "--port",
                str(self.requested_port),
            ]
            for artifact_id in self.required_artifacts:
                command.extend(("--required-artifact", artifact_id))
            creationflags = subprocess.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 0
            self._process = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                env=environment,
                creationflags=creationflags,
                start_new_session=os.name != "nt",
            )
            self._last_pid = self._process.pid
            self._last_exit_code = None
            try:
                line = self._read_ready_line(self._process)
                ready = self._validate_ready(line, self._process.pid)
                self._port = int(ready["port"])
                heartbeat = self._request_json("GET", "/v1/heartbeat", None, self.start_timeout_seconds)
                if set(heartbeat) != {"protocol", "status", "pid", "nonce"}:
                    raise HostProtocolError("heartbeat fields are invalid")
                if (
                    heartbeat["protocol"] != PROTOCOL
                    or heartbeat["status"] != "ready"
                    or heartbeat["pid"] != self._process.pid
                    or heartbeat["nonce"] != self._nonce
                ):
                    raise HostProtocolError("heartbeat does not prove process ownership")
                return ready
            except VoiceHostError:
                self._stop_locked(graceful=False)
                raise
            except Exception as error:
                self._stop_locked(graceful=False)
                raise HostProtocolError("voice-host failed readiness safely") from error

    def _read_ready_line(self, process: subprocess.Popen[str]) -> str:
        result: queue.Queue[str] = queue.Queue(maxsize=1)

        def read() -> None:
            result.put(process.stdout.readline() if process.stdout is not None else "")

        reader = threading.Thread(target=read, name="voice-host-readiness", daemon=True)
        reader.start()
        try:
            line = result.get(timeout=self.start_timeout_seconds)
        except queue.Empty as error:
            raise HostTimeoutError("voice-host readiness timed out") from error
        finally:
            reader.join(timeout=0.1)
        if not line:
            raise HostProtocolError("voice-host exited before readiness")
        return line

    def _validate_ready(self, line: str, expected_pid: int) -> dict[str, object]:
        if len(line.encode("utf-8")) > 4096:
            raise HostProtocolError("readiness exceeded size limit")
        try:
            ready = json.loads(line)
        except json.JSONDecodeError as error:
            raise HostProtocolError("readiness is not valid JSON") from error
        if not isinstance(ready, dict) or set(ready) != {"protocol", "pid", "host", "port", "nonce"}:
            raise HostProtocolError("readiness fields are invalid")
        port = ready["port"]
        if (
            ready["protocol"] != PROTOCOL
            or ready["pid"] != expected_pid
            or ready["host"] != "127.0.0.1"
            or isinstance(port, bool)
            or not isinstance(port, int)
            or not 1 <= port <= 65535
            or ready["nonce"] != self._nonce
        ):
            raise HostProtocolError("readiness does not prove loopback ownership")
        return ready

    def _request_json(
        self,
        method: str,
        path: str,
        body: dict[str, object] | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        payload = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            f"http://127.0.0.1:{self._port}{path}",
            data=payload,
            headers={"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"},
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
        except urllib.error.HTTPError as error:
            raise HostProtocolError("voice-host rejected a controller request") from error
        except (TimeoutError, urllib.error.URLError, OSError) as error:
            raise HostTimeoutError("voice-host request timed out or disconnected") from error
        if len(raw) > MAX_RESPONSE_BYTES:
            raise HostProtocolError("voice-host response exceeded size limit")
        try:
            result = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise HostProtocolError("voice-host returned invalid JSON") from error
        if not isinstance(result, dict):
            raise HostProtocolError("voice-host response must be an object")
        return result

    def request(
        self,
        operation: str,
        *,
        request_id: str,
        delay_ms: int = 0,
        timeout_seconds: float | None = None,
    ) -> dict[str, object]:
        if operation != "probe" or not REQUEST_ID.fullmatch(request_id):
            raise HostProtocolError("invalid bounded test request")
        if isinstance(delay_ms, bool) or not isinstance(delay_ms, int) or not 0 <= delay_ms <= 10_000:
            raise HostProtocolError("invalid test delay")
        with self._request_lock:
            with self._state_lock:
                if self._process is None or self._process.poll() is not None:
                    self._stop_locked(graceful=False)
                    raise HostStateError("voice-host is not running")
                timeout = (
                    self.request_timeout_seconds
                    if timeout_seconds is None
                    else _bounded_timeout("request timeout", timeout_seconds, MAX_REQUEST_TIMEOUT_SECONDS)
                )
            try:
                result = self._request_json(
                    "POST",
                    "/v1/request",
                    {"protocol": PROTOCOL, "request_id": request_id, "operation": operation, "delay_ms": delay_ms},
                    timeout,
                )
                if set(result) != {"protocol", "request_id", "status", "host_pid"}:
                    raise HostProtocolError("voice-host response fields are invalid")
                if (
                    result["protocol"] != PROTOCOL
                    or result["request_id"] != request_id
                    or result["status"] != "ok"
                    or result["host_pid"] != self.pid
                ):
                    raise HostProtocolError("voice-host response ownership is invalid")
                return result
            except VoiceHostError:
                self.stop(graceful=False)
                raise

    def stop(self, *, graceful: bool = True) -> None:
        with self._state_lock:
            self._stop_locked(graceful=graceful)

    def _stop_locked(self, *, graceful: bool) -> None:
        process = self._process
        if process is not None:
            if process.poll() is None and graceful and self._port:
                try:
                    self._request_json("POST", "/v1/shutdown", {}, min(self.shutdown_timeout_seconds, 1))
                except VoiceHostError:
                    pass
            try:
                process.wait(timeout=self.shutdown_timeout_seconds)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=self.shutdown_timeout_seconds)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=self.shutdown_timeout_seconds)
            if process.stdout is not None:
                process.stdout.close()
            self._last_exit_code = process.returncode
        try:
            if self._nonce:
                self.manager.remove_host_lease(self._nonce)
        finally:
            self._process = None
            self._port = 0
            self._token = ""
            self._nonce = ""

    def __enter__(self) -> "VoiceHostController":
        self.start()
        return self

    def __exit__(self, *_args: object) -> None:
        self.stop()
