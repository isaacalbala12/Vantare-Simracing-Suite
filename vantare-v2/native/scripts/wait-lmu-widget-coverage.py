"""Espera LMU y verifica el catálogo de proyecciones sin iniciar juego ni ventanas.

Solo lee proceso/SHM. No guarda frames, nombres ni respuestas REST. La admisión
real de build, sesión y calidad corresponde después al Core productivo.
"""
import argparse
from collections import Counter
import runpy
import ctypes
from ctypes import wintypes
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import time

SIZE = 324_820
SCORING_BASE = 2_192
SCORING_STRIDE = 584
CATALOG = runpy.run_path(str(Path(__file__).with_name("widget_catalog.py")))



def grid_status(data):
    """Precondición mínima, no reemplaza frame::admit ni presume movimiento."""
    if len(data) != SIZE:
        return {"ready": False, "reason": "short_mapping"}
    count = struct.unpack_from("<i", data, 1736)[0]
    if not 1 <= count <= 104:
        return {"ready": False, "reason": "no_active_grid"}
    players = sum(data[SCORING_BASE + i * SCORING_STRIDE + 196] == 1
                  for i in range(count))
    return {"ready": players == 1, "reason": "grid_ready" if players == 1 else "no_unique_player",
            "cars": count}


class WindowsProbe:
    def __init__(self):
        self.api = ctypes.WinDLL("kernel32", use_last_error=True)
        api = self.api
        api.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
        api.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
        api.CloseHandle.argtypes = [wintypes.HANDLE]
        api.OpenFileMappingW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
        api.OpenFileMappingW.restype = wintypes.HANDLE
        api.MapViewOfFile.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD,
                                     wintypes.DWORD, ctypes.c_size_t]
        api.MapViewOfFile.restype = ctypes.c_void_p
        api.UnmapViewOfFile.argtypes = [ctypes.c_void_p]

    def processes(self):
        class Entry(ctypes.Structure):
            _fields_ = [("size", wintypes.DWORD), ("usage", wintypes.DWORD),
                        ("pid", wintypes.DWORD), ("heap", ctypes.c_size_t),
                        ("module", wintypes.DWORD), ("threads", wintypes.DWORD),
                        ("parent", wintypes.DWORD), ("priority", wintypes.LONG),
                        ("flags", wintypes.DWORD), ("exe", wintypes.WCHAR * 260)]
        api = self.api
        for name in ("Process32FirstW", "Process32NextW"):
            fn = getattr(api, name)
            fn.argtypes = [wintypes.HANDLE, ctypes.POINTER(Entry)]
            fn.restype = wintypes.BOOL
        handle = api.CreateToolhelp32Snapshot(2, 0)
        if handle == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            entry = Entry()
            entry.size = ctypes.sizeof(entry)
            more = api.Process32FirstW(handle, ctypes.byref(entry))
            pids = []
            while more:
                if entry.exe.casefold() == "le mans ultimate.exe":
                    pids.append(entry.pid)
                more = api.Process32NextW(handle, ctypes.byref(entry))
            return pids
        finally:
            api.CloseHandle(handle)

    def status(self):
        pids = self.processes()
        if len(pids) != 1:
            return {"ready": False, "reason": "no_unique_lmu_process"}
        # OpenFileMapping, nunca CreateFileMapping: no crea LMU_Data si no existe.
        handle = self.api.OpenFileMappingW(4, False, "LMU_Data")
        if not handle:
            return {"ready": False, "reason": "no_shm", "game_pid": pids[0]}
        view = None
        try:
            view = self.api.MapViewOfFile(handle, 4, 0, 0, SIZE)
            if not view:
                return {"ready": False, "reason": "unreadable_shm"}
            previous = ctypes.string_at(view, SIZE)
            for _ in range(3):
                current = ctypes.string_at(view, SIZE)
                if previous == current:
                    status = grid_status(current)
                    # Rechazar la salida/cambio de proceso durante la lectura.
                    if self.processes() != pids:
                        return {"ready": False, "reason": "process_changed"}
                    return dict(status, game_pid=pids[0])
                previous = current
            return {"ready": False, "reason": "unstable_shm"}
        finally:
            if view:
                self.api.UnmapViewOfFile(view)
            self.api.CloseHandle(handle)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def write_summary(path, summary):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def result_from_log(text, returncode):
    checks = re.findall(r"^([a-z-]+): demanda y proyección por pipe preservadas\s*$",
                        text, re.MULTILINE)
    covered = set(checks)
    expected = CATALOG["source_catalog"]()
    configurations = CATALOG["live_configurations"]()
    # Un filtro mal escrito que ejecuta cero tests nunca es PASS.
    passed = (returncode == 0 and "1 passed; 0 failed" in text
              and Counter(checks) == Counter(configurations))
    return {"passed": passed, "returncode": returncode, "widget_checks": len(checks),
            "covered_widgets": sorted(covered), "missing_widgets": sorted(set(expected) - covered),
            "expected_widgets": len(expected), "expected_checks": len(configurations)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-dir", required=True, type=Path)
    parser.add_argument("--test-bin", required=True, type=Path)
    parser.add_argument("--log-dir", required=True, type=Path)
    parser.add_argument("--buzon", type=Path)
    parser.add_argument("--check-only", action="store_true", help="solo sondear, sin iniciar QA")
    args = parser.parse_args()
    probe = WindowsProbe()
    if args.check_only:
        print(json.dumps(probe.status()))
        return 0
    import msvcrt  # Windows; el lock se libera incluso si muere el supervisor.
    directory = args.log_dir.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "waiter.lock").open("a+b") as lock:
        lock.seek(0)
        if (directory / "waiter.lock").stat().st_size == 0:
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise RuntimeError("ya hay un supervisor para este log-dir") from None
        return wait_and_run(args, probe, directory)


