"""QA física opt-in #1638, sin ventanas ni datos/instalación de Isaac.

Desde vantare-v2: python -I native/scripts/verify-lmu-widget-coverage.py
Requiere build previo de vantare-runtime en el target indicado.
No arranca/controla LMU ni graba snapshots. Pausa/garaje/parado son válidos.
"""
import argparse
import os
import pathlib
import subprocess
import tempfile
import json


def offline(recording, target, output, test_bin=None):
    """Archivo -> Replay/Translator/Core -> DTO estricto -> 18 Widget::ingest."""
    output.mkdir(parents=True, exist_ok=False)
    producer = target / "release/vantare-verificar-lmu.exe"
    test = "offline_coverage::recorded_dtos_reach_all_widgets"
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    candidates = [test_bin] if test_bin else sorted((target / "debug/deps").glob("vantare_ui-*.exe"),
                                                  key=lambda file: file.stat().st_mtime, reverse=True)
    consumer = None
    for candidate in candidates:
        listed = subprocess.run([str(candidate), test, "--list", "--exact"],
                                capture_output=True, text=True, creationflags=flags, timeout=30)
        if listed.returncode == 0 and f"{test}: test" in listed.stdout.splitlines():
            consumer = candidate
            break
    if not producer.is_file() or not consumer:
        raise RuntimeError("faltan los binarios QA offline en el target propio")
    children = []
    try:
        with (output / "verification.log").open("wb") as log:
            source = subprocess.Popen([str(producer), str(recording.resolve()),
                                       str(output / "telemetry.json")],
                                      stdout=subprocess.PIPE, stderr=log, creationflags=flags)
            children.append(source)
            environment = os.environ.copy()
            environment["VANTARE_1638_OFFLINE_REPORT"] = str(output / "widgets.json")
            widgets = subprocess.Popen([str(consumer), test, "--ignored", "--exact", "--nocapture"],
                                       stdin=source.stdout, stdout=log, stderr=log,
                                       creationflags=flags, env=environment)
            children.append(widgets)
            source.stdout.close()
            source_code = source.wait(timeout=6 * 3600)
            widgets_code = widgets.wait(timeout=60)
        report = {"source_exit": source_code, "widgets_exit": widgets_code,
                  "status": "failed", "physical_live_qa": False}
        if source_code == 0 and widgets_code == 0:
            telemetry = json.loads((output / "telemetry.json").read_text())
            projections = json.loads((output / "widgets.json").read_text())
            widgets = projections["widgets"]
            expected = {"standings", "relative", "radar", "pedals", "delta",
                        "car-damage-visual", "car-damage-numbers", "input-telemetry",
                        "multiclass-relative", "broadcast-tower", "delta-trace",
                        "track-map", "track-weather", "head-to-head", "fuel-strategy",
                        "pedals-telemetry", "racing-flags", "fastest-lap"}
            if {widget["widget"] for widget in widgets} != expected or len(widgets) != 18:
                raise RuntimeError("informe incompleto: no contiene exactamente los 18 widgets")
            if projections["photos"] != telemetry["photos"] or telemetry["photos"] == 0:
                raise RuntimeError("fotos perdidas entre Core y widgets")
            timing = {"started_at_s", "finished_at_s", "scheduled_end_s", "start_phase",
                      "distance_to_start_line_m", "next_kind", "next_starts_at_s"}
            if set(telemetry["session_alerts"]) != timing:
                raise RuntimeError("faltan campos de Avisos en el informe")
            report.update(status="evaluated_pending_coverage_review", widgets=18,
                          photos=telemetry["photos"], session_alerts=telemetry["session_alerts"],
                          adapter_or_core_rejections=telemetry["adapter_or_core_rejections"])
        (output / "summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 0 if report["status"] == "evaluated_pending_coverage_review" else 1
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.kill()
                child.wait()


def main():
    repo = pathlib.Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-dir", required=True, type=pathlib.Path)
    parser.add_argument("--test-bin", type=pathlib.Path,
                        help="test UI ya compilado; no compilar mientras Isaac espera")
    parser.add_argument("--recording", type=pathlib.Path,
                        help="QA offline del archivo completo .lmu.gz; no abre LMU ni sockets")
    parser.add_argument("--output-dir", type=pathlib.Path,
                        help="carpeta nueva para logs e informes offline")
    args = parser.parse_args()
    target = args.target_dir.resolve()
    if args.recording:
        if not args.output_dir:
            parser.error("--recording necesita --output-dir (carpeta nueva)")
        return offline(args.recording, target, args.output_dir.resolve(),
                       args.test_bin.resolve() if args.test_bin else None)
    test_bin = args.test_bin.resolve() if args.test_bin else None
    if test_bin and (not test_bin.is_file() or test_bin.parent != target / "debug/deps"
                     or not test_bin.name.startswith("vantare_ui-") or test_bin.suffix != ".exe"):
        raise RuntimeError("--test-bin debe ser un test vantare_ui del target propio")
    core = target / "debug/vantare-core.exe"
    if pathlib.Path("C:/tmp/buzon/pc-medicion.lock").exists():
        raise RuntimeError("medición ajena en curso; no iniciar procesos QA")
    if not core.is_file():
        raise RuntimeError("compilar primero vantare-runtime por la cola en --target-dir")
    data = pathlib.Path(tempfile.mkdtemp(prefix="1638-live-coverage-", dir="C:/tmp"))
    pipe = f"vantare-1638-coverage-{os.getpid()}"
    # El núcleo nunca hereda tokens ni rutas de producto del usuario.
    environment = {key: value for key, value in os.environ.items() if key.upper() in {
        "SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT",
        "TEMP", "TMP", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS",
    }}
    environment.update({key: str(data) for key in (
        "VANTARE_NATIVE_DATA_ROOT", "LOCALAPPDATA", "APPDATA", "USERPROFILE",
    )})
    child = subprocess.Popen(
        [str(core), "--live", "--simulator", "lmu", "--pipe", pipe],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env=environment, creationflags=subprocess.CREATE_NO_WINDOW,
    )
    try:
        test_environment = os.environ.copy()
        test_environment.update(
            CARGO_BUILD_JOBS=os.environ.get("CARGO_BUILD_JOBS", "2"),
            VANTARE_NATIVE_DATA_ROOT=str(data),
            VANTARE_1638_LIVE_PIPE=pipe, VANTARE_1638_CORE_IMAGE=str(core),
        )
        command = [
            "pwsh", "-NoProfile", "-File", "native/scripts/compilar.ps1",
            "cargo", "test", "--manifest-path", "native/Cargo.toml", "-p", "vantare-ui",
            "--lib", "--features", "vantare-services/network", "--locked", "--offline",
            "--target-dir", str(target), "-j", test_environment["CARGO_BUILD_JOBS"], "demand::tests::live_lmu_photos_preserve_every_widget_projection",
            "--", "--ignored", "--exact", "--nocapture",
        ]
        if test_bin:
            command = [str(test_bin),
                       "demand::tests::live_lmu_photos_preserve_every_widget_projection",
                       "--ignored", "--exact", "--nocapture"]
        return subprocess.call(command, cwd=repo, env=test_environment,
                               creationflags=subprocess.CREATE_NO_WINDOW, timeout=180)
    finally:
        child.stdin.close()  # EOF es la cancelación ordenada del Core productivo.
        try:
            child.wait(timeout=15)
        except subprocess.TimeoutExpired:
            child.kill()  # Solo este proceso QA que acabamos de crear.
            child.wait()


if __name__ == "__main__":
    raise SystemExit(main())
