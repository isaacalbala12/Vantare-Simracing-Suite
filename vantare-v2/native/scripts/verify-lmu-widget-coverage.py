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


def main():
    repo = pathlib.Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-dir", required=True, type=pathlib.Path)
    target = parser.parse_args().target_dir.resolve()
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
        return subprocess.call([
            "pwsh", "-NoProfile", "-File", "native/scripts/compilar.ps1",
            "cargo", "test", "--manifest-path", "native/Cargo.toml", "-p", "vantare-ui",
            "--lib", "--features", "vantare-services/network", "--locked", "--offline",
            "--target-dir", str(target), "-j", test_environment["CARGO_BUILD_JOBS"], "demand::tests::live_lmu_photos_preserve_every_widget_projection",
            "--", "--ignored", "--exact", "--nocapture",
        ], cwd=repo, env=test_environment)
    finally:
        child.stdin.close()  # EOF es la cancelación ordenada del Core productivo.
        try:
            child.wait(timeout=15)
        except subprocess.TimeoutExpired:
            child.kill()  # Solo este proceso QA que acabamos de crear.
            child.wait()


if __name__ == "__main__":
    raise SystemExit(main())
