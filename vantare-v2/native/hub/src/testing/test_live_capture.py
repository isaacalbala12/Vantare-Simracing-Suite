"""Windows regression: real ui-quality IPC, one offscreen HWND, PrintWindow, EOF.

Run with --exe <target/debug/examples/ui-quality.exe> --out <external evidence>.
The executable is copied as vantare.exe into an isolated QA peer directory.
No desktop input, real services or credentials are used. Only stdlib is needed.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time


def run(exe, out):
    out = out.resolve()
    repo = Path(__file__).resolve().parents[5]
    if out == repo or repo in out.parents:
        raise ValueError("La evidencia debe quedar fuera del repo")
    out.mkdir(parents=True, exist_ok=False)
    host = out / "vantare.exe"
    shutil.copy2(exe, host)
    policy = dict(version=5, epoch=1, revision=1, checked_at_ms=0,
                  valid_until_ms=None, overlays_advanced=False, catalog="free",
                  engineer=False, strategy=False, analysis=False, calendar=False,
                  tester=False, live=False, error=None)

    def write_replies():
        account = dict(result="Account", signed_in=True,
                       profile=dict(name="QA local", image_url=None, image_jpeg=None),
                       expires_at=int(time.time()) + 3600, pending=False,
                       message="QA local", error=None)
        replies = dict(fresh_policy=True, core_policy=policy,
                       Status=dict(result="Status", account_configured=True, message="QA local"),
                       AccountPoll=account, AccountProfileRefresh=account,
                       LicenseStatus=dict(result="License", policy=policy, message="QA local"))
        temporary = out / "replies.tmp"
        temporary.write_text(json.dumps(replies), encoding="utf-8")
        temporary.replace(out / "replies.json")

    write_replies()
    marker = out / "isolated-turn"
    marker.write_text("orphan-qa-peer", encoding="utf-8")
    expired = time.time() - 901
    os.utime(marker, (expired, expired))
    u = c.WinDLL("user32", use_last_error=True)
    u.SetThreadDpiAwarenessContext.argtypes = [w.HANDLE]
    u.SetThreadDpiAwarenessContext(w.HANDLE(-4))
    u.GetForegroundWindow.restype = w.HWND
    u.GetAncestor.argtypes = [w.HWND, w.UINT]
    u.GetAncestor.restype = w.HWND
    u.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
    u.GetWindowRect.argtypes = [w.HWND, c.POINTER(w.RECT)]
    u.GetWindowLongPtrW.argtypes = [w.HWND, c.c_int]
    u.GetWindowLongPtrW.restype = c.c_ssize_t
    u.IsWindowVisible.argtypes = [w.HWND]
    enum = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    mon = c.WINFUNCTYPE(w.BOOL, w.HANDLE, w.HDC, c.POINTER(w.RECT), w.LPARAM)
    event = c.WINFUNCTYPE(None, w.HANDLE, w.DWORD, w.HWND, c.c_long, c.c_long, w.DWORD, w.DWORD)
    u.EnumDisplayMonitors.argtypes = [w.HDC, c.POINTER(w.RECT), mon, w.LPARAM]
    u.EnumWindows.argtypes = [enum, w.LPARAM]
    u.SetWinEventHook.argtypes = [w.DWORD, w.DWORD, w.HMODULE, event, w.DWORD, w.DWORD, w.DWORD]
    u.SetWinEventHook.restype = w.HANDLE
    u.UnhookWinEvent.argtypes = [w.HANDLE]
    monitors, events, violations, windows = [], [], [], set()

    @mon
    def monitor(_, dc, rect, data):
        r = rect.contents
        monitors.append((r.left, r.top, r.right, r.bottom))
        return True

    if not u.EnumDisplayMonitors(None, None, monitor, 0) or not monitors:
        raise OSError("EnumDisplayMonitors")
    process = None

    def inspect(hwnd, kind):
        pid = w.DWORD()
        u.GetWindowThreadProcessId(hwnd, c.byref(pid))
        if process is None or pid.value != process.pid or u.GetAncestor(hwnd, 2) != hwnd:
            return
        r = w.RECT()
        if not u.GetWindowRect(hwnd, c.byref(r)):
            return
        visible = bool(u.IsWindowVisible(hwnd))
        box = (r.left, r.top, r.right, r.bottom)
        focused = u.GetForegroundWindow() == hwnd
        overlap = any(r.left < m[2] and r.right > m[0] and r.top < m[3] and r.bottom > m[1] for m in monitors)
        style = u.GetWindowLongPtrW(hwnd, -20)
        if visible:
            windows.add(int(hwnd))
        if kind != "poll":
            events.append(dict(event=kind, hwnd=int(hwnd), rect=box, visible=visible,
                               focused=focused, noactivate=bool(style & 0x08000000),
                               toolwindow=bool(style & 0x80)))
        if focused or (visible and overlap):
            violations.append(dict(rect=box, focused=focused, visible=visible))

    @event
    def hook(_, kind, hwnd, obj, child, thread, tick):
        if hwnd and obj == 0 and child == 0:
            inspect(hwnd, kind)

    @enum
    def enumerate_window(hwnd, _):
        inspect(hwnd, "poll")
        return True

    hooks = [u.SetWinEventHook(a, b, None, hook, 0, 0, 0)
             for a, b in [(3, 3), (0x8000, 0x8002), (0x800b, 0x800b)]]
    if not all(hooks):
        raise OSError("SetWinEventHook")

    def pump():
        msg = w.MSG()
        while u.PeekMessageW(c.byref(msg), None, 0, 0, 1):
            u.TranslateMessage(c.byref(msg))
            u.DispatchMessageW(c.byref(msg))
        u.EnumWindows(enumerate_window, 0)
        if violations:
            process.kill()
            raise AssertionError(f"VENTANA EN MONITOR/FOCO: {violations}")

    def until(predicate, timeout=60):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            pump()
            if process.poll() is not None:
                raise AssertionError(f"El banco terminó antes de tiempo: {process.returncode}")
            if predicate():
                return
            # Bounded polling waits for real IPC publication / window readiness.
            time.sleep(.02)
        raise TimeoutError("El banco no alcanzó el estado IPC/ventana esperado")

    def read_revision(revision):
        path = out / "rights-requests.jsonl"
        if not path.exists():
            return False
        # Ignore a final line while the real peer is still writing it.
        lines = path.read_text().splitlines(keepends=True)
        # Two independent reads leave time for the UI's 500 ms policy poll.
        return sum(json.loads(line)["revision"] == revision for line in lines if line.endswith("\n")) >= 2

    try:
        env = os.environ.copy()
        env["VANTARE_CAPTURE_POLICY"] = "ipc"
        env["VANTARE_CAPTURE_TURN_FILE"] = str(marker)
        with (out / "stdout.log").open("w") as stdout, (out / "stderr.log").open("w") as stderr:
            process = subprocess.Popen([str(host), "--qa-root", str(out), "--capture", "engineer-base",
                                        "--qa-size", "1440x900", "--control-stdin"],
                                       stdin=subprocess.PIPE, stdout=stdout, stderr=stderr, env=env,
                                       creationflags=subprocess.CREATE_NO_WINDOW)
            until(lambda: len(windows) == 1 and read_revision(1))
            assert not marker.exists(), "el marcador configurado y caducado debe limpiarse"
            helper = Path(__file__).with_name("capture.ps1")

            def capture(name):
                png = out / name
                child = subprocess.Popen(["pwsh", "-NoProfile", "-File", str(helper),
                                          "-HubProcessId", str(process.pid), "-ExpectedExecutable", str(host),
                                          "-OutputPath", str(png)], stdout=stdout, stderr=stderr,
                                         creationflags=subprocess.CREATE_NO_WINDOW)
                try:
                    end = time.monotonic() + 60
                    while child.poll() is None:
                        pump()
                        if time.monotonic() > end:
                            raise TimeoutError("PrintWindow")
                        time.sleep(.02)
                finally:
                    if child.poll() is None:
                        child.kill()
                        child.wait(timeout=10)
                assert child.returncode == 0 and png.is_file(), "testing/capture.ps1 debe producir PNG"
                return hashlib.sha256(png.read_bytes()).hexdigest()

            first = capture("free.png")
            policy.update(revision=2, catalog="pro", engineer=True, strategy=True,
                          analysis=True, calendar=True, tester=True, overlays_advanced=True)
            write_replies()
            until(lambda: read_revision(2))
            second = capture("pro.png")
            assert first != second, "la captura debe reflejar cambios IPC en el mismo proceso"
            process.stdin.close()
            end = time.monotonic() + 60
            while process.poll() is None:
                pump()
                if time.monotonic() > end:
                    raise TimeoutError("cierre EOF")
                time.sleep(.02)
            assert process.returncode == 0
        assert len(windows) == 1 and not violations
        assert not list(out.glob("*.capture.json")), "IPC live nunca reutiliza caché"
        result = dict(result="PASS", pid=process.pid, processes=1, windows=1,
                      policy_revisions=[1, 2], external_pngs=2, eof_exit=process.returncode,
                      orphan_marker_removed=True,
                      violations=violations, events=events)
        (out / "result.json").write_text(json.dumps(result, indent=2))
        print(json.dumps({k: v for k, v in result.items() if k != "events"}))
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        (out / "window-audit.json").write_text(json.dumps(dict(
            pid=process.pid if process else None, events=events, violations=violations,
            exit_code=process.returncode if process else None), indent=2))
        for handle in hooks:
            u.UnhookWinEvent(handle)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    run(args.exe, args.out)
