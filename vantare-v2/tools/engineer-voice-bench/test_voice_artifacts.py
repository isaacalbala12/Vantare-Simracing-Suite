import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from voice_artifacts import (
    ArtifactManager,
    ArtifactManifestError,
    DownloadCancelled,
    DownloadTimeout,
    InstallBusyError,
    IntegrityError,
    StorageLimitError,
    UnsafePathError,
    load_manifest,
)


class LocalArtifactServer:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.slow = False
        self.redirect = False
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                if owner.redirect:
                    self.send_response(302)
                    self.send_header("Location", f"http://localhost:{owner.port}/artifact")
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Length", str(len(owner.payload)))
                self.end_headers()
                try:
                    if owner.slow:
                        midpoint = min(8192, len(owner.payload))
                        self.wfile.write(owner.payload[:midpoint])
                        self.wfile.flush()
                        time.sleep(0.2)
                        self.wfile.write(owner.payload[midpoint:])
                    else:
                        self.wfile.write(owner.payload)
                except (BrokenPipeError, ConnectionResetError):
                    # Expected when cancellation/timeout closes the client.
                    return

            def log_message(self, _format: str, *_args: object) -> None:
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever)

    def __enter__(self) -> "LocalArtifactServer":
        self.thread.start()
        return self

    def __exit__(self, *_args: object) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


def manifest_document(url: str, payload: bytes) -> dict[str, object]:
    return {
        "schema": "vantare.engineer.voice-artifacts.v1",
        "manifest_version": 1,
        "artifacts": [
            {
                "id": "whisper-base-multilingual",
                "version": "eng10-2026-08-02",
                "platform": "windows",
                "architecture": "x86_64",
                "kind": "stt-model",
                "filename": "ggml-base.bin",
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "license": "MIT",
                "license_url": "https://github.com/openai/whisper/blob/main/LICENSE",
                "source_url": url,
                "allowed_hosts": ["127.0.0.1"],
            }
        ],
    }


