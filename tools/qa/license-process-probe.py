"""Windows process smoke probe for VANTA-126; does not claim licensing E2E.

Only accepts binaries, checkout and fresh data beneath the dedicated QA root.
No OAuth, purchasing, logout, device reset or external HTTP is attempted.
Build the unchanged nightly sources with the public RFC8032 fixture key first.
"""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import queue
import struct
import subprocess
import sys
import threading
import time
import uuid

QA = Path("D:/VantareServer/qa/licencias-e2e").resolve()


def under_qa(value):
    path = Path(value).resolve(strict=True)
    if not path.is_relative_to(QA):
        raise ValueError("path outside dedicated QA root")
    return path


def wait_until(predicate, child, timeout=15):
    # Poll an observable startup barrier, never advance a licensing clock.
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if child.poll() is not None:
            raise RuntimeError("child exited before startup barrier")
        if predicate():
            return
        time.sleep(0.02)
    raise TimeoutError("startup barrier")


def stop(child):
    child.stdin.close()
    try:
        code = child.wait(timeout=8)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
        raise RuntimeError("child required forced termination")
    if code != 0:
        raise RuntimeError(f"child exit {code}")


def read_exact(pipe, count):
    data = bytearray()
    while len(data) < count:
        part = pipe.read(count - len(data))
        if not part:
            raise EOFError("IPC frame")
        data.extend(part)
    return bytes(data)


def services_probe(bins, env, root, output):
    pipe_id = f"vanta126-qa-services-{uuid.uuid4().hex}"
    pipe_name = rf"\\.\pipe\{pipe_id}"
    with (output / "services.stderr.log").open("wb") as log:
        child = subprocess.Popen(
            [str(bins / "vantare-services.exe"), pipe_id, str(os.getpid()),
             sys.executable, str(root / "services")],
            env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW)
        watchdog = threading.Timer(45, child.kill)
        watchdog.start()
        connected = None
        try:
            nonce_queue = queue.Queue()
            threading.Thread(target=lambda: nonce_queue.put(child.stdout.readline()),
                             daemon=True).start()
            nonce = nonce_queue.get(timeout=15).decode("ascii").strip()
            if len(nonce) != 64:
                raise RuntimeError("invalid private handshake")
            wait_until(lambda: ctypes.windll.kernel32.WaitNamedPipeW(pipe_name, 50), child)
            connected = open(pipe_name, "r+b", buffering=0)
            results = []
            for seq, command in enumerate(["Status", "AccountPoll", "Shutdown"], 1):
                data = json.dumps({"version": 19, "sequence": seq, "nonce": nonce,
                                   "command": {"command": command}}).encode()
                connected.write(struct.pack("<I", len(data)) + data)
                length = struct.unpack("<I", read_exact(connected, 4))[0]
                if not 0 < length <= 128 * 1024:
                    raise RuntimeError("invalid IPC frame size")
                reply = json.loads(read_exact(connected, length))
                if reply["sequence"] != seq or reply["version"] != 19:
                    raise RuntimeError("IPC envelope mismatch")
                body = reply["reply"]
                # Never write the handshake or arbitrary IPC fields to evidence.
                results.append({"command": command, "result": body["result"],
                                "account_configured": body.get("account_configured")})
                if command == "Status":
                    if body.get("account_configured") is not False:
                        raise RuntimeError("probe requires an unconfigured account build")
            assert results[0]["account_configured"] is False
            assert results[-1]["result"] == "Closed"
            return results
        finally:
            watchdog.cancel()
            if connected:
                connected.close()
            stop(child)


def core_probe(bins, checkout, env, root, output):
    namespace = hashlib.sha256(b"core-rights-v1").hexdigest()
    store = root / "Vantare/native/rights/nightly" / namespace
    store.mkdir(parents=True)
    (store / "authority.dpapi").write_bytes(b"VANTA-126 synthetic damaged store")
    observations = []
    for attempt in range(2):
        log_path = output / f"core-{attempt}.stderr.log"
        pipe_id = f"vanta126-qa-core-{uuid.uuid4().hex}"
        with log_path.open("wb") as log:
            child = subprocess.Popen(
                [str(bins / "vantare-core.exe"), "--replay",
                 str(checkout / "vantare-v2/testdata/lmu-fixture.bin"),
                 "--build", "1.3.0.0", "--pipe",
                 pipe_id],
                env=env, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                # The second startup must actually restore the durable document,
                # rather than satisfy a barrier left behind by the first process.
                wait_until(lambda: (store / "authority-recovery.dpapi").exists()
                           and any(store.glob("authority*.corrupt*")), child)
                wait_until(lambda: ctypes.windll.kernel32.WaitNamedPipeW(
                    rf"\\.\pipe\{pipe_id}", 50), child)
                observations.append({"restart": attempt,
                                     "alive": child.poll() is None,
                                     "recovery_guard_exists": True})
            finally:
                stop(child)
    archives = list(store.glob("authority*.corrupt*"))
    assert len(archives) == 1, "restart must not repeatedly quarantine healthy authority"
    assert not (store / "binding.dpapi").exists(), "damage must not manufacture a binding"
    assert b"license-authority-unreadable" in (output / "core-0.stderr.log").read_bytes()
    assert b"license-authority-unreadable" not in (output / "core-1.stderr.log").read_bytes()
    return {"restarts": observations, "quarantine_copies": len(archives),
            "files": sorted(path.name for path in store.iterdir())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", required=True)
    parser.add_argument("--checkout", required=True)
    parser.add_argument("--qa-root", required=True)
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("Windows only")
    bins, checkout, base = map(under_qa, [args.bin_dir, args.checkout, args.qa_root])
    root = base / ("process-probe-" + uuid.uuid4().hex)
    root.mkdir()
    output = root / "evidence"
    output.mkdir()
    env = {key: value for key, value in os.environ.items()
           if not key.startswith("VANTARE_")}
    env.update(VANTARE_NATIVE_DATA_ROOT=str(root), LOCALAPPDATA=str(root / "local"),
               APPDATA=str(root / "roaming"), TEMP=str(root / "tmp"), TMP=str(root / "tmp"))
    for name in ["LOCALAPPDATA", "APPDATA", "TEMP"]:
        Path(env[name]).mkdir(exist_ok=True)
    result = {"passed": False, "scope": "real processes; no configured remote account; not E2E",
              "qa_root": str(root), "binaries": {}}
    try:
        for name in ["vantare", "vantare-core", "vantare-services"]:
            binary = bins / (name + ".exe")
            version = subprocess.run([str(binary), "--version"], env=env,
                                     capture_output=True, text=True, timeout=15, check=True)
            result["binaries"][name] = {"sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
                                         "version": version.stdout.strip()}
        result["services"] = services_probe(bins, env, root, output)
        result["core_store"] = core_probe(bins, checkout, env, root, output)
        result["passed"] = True
    finally:
        (output / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(output)


if __name__ == "__main__":
    main()
