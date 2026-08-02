import hashlib
import json
import os
import socket
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from voice_artifacts import ArtifactManager, load_manifest
from voice_host_controller import (
    HostProtocolError,
    HostStateError,
    HostTimeoutError,
    VoiceHostController,
)


HERE = Path(__file__).parent
REAL_HOST = HERE / "voice_host.py"
FAKE_HOST = HERE / "testdata" / "fake_voice_host.py"
PROTOCOL = "vantare.engineer.voice-host.v1"


def prepare_artifact(directory: Path) -> tuple[Path, Path]:
    payload = b"external-model-fixture"
    document = {
        "schema": "vantare.engineer.voice-artifacts.v1",
        "manifest_version": 1,
        "artifacts": [
            {
                "id": "whisper-base-multilingual",
                "version": "test",
                "platform": "windows",
                "architecture": "x86_64",
                "kind": "stt-model",
                "filename": "model.bin",
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "license": "MIT",
                "license_url": "https://example.invalid/license",
                "source_url": "https://example.invalid/model",
                "allowed_hosts": ["example.invalid"],
            }
        ],
    }
    manifest_path = directory / "manifest.json"
    manifest_path.write_text(json.dumps(document), encoding="utf-8")
    root = directory / "artifacts"
    manifest = load_manifest(json.dumps(document), platform="windows", architecture="x86_64")
    manager = ArtifactManager(manifest, root, 1024)
    artifact = manifest.artifacts["whisper-base-multilingual"]
    target = manager._target(artifact)
    target.write_bytes(payload)
    return manifest_path, root


def new_controller(
    manifest: Path,
    root: Path,
    *,
    script: Path = REAL_HOST,
    mode: str = "normal",
    port: int = 0,
    start_timeout_seconds: float = 15,
    request_timeout_seconds: float = 1,
    shutdown_timeout_seconds: float = 1,
) -> VoiceHostController:
    return VoiceHostController(
        host_script=script,
        manifest_path=manifest,
        artifact_root=root,
        required_artifacts=("whisper-base-multilingual",),
        storage_limit_bytes=1024,
        start_timeout_seconds=start_timeout_seconds,
        request_timeout_seconds=request_timeout_seconds,
        shutdown_timeout_seconds=shutdown_timeout_seconds,
        mode=mode,
        port=port,
    )


def wait_until_port_closed(port: int) -> None:
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        with socket.socket() as probe:
            probe.settimeout(0.05)
            if probe.connect_ex(("127.0.0.1", port)) != 0:
                return
        time.sleep(0.01)
    raise AssertionError(f"loopback port {port} remained open")


