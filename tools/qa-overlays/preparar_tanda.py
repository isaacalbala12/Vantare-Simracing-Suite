"""Empaqueta entradas guardadas; no interpreta LMU ni ejecuta motores/GPU."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


SOURCE_SHA = "fb2e2e520be96b59066e2a69c3899cf9842a0752"
PRESENTMON_SHA = "b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af"
# Tamaños son orientativos del plan; se exige igualdad del tamaño real de ambos PNG.
# No se redimensiona la salida para superar el diff.
SCENES = {
    "delta-trace": ("delta-trace-design-system.sequence.json", (760, 192)),
    "car-damage-visual": ("car-damage-visual-design-system.sequence.json", (200, 272)),
    "track-map": ("track-map-design-system.sequence.json", (320, 248)),
    "radar": ("radar-design-system.sequence.json", (220, 220)),
    "relative": ("relative-vantare.scene.json", (420, 193)),
    "multiclass-relative": ("multiclass-relative-design-system.sequence.json", (440, 245)),
    "fuel-strategy": ("fuel-vantare.scene.json", (300, 204)),
    "pedals": ("pedals-design-system.sequence.json", (96, 160)),
    "broadcast-tower": ("broadcast-tower-overtake-sequence.scene.json", (1400, 56)),
    "head-to-head": ("head-to-head.snapshot.json", (780, 72)),
    "fastest-lap": ("fastest-lap-alert.scene.json", (480, 104)),
    "pedals-telemetry": ("pedals-telemetry-design-system.sequence.json", (380, 64)),
    "input-telemetry": ("input-telemetry.sequence.json", (600, 84)),
    "track-weather": ("track-weather-design-system.sequence.json", (280, 210)),
    "racing-flags": ("racing-flags-design-system.sequence.json", (340, 88)),
    "session-alerts": ("session-alerts-default.scene.json", (480, 88)),
    "car-damage-numbers": ("car-damage-visual-design-system.sequence.json", (164, 132)),
    "standings": ("standings-functional-combined.scene.json", None),
    "delta": ("delta-vantare.scene.json", (150, 36)),
}


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def photos(value):
    if isinstance(value, list):
        result = value
    elif isinstance(value, dict) and "frames" in value:
        result = [frame["snapshot"] for frame in value["frames"]]
    else:
        result = [value]
    if not result or len(result) > 256 or any(not isinstance(v, dict) or "version" not in v or "state" not in v for v in result):
        raise ValueError("Escena sin fotos explícitas válidas o excede 256 fotos")
    return result


def prefixes(count):
    if count <= 12:
        return list(range(1, count + 1))
    return sorted({value for value in (1, 3, 10, 121, 197, count) if value <= count})


def prepare(repo, output, binary_directory, presentmon, corpus):
    repo, output = Path(repo), Path(output)
    if subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip() != SOURCE_SHA:
        raise ValueError("Base distinta del SHA congelado")
    output.mkdir(parents=True, exist_ok=False)
    (output / "bin").mkdir()
    (output / "inputs").mkdir()
    manifest = {"schema": 1, "source_sha": SOURCE_SHA, "captures": [], "measurements": [],
                "presentmon": {"version": "2.6.0", "repository": "GameTechDev/PresentMon",
                               "url": "https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe",
                               "sha256": PRESENTMON_SHA}, "files": [],
                "measurement": {"warmup_seconds": 5, "central_seconds": 50,
                                "classification": "comparación acotada", "cold_host_each_round": True},
                "limitations": ["Tamaños orientativos: el resultado registra los tamaños PNG reales; jamás redimensionar.",
                                "Capturas asentadas; no acreditan paridad de fase de animaciones.",
                                "Avisos: GPUI no expone wall-ms; conservar esa diferencia y no aprobar paridad temporal.",
                                "Texto: revisión humana separada de las parejas al 100 %, nunca aprobar solo por el porcentaje."]}
    builds = json.loads((Path(binary_directory).parent / "binarios.json").read_text(encoding="utf-8-sig"))
    if not isinstance(builds, list):
        builds = [builds]
    by_name = {row["name"]: row for row in builds}
    for name in ("vantare-overlays-rune.exe", "vantare-overlays.exe", "vantare-core.exe", "vantare-services.exe", "vantare.exe"):
        build = by_name[name.removesuffix(".exe")]
        source_ok = build["source_sha"] == SOURCE_SHA
        if name == "vantare.exe" and build.get("origin") == "GitHub Actions 44006217558":
            source_ok = build["source_sha"] == "8358fdae1a03dda5ac7c47bc8721c5c0c0e1fd0c"
        if not source_ok or build["sha256"] != digest(Path(binary_directory) / name):
            raise ValueError("Binario sin procedencia/hash del SHA congelado")
        shutil.copyfile(Path(binary_directory) / name, output / "bin" / name)
    if "paint-stats" not in by_name["vantare-core"]["features"]:
        raise ValueError("El núcleo necesita la instrumentación existente paint-stats para QPC real")
    lifecycle = json.loads((Path(binary_directory).parent / "lifecycle-binarios.json").read_text(encoding="utf-8-sig"))
    for row in lifecycle["binaries"]:
        name = row["name"]
        if name not in ("lifecycle-harness.exe", "lifecycle-rune-tests.exe") or row["sha256"] != digest(Path(binary_directory) / name):
            raise ValueError("Arnés lifecycle sin hash válido")
        shutil.copyfile(Path(binary_directory) / name, output / "bin" / name)
    if {row["name"] for row in lifecycle["binaries"]} != {"lifecycle-harness.exe", "lifecycle-rune-tests.exe"}:
        raise ValueError("Falta un ejecutable de pruebas lifecycle")
    manifest["lifecycle"] = {**lifecycle, "product_contains_m1_m2": False, "selector": "--overlays-bin", "launcher_build": by_name["vantare"],
                             "tests": 4, "synthetic_core_not_performance": True}
    manifest["builds"] = builds
    manifest["production_rights_configured"] = bool(by_name["vantare-core"]["license_public_keys_configured"])
    if digest(presentmon) != PRESENTMON_SHA:
        raise ValueError("PresentMon no coincide con digest oficial fijado")
    shutil.copyfile(presentmon, output / "bin/PresentMon-2.6.0-x64.exe")
    # Redist ya verificado del kit histórico, cuando se proporcione junto a los exe.
    for dll in Path(binary_directory).glob("*.dll"):
        shutil.copyfile(dll, output / "bin" / dll.name)
    if digest(corpus) != "c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c":
        raise ValueError("Corpus distinto del inventariado")
    shutil.copyfile(corpus, output / "inputs/lmu47-high-rate-60s.tar.gz")
    fixtures = repo / "vantare-v2/native/ui/fixtures"
    for number, (kind, (filename, size)) in enumerate(SCENES.items()):
        source = fixtures / filename
        raw = source.read_bytes()
        canonical = output / source.relative_to(repo)
        canonical.parent.mkdir(parents=True, exist_ok=True)
        if not canonical.exists():
            canonical.write_bytes(raw)
        values = photos(json.loads(raw))
        case_root = output / "inputs" / kind
        case_root.mkdir()
        write_json(case_root / "scene.json", values)
        for index, value in enumerate(values):
            write_json(case_root / f"photo-{index:03}.json", value)
        # GPUI ingest entrega todas las fotos sin reloj inyectado y luego asienta.
        # Los empates de Rune preservan exactamente el mismo orden de updates.
        (case_root / "photos.tsv").write_text("".join(f"0\tphoto-{i:03}.json\n" for i in range(len(values))), encoding="utf-8")
        for count in prefixes(len(values)):
            write_json(case_root / f"scene-p{count}.json", values[:count])
            (case_root / f"photos-p{count}.tsv").write_text("".join(f"0\tphoto-{i:03}.json\n" for i in range(count)), encoding="utf-8")
        for look in ("vantare", "eficiencia"):
            settings = {"kind": kind, "designSystem": look}
            write_json(case_root / f"{look}.settings.json", settings)
            layout = {"version": 1, "instances": [{"id": "qa", "x": 0, "y": 0, "settings": settings}]}
            write_json(case_root / f"{look}.layout.json", layout)
            prefix = f"inputs/{kind}"
            for count in prefixes(len(values)):
                manifest["captures"].append({"id": f"{kind}-{look}-p{count}", "kind": kind, "look": look,
                    "settings": f"{prefix}/{look}.settings.json", "layout": f"{prefix}/{look}.layout.json",
                    "scene": f"{prefix}/scene-p{count}.json", "sequence": f"{prefix}/photos-p{count}.tsv", "scale": 1,
                    "at_ms": 0, "motion": False, "wall_ms": 1767225600000,
                    "expected_size_hint": size, "size_contract": "natural size_for(snapshot); compare actual PNG dimensions",
                    "source_fixture": str(source.relative_to(repo)).replace("\\", "/"), "source_sha256": hashlib.sha256(raw).hexdigest(),
                    "photo_count": count, "source_order_preserved": True})
            motors = ("gpui", "rune") if number % 2 == 0 else ("rune", "gpui")
            for state in ("replay", "waiting"):
                for motor in motors:
                    manifest["measurements"].append({"id": f"{kind}-{look}-{state}-{motor}", "kind": kind,
                        "look": look, "state": state, "motor": motor, "layout": f"{prefix}/{look}.layout.json"})
    # Keep the original sampler tree: imports and guards are shared, not forked.
    scripts = Path(__file__).resolve().parent
    manifest["tools_sha"] = subprocess.check_output(["git", "-C", str(scripts), "rev-parse", "HEAD"], text=True).strip()
    shutil.copytree(scripts, output / "tools/qa-overlays", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(repo / "vantare-v2/native/pruebas-rune/muestreador", output / "vantare-v2/native/pruebas-rune/muestreador", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copyfile(scripts / "TANDA.ps1", output / "TANDA.ps1")
    shutil.copyfile(repo / "vantare-v2/native/ui/diff.py", output / "diff.py")
    provenance = output / "procedencia"
    provenance.mkdir()
    for relative, name in (("native/Cargo.lock", "native.Cargo.lock"),
                           ("native/overlays-rune/Cargo.lock", "rune.Cargo.lock"),
                           ("native/rust-toolchain.toml", "rust-toolchain.toml")):
        shutil.copyfile(repo / "vantare-v2" / relative, provenance / name)
    for file in sorted(output.rglob("*")):
        if file.is_file():
            manifest["files"].append({"path": file.relative_to(output).as_posix(), "sha256": digest(file)})
    manifest["estimated_seconds"] = 65 * len(manifest["measurements"]) + 10 * len(manifest["captures"]) + 1200
    write_json(output / "manifiesto.json", manifest)
    return manifest


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    for arg in ("repo", "output", "binary-directory", "presentmon", "corpus"):
        p.add_argument("--" + arg, required=True)
    a = p.parse_args()
    prepare(a.repo, a.output, a.binary_directory, a.presentmon, a.corpus)
