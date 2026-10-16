"""QA #1638 sin ventanas: grabación offline o smoke live opt-in histórico.

Desde vantare-v2: python -I native/scripts/verify-lmu-widget-coverage.py
--recording reproduce un .lmu.gz por el adapter/Core y todo el catálogo de widgets.
Requiere binarios previos en el target propio; no arranca ni controla LMU.
"""
import argparse
import os
import pathlib
import subprocess
import tempfile
import json
import runpy

source_catalog = runpy.run_path(str(pathlib.Path(__file__).with_name("widget_catalog.py")))["source_catalog"]


def recording_scope(scope):
    limits = {"recording_scope": scope, "coverage_certified": False}
    if scope == "practice-only":
        limits["not_covered_by_recording"] = [
            "reliable_session_start", "reliable_session_end", "qualifying",
            "race", "formation_lap", "race_start", "next_session_schedule",
        ]
        limits["scope_note"] = (
            "Solo práctica. Terminar una grabación parcial no demuestra el final de la sesión."
        )
    return limits


def readable_report(telemetry, projections, scope):
    lines = ["# Revisión offline de telemetría LMU", "",
             f"Alcance declarado: `{scope}`. Fotos procesadas: {telemetry['photos']}.", "",
             "Sesiones admitidas por el adaptador: " + ", ".join(telemetry.get("sessions", {})) + ".", "",
             "Se comprueba recepción y proyección; no certifica todas las señales ni la pantalla.",
             "Las calidades por campo y sesión están en widgets.json; los errores e inventario REST en telemetry.json.", "",
             "Estados de fuente: " + json.dumps(projections.get("source_state_counts", {})) + ".",
             "Los datos caducados no acreditan señales actuales. La recuperación exige avance sostenido; no se relajan los límites de frescura.", "",
             "projection_changes cuenta retornos true de ingest (cambios solicitados); cero no significa falta de recepción.", "",
             "| Widget | Fotos | Cambios solicitados | Evidencia que revisar |", "| --- | ---: | ---: | --- |"]
    motion = projections.get("motion_evidence", {})
    moving = motion.get("opponent_moving_samples", 0) > 0
    speed = motion.get("player_speed_mps", {})
    laps = motion.get("player_completed_laps", {})
    inputs = motion.get("player_inputs", {})
    # El SDK conserva ruido ~1e-7 m/s con el coche parado. Se mantienen los
    # valores originales: el mismo umbral de 0,1 m/s usado para IA solo
    # clasifica evidencia, nunca cambia calidad ni valores de telemetría.
    stationary = (speed.get("reliable_samples", 0) > 0
                  and 0 <= speed.get("min", -1) <= speed.get("max", -1) <= 0.1
                  and laps.get("reliable_samples", 0) > 0
                  and laps.get("min") == laps.get("max") == 0
                  and set(inputs) == {"throttle", "brake", "clutch", "steering"}
                  and all(value.get("reliable_samples", 0) > 0
                          and value.get("min") == value.get("max") == 0
                          for value in inputs.values()))
    grid = {"standings", "relative", "radar", "multiclass-relative",
            "broadcast-tower", "head-to-head", "fastest-lap"}
    for widget in projections["widgets"]:
        name = widget["widget"]
        note = "Recepción/proyección; no certificada"
        if name == "fastest-lap" and widget["projection_changes"] == 0:
            note = "Sin aviso nuevo observado; recibir tiempos no acredita notificación de récord"
        elif name in grid and moving:
            note = "Parrilla/IA en movimiento; revisar calidades, faltantes y caducidad"
        elif name == "track-map":
            note = "Poses no acreditan mapa: hace falta geometría productiva de pista"
        elif name == "track-weather":
            note = "Clima real; no acredita presión, rumbo geográfico ni pronóstico"
        elif name == "racing-flags":
            note = "Solo banderas observadas; sin cobertura de salida/formación"
        elif stationary:
            note = "Solo estructura del jugador parado; dinámica pendiente"
        lines.append(f"| {name} | {widget['photos_evaluated']} | {widget['projection_changes']} | {note} |")
    if motion:
        lines += ["", "## Movimiento observado en el DTO", "",
                  f"IA/rivales: {motion['moving_opponent_ids']} identidades con velocidad fiable >0,1 m/s; máximo {motion['opponents_max_speed_mps']:.3f} m/s.",
                  f"Jugador: velocidad fiable mín./máx. {speed.get('min')}/{speed.get('max')} m/s ({speed.get('reliable_samples', 0)} fotos).",
                  "Vueltas completadas del jugador: " + json.dumps(motion["player_completed_laps"]) + ".",
                  "Inputs del jugador: " + json.dumps(motion["player_inputs"]) + ".",
                  "Son fotos del DTO, no muestras independientes del simulador. Stale/Estimated no cuentan como evidencia de movimiento."]
        if stationary:
            lines += ["Velocidad <=0,1 m/s, cero vueltas e inputs: compatible con coche parado; se conserva cualquier ruido numérico en los valores originales.",
                      "El jugador no aporta conducción verificada. Pedales, trazas, delta, consumo, estrategia y evolución de daños quedan sin validación dinámica."]
    lines += ["", "| Avisos: campo | Calidades observadas | Alcance de la comprobación |",
              "| --- | --- | --- |"]
    for field, counts in telemetry["session_alerts"].items():
        note = "Pendiente de revisión de transiciones reales"
        if scope == "practice-only":
            note = "No validado: falta captura de clasificación/carrera"
            if field == "scheduled_end_s":
                note = "Fin programado de práctica; no confirma fin real"
            elif field == "distance_to_start_line_m":
                note = "Dato longitudinal en práctica; no valida formación ni posición de salida"
        qualities = ", ".join(f"{key}: {value}" for key, value in counts.items())
        lines.append(f"| {field} | {qualities} | {note} |")
    if scope == "practice-only":
        lines += ["", "La práctica no acredita inicio/fin fiables de sesión, clasificación, carrera,",
                  "formación, salida ni agenda de próxima sesión. Los valores observados no sustituyen",
                  "esas situaciones. No se infiere fin de sesión al parar una grabación parcial."]
    return "\n".join(lines) + "\n"