class VoiceHostLifecycleTests(unittest.TestCase):
    def test_start_owns_loopback_request_and_stop_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            host = new_controller(manifest, root)
            ready = host.start()
            self.assertEqual(ready["protocol"], PROTOCOL)
            self.assertEqual(ready["pid"], host.pid)
            self.assertEqual(ready["host"], "127.0.0.1")
            self.assertTrue(host.lease_exists())
            response = host.request("probe", request_id="request-1", delay_ms=0)
            self.assertEqual(response["request_id"], "request-1")
            self.assertEqual(response["status"], "ok")
            port = host.port
            self.assertTrue(host.test_token)
            host.stop()
            self.assertFalse(host.running)
            self.assertEqual(host.last_pid, ready["pid"])
            self.assertIsNotNone(host.last_exit_code)
            self.assertEqual(host.test_token, "")
            self.assertFalse(host.lease_exists())
            self.assertEqual(list((root / ".tmp").glob("host-*.lease")), [])
            wait_until_port_closed(port)

    def test_timeouts_must_be_finite_positive_and_bounded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            invalid = (0, -1, float("inf"), float("nan"), 121)
            for value in invalid:
                with self.subTest(request_timeout=value):
                    with self.assertRaises(HostStateError):
                        new_controller(manifest, root, request_timeout_seconds=value)
            with self.assertRaises(HostStateError):
                new_controller(manifest, root, start_timeout_seconds=61)
            with self.assertRaises(HostStateError):
                new_controller(manifest, root, shutdown_timeout_seconds=31)

    def test_request_timeout_terminates_host_and_releases_everything(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            host = new_controller(manifest, root)
            host.start()
            port = host.port
            with self.assertRaises(HostTimeoutError):
                host.request("probe", request_id="slow", delay_ms=500, timeout_seconds=0.05)
            self.assertFalse(host.running)
            self.assertFalse(host.lease_exists())
            wait_until_port_closed(port)

    def test_concurrent_double_start_allows_one_owner_and_stop_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            host = new_controller(manifest, root)
            starts: list[str] = []

            def start() -> None:
                try:
                    host.start()
                    starts.append("started")
                except HostStateError:
                    starts.append("rejected")

            threads = [threading.Thread(target=start) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)
            self.assertCountEqual(starts, ["started", "rejected"])
            port = host.port
            failures: list[BaseException] = []

            def stop() -> None:
                try:
                    host.stop()
                except BaseException as error:
                    failures.append(error)

            threads = [threading.Thread(target=stop) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)
            self.assertEqual(failures, [])
            self.assertFalse(host.lease_exists())
            wait_until_port_closed(port)

    def test_dishonest_readiness_pid_or_protocol_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            for mode in ("bad-pid", "bad-protocol"):
                with self.subTest(mode=mode):
                    host = new_controller(manifest, root, script=FAKE_HOST, mode=mode)
                    with self.assertRaises(HostProtocolError):
                        host.start()
                    self.assertFalse(host.running)
                    self.assertFalse(host.lease_exists())

    def test_readiness_timeout_preserves_timeout_and_cleans_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            host = new_controller(
                manifest,
                root,
                script=FAKE_HOST,
                mode="never-ready",
                start_timeout_seconds=0.1,
            )
            with self.assertRaises(HostTimeoutError):
                host.start()
            self.assertFalse(host.running)
            self.assertGreater(host.last_pid, 0)
            self.assertIsNotNone(host.last_exit_code)
            self.assertEqual(host.test_token, "")
            self.assertFalse(host.lease_exists())
            self.assertEqual(list((root / ".tmp").glob("host-*.lease")), [])

    def test_stop_during_slow_request_finishes_without_deadlock_or_port(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            host = new_controller(manifest, root, request_timeout_seconds=10)
            host.start()
            port = host.port
            request_started = threading.Event()
            request_errors: list[BaseException] = []

            def request() -> None:
                request_started.set()
                try:
                    host.request("probe", request_id="stop-race", delay_ms=5_000)
                except BaseException as error:
                    request_errors.append(error)

            requester = threading.Thread(target=request)
            requester.start()
            self.assertTrue(request_started.wait(timeout=1))
            time.sleep(0.05)
            stopper = threading.Thread(target=host.stop)
            stopper.start()
            stopper.join(timeout=4)
            requester.join(timeout=4)
            self.assertFalse(stopper.is_alive(), "stop deadlocked with an active request")
            self.assertFalse(requester.is_alive(), "request remained blocked after stop")
            self.assertEqual(len(request_errors), 1)
            self.assertIsInstance(request_errors[0], HostTimeoutError)
            self.assertFalse(host.running)
            self.assertEqual(host.test_token, "")
            self.assertFalse(host.lease_exists())
            self.assertEqual(list((root / ".tmp").glob("host-*.lease")), [])
            wait_until_port_closed(port)

    def test_invalid_or_oversized_response_fails_closed_and_kills_child(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            for mode in ("invalid-json", "huge-response"):
                with self.subTest(mode=mode):
                    host = new_controller(manifest, root, script=FAKE_HOST, mode=mode)
                    host.start()
                    port = host.port
                    with self.assertRaises(HostProtocolError):
                        host.request("probe", request_id="bad-response")
                    self.assertFalse(host.running)
                    self.assertFalse(host.lease_exists())
                    wait_until_port_closed(port)

    def test_crash_and_contaminated_port_leave_no_owner(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            crashed = new_controller(manifest, root, script=FAKE_HOST, mode="crash-after-ready")
            with self.assertRaises(HostTimeoutError):
                crashed.start()
            self.assertFalse(crashed.running)
            self.assertFalse(crashed.lease_exists())

            with socket.socket() as owner:
                owner.bind(("127.0.0.1", 0))
                owner.listen()
                port = owner.getsockname()[1]
                contaminated = new_controller(manifest, root, port=port)
                with self.assertRaises(HostProtocolError):
                    contaminated.start()
                self.assertFalse(contaminated.running)
                self.assertFalse(contaminated.lease_exists())

    def test_shutdown_hang_uses_kill_fallback_and_reaps_child(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            host = new_controller(manifest, root, script=FAKE_HOST, mode="hang-shutdown")
            host.start()
            port = host.port
            host.stop()
            self.assertIsNotNone(host.last_exit_code)
            self.assertFalse(host.lease_exists())
            wait_until_port_closed(port)

    def test_host_rejects_unauthorized_invalid_and_oversized_requests(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            host = new_controller(manifest, root)
            host.start()
            try:
                request = urllib.request.Request(
                    f"http://127.0.0.1:{host.port}/v1/request",
                    data=b"{}",
                    method="POST",
                )
                with self.assertRaises(urllib.error.HTTPError) as unauthorized:
                    urllib.request.urlopen(request, timeout=1)
                self.assertEqual(unauthorized.exception.code, 401)

                invalid = urllib.request.Request(
                    f"http://127.0.0.1:{host.port}/v1/request",
                    data=b"not-json",
                    headers={"Authorization": f"Bearer {host.test_token}"},
                    method="POST",
                )
                with self.assertRaises(urllib.error.HTTPError) as bad_json:
                    urllib.request.urlopen(invalid, timeout=1)
                self.assertEqual(bad_json.exception.code, 400)

                oversized = urllib.request.Request(
                    f"http://127.0.0.1:{host.port}/v1/request",
                    data=b"x" * (64 * 1024 + 1),
                    headers={"Authorization": f"Bearer {host.test_token}"},
                    method="POST",
                )
                with self.assertRaises(urllib.error.HTTPError) as too_large:
                    urllib.request.urlopen(oversized, timeout=1)
                self.assertEqual(too_large.exception.code, 413)
            finally:
                host.stop()

    def test_repeated_lifecycle_leaves_no_lease_or_port(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest, root = prepare_artifact(Path(directory))
            for _ in range(10):
                host = new_controller(manifest, root)
                host.start()
                port = host.port
                host.stop()
                self.assertFalse(host.lease_exists())
                wait_until_port_closed(port)
            self.assertEqual(list((root / ".tmp").glob("host-*.lease")), [])


if __name__ == "__main__":
    unittest.main()