def wait_and_run(args, probe, directory):
    repo = Path(__file__).resolve().parents[2]
    if (directory / "verification.log").exists():
        raise RuntimeError("este log-dir ya contiene una verificación; usar uno nuevo")
    core = args.target_dir.resolve() / "debug/vantare-core.exe"
    test = args.test_bin.resolve()
    hashes = {str(path): digest(path) for path in (core, test)}
    summary = {"state": "waiting", "waiter_pid": os.getpid(), "started_at": now(),
               "binary_sha256": hashes, "log": str(directory / "verification.log"),
               "stop_file": str(directory / "STOP")}
    summary_path = directory / "summary.json"
    write_summary(summary_path, summary)
    with (directory / "waiter.log").open("a", encoding="utf-8", buffering=1) as log:
        def report(message):
            log.write(f"{now()} {message}\n")
        def mailbox(message):
            if args.buzon:
                with args.buzon.open("a", encoding="utf-8") as output:
                    output.write(f"{message}\n")
        report("WAITING: proceso LMU + SHM con parrilla/jugador; no iniciar juego")
        previous = None
        confirmed = None
        try:
            while True:
                if (directory / "STOP").exists():
                    summary.update(state="cancelled", finished_at=now())
                    write_summary(summary_path, summary)
                    report("CANCELLED: archivo STOP")
                    return 2
                status = probe.status()
                status["measurement_lock"] = Path("C:/tmp/buzon/pc-medicion.lock").exists()
                summary.update(last_probe_at=now(), probe=status)
                write_summary(summary_path, summary)
                if status != previous:
                    report(json.dumps(status))
                    previous = status
                blocked = status["measurement_lock"]
                identity = (status.get("game_pid"), status.get("cars"))
                if status["ready"] and not blocked and confirmed == identity:
                    break
                confirmed = identity if status["ready"] and not blocked else None
                time.sleep(5)
            for path, expected in hashes.items():
                if digest(Path(path)) != expected:
                    raise RuntimeError("binarios modificados mientras se esperaba; preparar de nuevo")
            summary.update(state="running", verification_started_at=now())
            write_summary(summary_path, summary)
            report("RUNNING: sesión candidata lista; verificar con Core productivo")
            environment = os.environ.copy()
            environment["PYTHONIOENCODING"] = "utf-8"
            command = [sys.executable, "-I", "-X", "utf8", str(repo / "native/scripts/verify-lmu-widget-coverage.py"),
                       "--target-dir", str(args.target_dir.resolve()), "--test-bin", str(test)]
            with (directory / "verification.log").open("w", encoding="utf-8") as output:
                result = subprocess.run(command, cwd=repo, env=environment, stdout=output,
                                        stderr=subprocess.STDOUT, timeout=240,
                                        creationflags=subprocess.CREATE_NO_WINDOW, check=False)
            outcome = result_from_log((directory / "verification.log").read_text(encoding="utf-8"),
                                      result.returncode)
            summary.update(outcome, state="passed" if outcome["passed"] else "failed",
                           finished_at=now())
            write_summary(summary_path, summary)
            report(summary["state"].upper())
            mailbox(f"{'FIN' if outcome['passed'] else 'BLOQUEO'} FASE B: "
                    f"{summary['state']}; {outcome['widget_checks']} comprobaciones, "
                    f"{len(outcome['covered_widgets'])}/{outcome['expected_widgets']} widgets; resumen {summary_path}. "
                    "No acredita formación/salida ni todas las señales opcionales.")
            return 0 if outcome["passed"] else 1
        except Exception as error:
            summary.update(state="failed", error=str(error), finished_at=now())
            write_summary(summary_path, summary)
            report(f"FAILED: {error}")
            mailbox(f"BLOQUEO FASE B: supervisor falló; resumen {summary_path}")
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
