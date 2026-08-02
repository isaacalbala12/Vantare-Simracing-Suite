"""Test-only, dependency-free installer for pinned Engineer voice artifacts."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from threading import Event

if os.name == "nt":
    import msvcrt
else:  # pragma: no cover - product target is Windows; keeps tooling importable.
    import fcntl


SCHEMA = "vantare.engineer.voice-artifacts.v1"
MANIFEST_KEYS = {"schema", "manifest_version", "artifacts"}
ARTIFACT_KEYS = {
    "id",
    "version",
    "platform",
    "architecture",
    "kind",
    "filename",
    "bytes",
    "sha256",
    "license",
    "license_url",
    "source_url",
    "allowed_hosts",
}
ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
VERSION_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")
HASH_PATTERN = re.compile(r"[0-9a-f]{64}\Z")
NONCE_PATTERN = re.compile(r"[0-9a-f]{32}\Z")
HOST_PATTERN = re.compile(r"[a-z0-9.-]{1,253}\Z")
KINDS = {"runtime-archive", "stt-model"}
MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
REPARSE_POINT = 0x400


class ArtifactError(Exception):
    pass


class ArtifactManifestError(ArtifactError):
    pass


class IntegrityError(ArtifactError):
    pass


class DownloadCancelled(ArtifactError):
    pass


class DownloadTimeout(ArtifactError):
    pass


class StorageLimitError(ArtifactError):
    pass


class UnsafePathError(ArtifactError):
    pass


class InstallBusyError(ArtifactError):
    pass


@dataclass(frozen=True)
class Artifact:
    id: str
    version: str
    platform: str
    architecture: str
    kind: str
    filename: str
    bytes: int
    sha256: str
    license: str
    license_url: str
    source_url: str
    allowed_hosts: tuple[str, ...]


@dataclass(frozen=True)
class Manifest:
    artifacts: dict[str, Artifact]
    allow_test_http: bool = False


def _validated_url(value: object, allowed_hosts: tuple[str, ...], allow_test_http: bool) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ArtifactManifestError("URL must be a bounded string")
    parsed = urllib.parse.urlsplit(value)
    host = (parsed.hostname or "").lower()
    local_test = allow_test_http and parsed.scheme == "http" and host in {"127.0.0.1", "localhost"}
    if parsed.scheme != "https" and not local_test:
        raise ArtifactManifestError("artifact URL must use HTTPS")
    if not host or host not in allowed_hosts or parsed.username or parsed.password or parsed.fragment:
        raise ArtifactManifestError("artifact URL is not allowed by the manifest")
    return value


def _https_url(value: object) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ArtifactManifestError("license URL must be a bounded string")
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ArtifactManifestError("license URL must use HTTPS without credentials")
    return value


def load_manifest(
    raw: str,
    *,
    platform: str,
    architecture: str,
    allow_test_http: bool = False,
) -> Manifest:
    try:
        document = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as error:
        raise ArtifactManifestError("manifest is not valid JSON") from error
    if not isinstance(document, dict) or set(document) != MANIFEST_KEYS:
        raise ArtifactManifestError("manifest fields do not match schema")
    if document["schema"] != SCHEMA or document["manifest_version"] != 1:
        raise ArtifactManifestError("unsupported manifest schema or version")
    entries = document["artifacts"]
    if not isinstance(entries, list) or not 1 <= len(entries) <= 32:
        raise ArtifactManifestError("manifest must contain 1 to 32 artifacts")

    artifacts: dict[str, Artifact] = {}
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != ARTIFACT_KEYS:
            raise ArtifactManifestError("artifact fields do not match schema")
        artifact_id = entry["id"]
        version = entry["version"]
        filename = entry["filename"]
        if not isinstance(artifact_id, str) or not ID_PATTERN.fullmatch(artifact_id):
            raise ArtifactManifestError("invalid artifact ID")
        if artifact_id in artifacts:
            raise ArtifactManifestError("duplicate artifact ID")
        if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
            raise ArtifactManifestError("invalid artifact version")
        if (
            not isinstance(filename, str)
            or filename in {".", ".."}
            or Path(filename).name != filename
            or "/" in filename
            or "\\" in filename
        ):
            raise ArtifactManifestError("invalid artifact filename")
        if entry["platform"] != platform or entry["architecture"] != architecture:
            raise ArtifactManifestError("artifact platform is incompatible")
        if entry["kind"] not in KINDS:
            raise ArtifactManifestError("unknown artifact kind")
        size = entry["bytes"]
        if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= MAX_ARTIFACT_BYTES:
            raise ArtifactManifestError("invalid artifact size")
        digest = entry["sha256"]
        if not isinstance(digest, str) or not HASH_PATTERN.fullmatch(digest):
            raise ArtifactManifestError("invalid artifact SHA-256")
        license_name = entry["license"]
        if not isinstance(license_name, str) or not 1 <= len(license_name.strip()) <= 64:
            raise ArtifactManifestError("invalid artifact license")
        hosts = entry["allowed_hosts"]
        if (
            not isinstance(hosts, list)
            or not 1 <= len(hosts) <= 8
            or any(not isinstance(host, str) or not HOST_PATTERN.fullmatch(host) or host != host.lower() for host in hosts)
            or len(set(hosts)) != len(hosts)
        ):
            raise ArtifactManifestError("invalid artifact host allowlist")
        allowed_hosts = tuple(hosts)
        artifacts[artifact_id] = Artifact(
            id=artifact_id,
            version=version,
            platform=platform,
            architecture=architecture,
            kind=entry["kind"],
            filename=filename,
            bytes=size,
            sha256=digest,
            license=license_name.strip(),
            license_url=_https_url(entry["license_url"]),
            source_url=_validated_url(entry["source_url"], allowed_hosts, allow_test_http),
            allowed_hosts=allowed_hosts,
        )
    return Manifest(artifacts=artifacts, allow_test_http=allow_test_http)


def _is_link_or_reparse(path: Path) -> bool:
    if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
        return True
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except FileNotFoundError:
        return False
    return bool(attributes & REPARSE_POINT)


def _existing_chain(path: Path) -> list[Path]:
    chain: list[Path] = []
    current = path
    while True:
        if current.exists() or current.is_symlink():
            chain.append(current)
        if current.parent == current:
            break
        current = current.parent
    return chain


def _assert_safe_chain(path: Path) -> None:
    for component in _existing_chain(path):
        if _is_link_or_reparse(component):
            raise UnsafePathError("managed path contains a link or reparse point")


def _inside_git_worktree(path: Path) -> bool:
    current = path
    while True:
        if (current / ".git").exists():
            return True
        if current.parent == current:
            return False
        current = current.parent


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


@contextmanager
def _exclusive_install_lock(path: Path):
    """Hold one cross-process install lock for the managed root."""
    _assert_safe_chain(path.parent)
    try:
        with path.open("xb") as created:
            created.write(b"\0")
            created.flush()
            os.fsync(created.fileno())
    except FileExistsError:
        pass
    if path.exists() and (_is_link_or_reparse(path) or not path.is_file()):
        raise UnsafePathError("artifact install lock is unsafe")
    with path.open("r+b") as lock:
        try:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:  # pragma: no cover - product target is Windows.
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise InstallBusyError("another artifact install is active") from error
        try:
            yield
        finally:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:  # pragma: no cover - product target is Windows.
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, artifact: Artifact, allow_test_http: bool) -> None:
        super().__init__()
        self.artifact = artifact
        self.allow_test_http = allow_test_http

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        try:
            _validated_url(newurl, self.artifact.allowed_hosts, self.allow_test_http)
        except ArtifactManifestError as error:
            raise IntegrityError("redirect target is not allowlisted") from error
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class ArtifactManager:
    def __init__(self, manifest: Manifest, root: Path, storage_limit_bytes: int) -> None:
        if isinstance(storage_limit_bytes, bool) or storage_limit_bytes < 1:
            raise StorageLimitError("storage limit must be positive")
        self.manifest = manifest
        self.root = Path(os.path.abspath(root))
        self.storage_limit_bytes = storage_limit_bytes
        _assert_safe_chain(self.root)
        if _inside_git_worktree(self.root):
            raise UnsafePathError("voice artifacts must remain outside Git")
        self.root.mkdir(parents=True, exist_ok=True)
        self.temp = self.root / ".tmp"
        self.temp.mkdir(exist_ok=True)
        _assert_safe_chain(self.temp)

    def _artifact(self, artifact_id: str) -> Artifact:
        try:
            return self.manifest.artifacts[artifact_id]
        except KeyError as error:
            raise ArtifactManifestError("artifact is not present in trusted manifest") from error

    def _target(self, artifact: Artifact) -> Path:
        target = self.root / "artifacts" / artifact.id / artifact.version / artifact.filename
        _assert_safe_chain(target.parent)
        target.parent.mkdir(parents=True, exist_ok=True)
        _assert_safe_chain(target.parent)
        return target

    def _storage_bytes(self) -> int:
        total = 0
        for current, directories, files in os.walk(self.root, followlinks=False):
            current_path = Path(current)
            _assert_safe_chain(current_path)
            for name in tuple(directories) + tuple(files):
                item = current_path / name
                if _is_link_or_reparse(item):
                    raise UnsafePathError("managed storage contains a link or reparse point")
            for name in files:
                total += (current_path / name).stat().st_size
        return total

    def status(self, artifact_id: str) -> dict[str, object]:
        artifact = self._artifact(artifact_id)
        target = self._target(artifact)
        if not target.exists():
            return {"id": artifact.id, "version": artifact.version, "state": "missing", "bytes": 0}
        if _is_link_or_reparse(target) or not target.is_file():
            raise UnsafePathError("artifact target is not a regular managed file")
        size = target.stat().st_size
        state = "verified" if size == artifact.bytes and _sha256_file(target) == artifact.sha256 else "corrupted"
        return {"id": artifact.id, "version": artifact.version, "state": state, "bytes": size}

    def install(
        self,
        artifact_id: str,
        *,
        timeout_seconds: float,
        cancel: Event | None = None,
        force: bool = False,
    ) -> dict[str, object]:
        if (
            isinstance(timeout_seconds, bool)
            or not isinstance(timeout_seconds, (int, float))
            or not math.isfinite(float(timeout_seconds))
            or timeout_seconds <= 0
            or timeout_seconds > 3600
        ):
            raise ValueError("timeout must be greater than zero and at most 3600 seconds")
        with _exclusive_install_lock(self.temp / ".install.lock"):
            return self._install_locked(
                artifact_id,
                timeout_seconds=float(timeout_seconds),
                cancel=cancel,
                force=force,
            )

    def _install_locked(
        self,
        artifact_id: str,
        *,
        timeout_seconds: float,
        cancel: Event | None,
        force: bool,
    ) -> dict[str, object]:
        artifact = self._artifact(artifact_id)
        cancel = cancel or Event()
        if cancel.is_set():
            raise DownloadCancelled("download cancelled before start")
        current = self.status(artifact_id)
        if current["state"] == "verified" and not force:
            return current
        # The old target, any conservative pre-existing temporary and the new
        # download coexist until atomic promotion. Cap that real peak rather
        # than subtracting the target optimistically.
        if self._storage_bytes() + artifact.bytes > self.storage_limit_bytes:
            raise StorageLimitError("artifact install peak exceeds managed storage limit")

        temporary = self.temp / f"{artifact.id}.{uuid.uuid4().hex}.part"
        _assert_safe_chain(temporary.parent)
        request = urllib.request.Request(artifact.source_url, headers={"User-Agent": "Vantare-Voice-Artifact-Test/1"})
        opener = urllib.request.build_opener(_SafeRedirectHandler(artifact, self.manifest.allow_test_http))
        digest = hashlib.sha256()
        written = 0
        deadline = time.monotonic() + timeout_seconds
        try:
            with opener.open(request, timeout=timeout_seconds) as response, temporary.open("xb") as output:
                _validated_url(response.geturl(), artifact.allowed_hosts, self.manifest.allow_test_http)
                while True:
                    if cancel.is_set():
                        raise DownloadCancelled("download cancelled")
                    if time.monotonic() >= deadline:
                        raise DownloadTimeout("artifact download exceeded total timeout")
                    chunk = response.read(CHUNK_BYTES)
                    if not chunk:
                        break
                    if time.monotonic() >= deadline:
                        raise DownloadTimeout("artifact download exceeded total timeout")
                    written += len(chunk)
                    if written > artifact.bytes:
                        raise IntegrityError("artifact exceeded pinned size")
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if cancel.is_set():
                raise DownloadCancelled("download cancelled")
            if written != artifact.bytes or digest.hexdigest() != artifact.sha256:
                raise IntegrityError("artifact size or SHA-256 does not match manifest")
            target = self._target(artifact)
            _assert_safe_chain(target.parent)
            # A forced integrity check must not replace an already verified
            # immutable artifact. On Windows, replacing a file while another
            # process opens it can produce a transient sharing denial even
            # though the directory entry never disappears. Keep the verified
            # target and discard the equally verified temporary download.
            if self.status(artifact_id)["state"] == "verified":
                return self.status(artifact_id)
            os.replace(temporary, target)
            return self.status(artifact_id)
        except DownloadCancelled:
            raise
        except (DownloadTimeout, TimeoutError):
            raise DownloadTimeout("artifact download exceeded total timeout")
        except ArtifactError:
            raise
        except Exception as error:
            raise IntegrityError("artifact download failed safely") from error
        finally:
            temporary.unlink(missing_ok=True)

    def remove(self, artifact_id: str) -> None:
        with _exclusive_install_lock(self.temp / ".install.lock"):
            artifact = self._artifact(artifact_id)
            target = self._target(artifact)
            _assert_safe_chain(target)
            if target.exists():
                if _is_link_or_reparse(target) or not target.is_file():
                    raise UnsafePathError("refusing to remove unsafe artifact target")
                target.unlink()

    def list_status(self) -> list[dict[str, object]]:
        return [self.status(artifact_id) for artifact_id in sorted(self.manifest.artifacts)]

    def cleanup_temporaries(self) -> int:
        with _exclusive_install_lock(self.temp / ".install.lock"):
            _assert_safe_chain(self.temp)
            removed = 0
            for path in self.temp.iterdir():
                if path.name == ".install.lock":
                    if _is_link_or_reparse(path) or not path.is_file():
                        raise UnsafePathError("artifact install lock is unsafe")
                    continue
                if _is_link_or_reparse(path) or not path.is_file() or not path.name.endswith(".part"):
                    raise UnsafePathError("unexpected object in managed temporary directory")
                path.unlink()
                removed += 1
            return removed

    def host_lease_path(self, nonce: str) -> Path:
        if not NONCE_PATTERN.fullmatch(nonce):
            raise UnsafePathError("invalid host lease nonce")
        path = self.temp / f"host-{nonce}.lease"
        _assert_safe_chain(path.parent)
        return path

    def create_host_lease(self, nonce: str, pid: int) -> Path:
        if pid <= 0:
            raise ValueError("host PID must be positive")
        path = self.host_lease_path(nonce)
        if path.exists() or path.is_symlink():
            raise UnsafePathError("host lease already exists")
        with path.open("x", encoding="ascii") as lease:
            lease.write(str(pid))
            lease.flush()
            os.fsync(lease.fileno())
        return path

    def remove_host_lease(self, nonce: str) -> None:
        path = self.host_lease_path(nonce)
        if path.exists() or path.is_symlink():
            if _is_link_or_reparse(path) or not path.is_file():
                raise UnsafePathError("refusing to remove unsafe host lease")
            path.unlink()