class VoiceArtifactTests(unittest.TestCase):
    def load(self, document: dict[str, object], *, allow_test_http: bool = True):
        return load_manifest(
            json.dumps(document),
            platform="windows",
            architecture="x86_64",
            allow_test_http=allow_test_http,
        )

    def test_manifest_and_missing_state_are_sanitized(self) -> None:
        payload = b"model"
        manifest = self.load(manifest_document("http://127.0.0.1:1/model", payload))
        with tempfile.TemporaryDirectory() as directory:
            manager = ArtifactManager(manifest, Path(directory) / "voice", 1024)
            self.assertEqual(
                manager.status("whisper-base-multilingual"),
                {
                    "id": "whisper-base-multilingual",
                    "version": "eng10-2026-08-02",
                    "state": "missing",
                    "bytes": 0,
                },
            )

    def test_versioned_manifest_is_closed_and_parseable_without_network(self) -> None:
        raw = Path(__file__).with_name("voice-artifacts.v1.json").read_text(encoding="utf-8")
        manifest = load_manifest(raw, platform="windows", architecture="x86_64")
        self.assertEqual(
            set(manifest.artifacts),
            {"whisper-cpp-server-windows-x64", "whisper-base-multilingual"},
        )
        self.assertEqual(manifest.artifacts["whisper-base-multilingual"].bytes, 147_951_465)

    def test_manifest_fails_closed(self) -> None:
        payload = b"model"
        base = manifest_document("https://example.invalid/model", payload)
        mutations = {
            "schema": lambda doc: doc.update(schema="unknown"),
            "duplicate": lambda doc: doc["artifacts"].append(dict(doc["artifacts"][0])),
            "sha": lambda doc: doc["artifacts"][0].update(sha256="x"),
            "size": lambda doc: doc["artifacts"][0].update(bytes=0),
            "license": lambda doc: doc["artifacts"][0].update(license=""),
            "filename": lambda doc: doc["artifacts"][0].update(filename="../model.bin"),
            "unknown-kind": lambda doc: doc["artifacts"][0].update(kind="plugin"),
            "platform": lambda doc: doc["artifacts"][0].update(platform="linux"),
            "host": lambda doc: doc["artifacts"][0].update(allowed_hosts=["other.invalid"]),
            "missing-field": lambda doc: doc["artifacts"][0].pop("license_url"),
            "unknown-field": lambda doc: doc["artifacts"][0].update(extra="unexpected"),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                document = json.loads(json.dumps(base))
                mutate(document)
                with self.assertRaises(ArtifactManifestError):
                    self.load(document, allow_test_http=False)

    def test_install_streams_validates_and_promotes_atomically(self) -> None:
        payload = os.urandom(64 * 1024)
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            manifest = self.load(manifest_document(f"http://127.0.0.1:{source.port}/artifact", payload))
            manager = ArtifactManager(manifest, Path(directory) / "voice", 128 * 1024)
            state = manager.install("whisper-base-multilingual", timeout_seconds=2)
            self.assertEqual(state["state"], "verified")
            self.assertEqual(state["bytes"], len(payload))
            self.assertEqual(manager.status("whisper-base-multilingual")["state"], "verified")
            self.assertEqual(list((Path(directory) / "voice" / ".tmp").glob("*.part")), [])

    def test_failed_reinstall_preserves_valid_artifact_and_cleans_temp(self) -> None:
        payload = os.urandom(32 * 1024)
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            manifest = self.load(manifest_document(f"http://127.0.0.1:{source.port}/artifact", payload))
            manager = ArtifactManager(manifest, Path(directory) / "voice", 128 * 1024)
            manager.install("whisper-base-multilingual", timeout_seconds=2)
            source.payload = b"corrupt"
            with self.assertRaises(IntegrityError):
                manager.install("whisper-base-multilingual", timeout_seconds=2, force=True)
            self.assertEqual(manager.status("whisper-base-multilingual")["state"], "verified")
            self.assertEqual(list((Path(directory) / "voice" / ".tmp").glob("*.part")), [])

    def test_atomic_reinstall_never_exposes_missing_or_partial_target(self) -> None:
        original = b"a" * (32 * 1024)
        with LocalArtifactServer(original) as source, tempfile.TemporaryDirectory() as directory:
            url = f"http://127.0.0.1:{source.port}/artifact"
            manager = ArtifactManager(self.load(manifest_document(url, original)), Path(directory) / "voice", 128 * 1024)
            manager.install("whisper-base-multilingual", timeout_seconds=2)
            source.slow = True
            failure: list[BaseException] = []

            def reinstall() -> None:
                try:
                    manager.install("whisper-base-multilingual", timeout_seconds=2, force=True)
                except BaseException as error:  # captured for the test thread
                    failure.append(error)

            worker = threading.Thread(target=reinstall)
            worker.start()
            target = manager._target(manager.manifest.artifacts["whisper-base-multilingual"])
            observed: set[bytes] = set()
            while worker.is_alive():
                observed.add(target.read_bytes())
                time.sleep(0.005)
            worker.join(timeout=2)
            self.assertEqual(failure, [])
            observed.add(target.read_bytes())
            self.assertEqual(observed, {original})
            self.assertEqual(target.read_bytes(), original)

    def test_corrupted_target_is_replaced_only_after_full_verification(self) -> None:
        payload = b"verified-repair" * 2_048
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            url = f"http://127.0.0.1:{source.port}/artifact"
            manager = ArtifactManager(self.load(manifest_document(url, payload)), Path(directory) / "voice", 128 * 1024)
            manager.install("whisper-base-multilingual", timeout_seconds=2)
            target = manager._target(manager.manifest.artifacts["whisper-base-multilingual"])
            target.write_bytes(b"corrupt-but-still-managed")
            self.assertEqual(manager.status("whisper-base-multilingual")["state"], "corrupted")

            state = manager.install("whisper-base-multilingual", timeout_seconds=2, force=True)

            self.assertEqual(state["state"], "verified")
            self.assertEqual(target.read_bytes(), payload)
            self.assertEqual(list((Path(directory) / "voice" / ".tmp").glob("*.part")), [])

    def test_storage_cap_covers_target_download_peak_and_existing_temporaries(self) -> None:
        payload = b"bounded-peak" * 2_048
        peak_without_extra_temp = (2 * len(payload)) + 1  # target + lock + download
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            url = f"http://127.0.0.1:{source.port}/artifact"
            root = Path(directory) / "voice"
            manifest = self.load(manifest_document(url, payload))
            manager = ArtifactManager(manifest, root, peak_without_extra_temp)
            manager.install("whisper-base-multilingual", timeout_seconds=2)

            # A verified force-check may use exactly the bounded coexistence
            # peak, then retains the already verified immutable target.
            self.assertEqual(
                manager.install("whisper-base-multilingual", timeout_seconds=2, force=True)["state"],
                "verified",
            )
            with self.assertRaises(StorageLimitError):
                ArtifactManager(manifest, root, peak_without_extra_temp - 1).install(
                    "whisper-base-multilingual", timeout_seconds=2, force=True
                )

            # A corrupt target still counts until the verified replacement is
            # atomically promoted.
            target = manager._target(manifest.artifacts["whisper-base-multilingual"])
            target.write_bytes(b"x" * len(payload))
            self.assertEqual(manager.status("whisper-base-multilingual")["state"], "corrupted")
            self.assertEqual(
                manager.install("whisper-base-multilingual", timeout_seconds=2, force=True)["state"],
                "verified",
            )

            existing = root / ".tmp" / "previous.part"
            existing.write_bytes(b"12345678")
            with self.assertRaises(StorageLimitError):
                ArtifactManager(manifest, root, peak_without_extra_temp + 7).install(
                    "whisper-base-multilingual", timeout_seconds=2, force=True
                )
            self.assertEqual(existing.read_bytes(), b"12345678")
            self.assertEqual(list((root / ".tmp").glob("*.part")), [existing])

    def test_concurrent_managers_share_one_install_owner(self) -> None:
        payload = b"single-owner" * 4_096
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            source.slow = True
            url = f"http://127.0.0.1:{source.port}/artifact"
            root = Path(directory) / "voice"
            manifest = self.load(manifest_document(url, payload))
            managers = [ArtifactManager(manifest, root, 4 * len(payload)) for _ in range(2)]
            start = threading.Barrier(2)
            outcomes: list[str] = []

            def install(manager: ArtifactManager) -> None:
                start.wait(timeout=2)
                try:
                    manager.install("whisper-base-multilingual", timeout_seconds=2)
                    outcomes.append("verified")
                except InstallBusyError:
                    outcomes.append("busy")

            workers = [threading.Thread(target=install, args=(manager,)) for manager in managers]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join(timeout=3)
            self.assertFalse(any(worker.is_alive() for worker in workers))
            self.assertCountEqual(outcomes, ["verified", "busy"])
            self.assertEqual(managers[0].status("whisper-base-multilingual")["state"], "verified")
            self.assertEqual(list((root / ".tmp").glob("*.part")), [])

    def test_redirect_to_non_allowlisted_host_is_rejected(self) -> None:
        payload = b"model"
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            source.redirect = True
            manifest = self.load(manifest_document(f"http://127.0.0.1:{source.port}/redirect", payload))
            manager = ArtifactManager(manifest, Path(directory) / "voice", 1024)
            with self.assertRaises(IntegrityError):
                manager.install("whisper-base-multilingual", timeout_seconds=2)
            self.assertEqual(list((Path(directory) / "voice" / ".tmp").glob("*.part")), [])

    def test_cancellation_removes_partial_download(self) -> None:
        payload = os.urandom(64 * 1024)
        cancelled = threading.Event()
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            source.slow = True
            manifest = self.load(manifest_document(f"http://127.0.0.1:{source.port}/artifact", payload))
            manager = ArtifactManager(manifest, Path(directory) / "voice", 128 * 1024)
            timer = threading.Timer(0.05, cancelled.set)
            timer.start()
            try:
                with self.assertRaises(DownloadCancelled):
                    manager.install("whisper-base-multilingual", timeout_seconds=2, cancel=cancelled)
            finally:
                timer.cancel()
            self.assertEqual(manager.status("whisper-base-multilingual")["state"], "missing")
            self.assertEqual(list((Path(directory) / "voice" / ".tmp").glob("*.part")), [])

    def test_total_timeout_removes_partial_download(self) -> None:
        payload = os.urandom(64 * 1024)
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            source.slow = True
            manifest = self.load(manifest_document(f"http://127.0.0.1:{source.port}/artifact", payload))
            manager = ArtifactManager(manifest, Path(directory) / "voice", 128 * 1024)
            with self.assertRaises(DownloadTimeout):
                manager.install("whisper-base-multilingual", timeout_seconds=0.05)
            self.assertEqual(manager.status("whisper-base-multilingual")["state"], "missing")
            self.assertEqual(list((Path(directory) / "voice" / ".tmp").glob("*.part")), [])

    def test_download_timeout_must_be_finite_positive_and_bounded(self) -> None:
        payload = b"model"
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            manifest = self.load(manifest_document(f"http://127.0.0.1:{source.port}/artifact", payload))
            manager = ArtifactManager(manifest, Path(directory) / "voice", 1024)
            for value in (False, 0, -1, float("nan"), float("inf"), 3601):
                with self.subTest(timeout=value):
                    with self.assertRaises(ValueError):
                        manager.install("whisper-base-multilingual", timeout_seconds=value)

    def test_storage_limit_and_managed_delete(self) -> None:
        payload = b"model-data"
        with LocalArtifactServer(payload) as source, tempfile.TemporaryDirectory() as directory:
            manifest = self.load(manifest_document(f"http://127.0.0.1:{source.port}/artifact", payload))
            with self.assertRaises(StorageLimitError):
                ArtifactManager(manifest, Path(directory) / "small", len(payload) - 1).install(
                    "whisper-base-multilingual", timeout_seconds=2
                )
            manager = ArtifactManager(manifest, Path(directory) / "voice", 1024)
            manager.install("whisper-base-multilingual", timeout_seconds=2)
            self.assertEqual([state["state"] for state in manager.list_status()], ["verified"])
            manager.remove("whisper-base-multilingual")
            self.assertEqual(manager.status("whisper-base-multilingual")["state"], "missing")

    def test_reparse_or_symlink_in_existing_ancestor_is_rejected(self) -> None:
        payload = b"model"
        manifest = self.load(manifest_document("http://127.0.0.1:1/model", payload))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            real = root / "real"
            real.mkdir()
            link = root / "link"
            if os.name == "nt":
                result = subprocess.run(
                    ["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(real)],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if result.returncode != 0:
                    self.fail(f"junction creation failed: {result.stderr or result.stdout}")
            else:
                link.symlink_to(real, target_is_directory=True)
            with self.assertRaises(UnsafePathError):
                ArtifactManager(manifest, link / "nested" / "voice", 1024)

    def test_delete_rejects_untrusted_id_and_reparse_escape(self) -> None:
        payload = b"model"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manager = ArtifactManager(
                self.load(manifest_document("http://127.0.0.1:1/model", payload)), root / "voice", 1024
            )
            with self.assertRaises(ArtifactManifestError):
                manager.remove("../outside")

            artifact = manager.manifest.artifacts["whisper-base-multilingual"]
            target = manager._target(artifact)
            version = target.parent
            shutil.rmtree(version)
            outside = root / "outside"
            outside.mkdir()
            protected = outside / artifact.filename
            protected.write_bytes(b"keep")
            if os.name == "nt":
                result = subprocess.run(
                    ["cmd.exe", "/d", "/c", "mklink", "/J", str(version), str(outside)],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if result.returncode != 0:
                    self.fail(f"junction creation failed: {result.stderr or result.stdout}")
            else:
                version.symlink_to(outside, target_is_directory=True)
            with self.assertRaises(UnsafePathError):
                manager.remove("whisper-base-multilingual")
            self.assertEqual(protected.read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