def validate_widget_catalog(projections, expected=None):
    """Contrasta el Kind::ALL exportado con el registro fuente independiente."""
    expected = source_catalog() if expected is None else expected
    exported = projections.get("widget_catalog")
    if (not isinstance(exported, list) or not exported
            or any(not isinstance(name, str) or not name for name in exported)
            or len(set(exported)) != len(exported)
            or set(exported) != set(expected)):
        raise RuntimeError("catálogo del binario distinto del fuente; recompilar el consumidor QA")
    widgets = projections["widgets"]
    actual = [widget["widget"] for widget in widgets]
    if set(actual) != set(expected) or len(actual) != len(expected):
        raise RuntimeError("informe incompleto: widgets ausentes, extra o duplicados")
    return len(expected)


def offline(recording, target, output, test_bin=None, scope="unspecified"):
    """Archivo -> Replay/Translator/Core -> DTO estricto -> Kind::ALL -> Widget::ingest."""
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
        report.update(recording_scope(scope))
        if source_code == 0 and widgets_code == 0:
            telemetry = json.loads((output / "telemetry.json").read_text(encoding="utf-8"))
            projections = json.loads((output / "widgets.json").read_text(encoding="utf-8"))
            widget_count = validate_widget_catalog(projections)
            if projections["photos"] != telemetry["photos"] or telemetry["photos"] == 0:
                raise RuntimeError("fotos perdidas entre Core y widgets")
            timing = {"started_at_s", "finished_at_s", "scheduled_end_s", "start_phase",
                      "distance_to_start_line_m", "next_kind", "next_starts_at_s"}
            if set(telemetry["session_alerts"]) != timing:
                raise RuntimeError("faltan campos de Avisos en el informe")
            report.update(status="evaluated_pending_coverage_review", widgets=widget_count,
                          photos=telemetry["photos"], session_alerts=telemetry["session_alerts"],
                          motion_evidence=projections.get("motion_evidence"),
                          adapter_or_core_rejections=telemetry["adapter_or_core_rejections"])
            (output / "report.md").write_text(readable_report(telemetry, projections, scope), encoding="utf-8")
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
    parser.add_argument("--recording-scope", choices=("unspecified", "practice-only", "weekend"),
                        default="unspecified", help="situaciones que la grabación permite revisar")
    args = parser.parse_args()
    target = args.target_dir.resolve()
    if args.recording:
        if not args.output_dir:
            parser.error("--recording necesita --output-dir (carpeta nueva)")
        return offline(args.recording, target, args.output_dir.resolve(),
                       args.test_bin.resolve() if args.test_bin else None, args.recording_scope)
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
