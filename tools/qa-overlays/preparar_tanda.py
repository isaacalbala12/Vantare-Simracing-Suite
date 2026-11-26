"""Empaqueta entradas guardadas; no interpreta LMU ni ejecuta motores/GPU."""
import argparse
import copy
import hashlib
import json
import os
import re
import shutil
import subprocess
import zipfile
from pathlib import Path


SOURCE_SHA = "fb2e2e520be96b59066e2a69c3899cf9842a0752"
PRESENTMON_SHA = "b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af"
CORPUS_SHA = "c5b827ce1cfa558e732da934f11eb0f83f5dfb9e8a3c793f4d3f65ef8ca2a01c"
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

# Only these five persisted settings expose designSystem/Tone/brandVisible.
# Do not invent a second Look for the fourteen functional widgets.
LOOK_WIDGETS = {"relative", "standings", "fuel-strategy", "pedals", "delta"}
SCENE_ENTRIES = {
    "relative": ("relative", ("asymmetric", "initial-name")),
    "multiclass-relative": ("multiclass_relative", ("same-7-dividers", "other-3-dividers", "all-7-plain")),
    "broadcast-tower": ("broadcast_tower", ("ten-no-weather", "three", "carousel")),
    "head-to-head": ("head_to_head", ("behind",)),
    "standings": ("standings", ("broadcast", "multiclass", "columns-pit", "many-slots")),
}
EXTRA_SCENES = [
    ("delta-trace", "respaldo", "delta-trace.sequence.json", {}, None),
    ("car-damage-visual", "numbers", "car-damage-visual-design-system.sequence.json", {"view": "numbers"}, [1]),
    ("car-damage-visual", "default", "car-damage-visual-default.scene.json", {}, [1]),
    ("track-map", "sebring", "track-map.snapshot.json", {}, [1]),
    ("radar", "nearby", "radar-nearby-traffic.scene.json", {}, [10]),
    ("fuel-strategy", "default", "fuel-strategy-default.scene.json", {}, [1]),
    ("fuel-strategy", "compact", "fuel-vantare.scene.json", {"size": "compact"}, None),
    ("fuel-strategy", "expanded", "fuel-vantare.scene.json", {"size": "expanded"}, None),
    ("pedals", "default", "pedals-default.scene.json", {}, [1]),
    ("pedals", "clutch", "pedals-clutch.scene.json", {}, None),
    ("fastest-lap", "design", "fastest-lap-design-system.sequence.json", {}, None),
    ("pedals-telemetry", "default", "pedals-telemetry-default.scene.json", {}, [1]),
    ("input-telemetry", "default", "input-telemetry-default.scene.json", {}, [1]),
    ("track-weather", "default", "track-weather-default.scene.json", {}, [1]),
    ("track-weather", "vertical", "track-weather-design-system.sequence.json", {"vertical": True}, None),
    ("racing-flags", "stale", "racing-flags-stale.snapshot.json", {}, [1]),
    ("session-alerts", "mini-one", "session-alerts-default.scene.json", {"companionFor": "session-alerts-r4", "miniSize": "m", "miniLimit": 1}, [1, 2, 3, 4, 5]),
    ("session-alerts", "mini-three", "session-alerts-default.scene.json", {"companionFor": "session-alerts-r4", "miniSize": "m", "miniLimit": 3}, [1, 2, 3, 4, 5]),
    ("car-damage-numbers", "sin-datos", "car-damage-numbers-default.scene.json", {"showTyres": True}, [1]),
    ("delta", "cross-zero", "delta-cross-zero.scene.json", {}, None),
    ("head-to-head", "paused", "head-to-head.snapshot.json", {}, [1]),
]


def looks(kind):
    return ("vantare", "eficiencia") if kind in LOOK_WIDGETS else ("funcional",)


def specifications(repo):
    fixtures = repo / "vantare-v2/native/ui/fixtures"
    for kind, (filename, size) in SCENES.items():
        yield {"kind": kind, "name": "base", "source": fixtures / filename,
               "settings": {}, "counts": "prefixes", "size_hint": size, "measure": True}
    for kind, name, filename, settings, counts in EXTRA_SCENES:
        yield {"kind": kind, "name": name, "source": fixtures / filename,
               "settings": settings, "counts": counts, "paused": name == "paused"}
    for kind, (directory, names) in SCENE_ENTRIES.items():
        catalog = repo / "vantare-v2/native/ui/src" / directory / "scenes.json"
        entries = json.loads(catalog.read_text(encoding="utf-8"))
        by_name = {entry["name"]: entry for entry in entries}
        for name in names:
            entry = by_name[name]
            layout = entry["layout"]
            if len(layout["instances"]) != 1:
                raise ValueError("Escena canónica ya no tiene una sola instancia")
            yield {"kind": kind, "name": "catalog-" + name,
                   "source": (catalog.parent / entry["snapshot"]).resolve(),
                   "settings": copy.deepcopy(layout["instances"][0]["settings"]),
                   "counts": None, "catalog": catalog, "catalog_entry": name,
                   "preferences": layout.get("preferences", {})}


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


def copy_tracked_tree(source, output):
    source, output = Path(source), Path(output)
    entries = subprocess.run(["git", "-C", str(source), "ls-files", "-z", "--", "."],
                             check=True, stdout=subprocess.PIPE).stdout
    output.mkdir(parents=True, exist_ok=False)
    for entry in entries.split(b"\0"):
        if not entry:
            continue
        relative = Path(os.fsdecode(entry))
        original = source / relative
        if original.is_symlink() or not original.resolve().is_relative_to(source.resolve()):
            raise ValueError(f"Enlace en los ficheros versionados del kit: {relative}")
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(original, destination)


def select_measurement_preset(rounds):
    configurations = [(kind, look)
                      for kind in ("standings", "relative", "delta", "fuel-strategy", "pedals")
                      for look in ("vantare", "eficiencia")]
    configurations += [("radar", "funcional"), ("track-map", "funcional")]
    selected = {}
    for row in rounds:
        key = (row["kind"], row["look"])
        if key not in configurations:
            continue
        identity = (*key, row["state"], row["motor"])
        if identity in selected:
            raise ValueError(f"Ronda duplicada en el subconjunto: {identity}")
        selected[identity] = row
    ordered = []
    for state in ("replay", "waiting"):
        for key in configurations:
            motors = ("gpui", "rune") if len(ordered) % 4 == 0 else ("rune", "gpui")
            for motor in motors:
                identity = (*key, state, motor)
                if identity not in selected:
                    raise ValueError(f"Falta una ronda del subconjunto: {identity}")
                ordered.append(selected[identity])
    if len(selected) != 48:
        raise ValueError("El subconjunto debe contener exactamente 48 rondas")
    return ordered


def seal_measurement(output, destination):
    output, destination = Path(output).resolve(), Path(destination).resolve()
    if destination.is_relative_to(output):
        raise ValueError("El ZIP y el recibo deben quedar fuera del árbol del kit")
    receipt_path = destination.with_suffix(".receipt.json")
    if receipt_path.exists():
        raise FileExistsError(receipt_path)
    manifest_path = output / "manifiesto.json"
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest["scope"] != "measurement-qa":
        raise ValueError("El recibo de medición requiere un kit de medición QA")
    paths = {row["path"]: row["sha256"] for row in manifest["files"]}
    for raw in paths:
        relative = Path(raw)
        file = output / relative
        if (relative.is_absolute() or ".." in relative.parts or not file.resolve().is_relative_to(output)
                or digest(file) != paths[raw]):
            raise ValueError(f"Input del ZIP no coincide con el manifiesto: {raw}")
    zip_owned = receipt_owned = False
    try:
        with destination.open("xb") as target:
            zip_owned = True
            with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
                bundle.writestr("manifiesto.json", manifest_bytes)
                for relative in sorted(paths):
                    bundle.write(output / relative, relative)
        with receipt_path.open("x", encoding="utf-8") as stream:
            receipt_owned = True
            json.dump({"schema": 1, "zip": destination.name, "zip_sha256": digest(destination),
                       "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(), "source_sha": manifest["source_sha"],
                       "run_id": manifest["ci_artifact"]["run_id"],
                       "ci_receipt_sha256": manifest["ci_artifact"]["receipt_sha256"],
                       "qa_license": manifest["qa_license"], "external_corpus": manifest["external_corpus"]},
                      stream, ensure_ascii=False, indent=2)
            stream.write("\n")
    except BaseException:
        if receipt_owned:
            receipt_path.unlink(missing_ok=True)
        if zip_owned:
            destination.unlink(missing_ok=True)
        raise
    return receipt_path


def prepare(repo, output, binary_directory, presentmon=None, corpus=None, inventory=None, *, visual_sha=None,
            measurement_sha=None, measurement_preset=False):
    repo, output = Path(repo), Path(output)
    if visual_sha and measurement_sha:
        raise ValueError("Elegir un solo alcance para la tanda")
    source_sha = visual_sha or measurement_sha or SOURCE_SHA
    visual = visual_sha is not None
    if subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip() != source_sha:
        raise ValueError("Base distinta del SHA congelado")
    if not visual and not all((presentmon, corpus, inventory)):
        raise ValueError("La medición requiere PresentMon, corpus e inventario")
    output.mkdir(parents=True, exist_ok=False)
    (output / "bin").mkdir()
    (output / "inputs").mkdir()
    manifest = {"schema": 1, "source_sha": source_sha, "captures": [], "measurements": [],
                "presentmon": {"version": "2.6.0", "repository": "GameTechDev/PresentMon",
                               "url": "https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe",
                               "sha256": PRESENTMON_SHA}, "files": [],
                "measurement": {"warmup_seconds": 5, "central_seconds": 50,
                                "classification": "comparación acotada", "cold_host_each_round": True, "requested_host_hz": 15, "racing_flags_hz": 0,
                                "inventory_report": "inputs/INVENTARIO-LMU47-HISTORICO.md",
                                "inventory_basis_sha": "4625463bc6ad15bb86813b49bd70b7259f935415",
                                "inventory_origin": "primer evento grabado, distinto del QPC observe de esta tanda",
                                "not_yet_inventoried_types": ["standings", "delta"]},
                "limitations": ["LMU47: jugador siempre en boxes, combustible constante, sin banderas/delta/daños estructurales/avisos. No acredita carrera variada.",
                                "Matriz histórica de 17 proyecciones adjunta; Standings y Delta se miden sin presumir cobertura de señales.",
                                "Tamaños orientativos: el resultado registra los tamaños PNG reales; jamás redimensionar.",
                                "Capturas asentadas; no acreditan paridad de fase de animaciones.",
                                "Avisos: GPUI no expone wall-ms; conservar esa diferencia y no aprobar paridad temporal.",
                                "Texto: revisión humana separada de las parejas al 100 %, nunca aprobar solo por el porcentaje."]}
    builds = json.loads((Path(binary_directory).parent / "binarios.json").read_text(encoding="utf-8-sig"))
    if not isinstance(builds, list):
        builds = [builds]
    by_name = {row["name"]: row for row in builds}
    required = ["vantare-overlays-rune.exe", "vantare-overlays.exe", "vantare.exe"]
    if visual:
        required += ["lifecycle.exe"]
    else:
        required += ["vantare-core.exe", "vantare-services.exe"]
    if measurement_sha:
        required += ["lifecycle.exe", "vantare-qa-license.exe"]
    for name in required:
        build = by_name[name.removesuffix(".exe")]
        source_ok = build["source_sha"] == source_sha
        if not (visual or measurement_sha) and name == "vantare.exe" and build.get("origin") == "GitHub Actions 44006217558":
            source_ok = build["source_sha"] == "8358fdae1a03dda5ac7c47bc8721c5c0c0e1fd0c"
        if not source_ok or build["sha256"] != digest(Path(binary_directory) / name):
            raise ValueError("Binario sin procedencia/hash del SHA congelado")
        shutil.copyfile(Path(binary_directory) / name, output / "bin" / name)
    if not visual and "paint-stats" not in by_name["vantare-core"]["features"]:
        raise ValueError("El núcleo necesita la instrumentación existente paint-stats para QPC real")
    if visual or measurement_sha:
        receipt = Path(binary_directory).parent / "ci-binarios.json"
        ci = json.loads(receipt.read_text(encoding="utf-8-sig"))
        builds = [by_name[name.removesuffix(".exe")] for name in required]
        if ci["source_sha"] != source_sha or any(str(row.get("run_id")) != str(ci["run_id"]) for row in builds):
            raise ValueError("Los binarios deben venir de un solo run del SHA congelado")
        ci_hashes = {row["file"]: row["sha256"] for row in ci["files"]}
        if any(ci_hashes.get(name) != by_name[name.removesuffix(".exe")]["sha256"] for name in required):
            raise ValueError("Hashes del kit no coinciden con el recibo original de CI")
        if measurement_sha:
            core, cli = by_name["vantare-core"], by_name["vantare-qa-license"]
            key_id, registry_sha = core["license_key_id"], core["license_registry_sha256"]
            if (not re.fullmatch(r"qa-[a-f0-9]{8}", key_id) or not re.fullmatch(r"[a-f0-9]{64}", registry_sha)
                    or ci["license_public_keys_configured"] is not True
                    or ci["core_features"] != ["paint-stats", "qa-license"]
                    or core["features"] != "paint-stats,qa-license" or cli["features"] != "qa-license"
                    or ci["license_key_id"] != key_id or ci["license_registry_sha256"] != registry_sha
                    or ci["qa_license_cli_sha256"] != cli["sha256"]):
                raise ValueError("Licencia QA no coincide con la importación verificada")
            manifest["qa_license"] = {"key_id": key_id, "registry_sha256": registry_sha,
                                      "core_sha256": core["sha256"], "cli_sha256": cli["sha256"]}
        shutil.copyfile(receipt, output / "ci-binarios.json")
        write_json(output / "binarios.json", {"source_sha": source_sha, "run_id": ci["run_id"], "files": builds})
        manifest["ci_artifact"] = {"run_id": ci["run_id"], "name": "qa-kit-" + source_sha,
                                   "receipt": "ci-binarios.json", "receipt_sha256": digest(receipt)}
        lifecycle = {"source_sha": source_sha, "harness": by_name["lifecycle"],
                     "scenarios": ["eof", "restart", "exit-zero", "single"]}
    else:
        lifecycle = json.loads((Path(binary_directory).parent / "lifecycle-binarios.json").read_text(encoding="utf-8-sig"))
        for row in lifecycle["binaries"]:
            name = row["name"]
            if name not in ("lifecycle-harness.exe", "lifecycle-rune-tests.exe") or row["sha256"] != digest(Path(binary_directory) / name):
                raise ValueError("Arnés lifecycle sin hash válido")
            shutil.copyfile(Path(binary_directory) / name, output / "bin" / name)
        if {row["name"] for row in lifecycle["binaries"]} != {"lifecycle-harness.exe", "lifecycle-rune-tests.exe"}:
            raise ValueError("Falta un ejecutable de pruebas lifecycle")
    manifest["lifecycle"] = {**lifecycle, "selector": "--overlays-bin", "launcher_build": by_name["vantare"],
                             "tests": 4, "synthetic_core_not_performance": True}
    manifest["builds"] = builds
    manifest["production_rights_configured"] = not visual and bool(by_name["vantare-core"]["license_public_keys_configured"])
    if visual:
        manifest["scope"] = "visual-lifecycle"
        del manifest["measurement"], manifest["presentmon"]
        del manifest["limitations"][:2]
    else:
        if digest(presentmon) != PRESENTMON_SHA:
            raise ValueError("PresentMon no coincide con digest oficial fijado")
        if digest(corpus) != CORPUS_SHA:
            raise ValueError("Corpus distinto del inventariado")
        shutil.copyfile(presentmon, output / "bin/PresentMon-2.6.0-x64.exe")
        if measurement_sha:
            manifest["scope"] = "measurement-qa"
            manifest["external_corpus"] = {"name": "lmu47-high-rate-60s.tar.gz", "sha256": CORPUS_SHA}
        else:
            shutil.copyfile(corpus, output / "inputs/lmu47-high-rate-60s.tar.gz")
        shutil.copyfile(inventory, output / "inputs/INVENTARIO-LMU47-HISTORICO.md")
    # Redist ya verificado del kit histórico, cuando se proporcione junto a los exe.
    for dll in Path(binary_directory).glob("*.dll"):
        shutil.copyfile(dll, output / "bin" / dll.name)
    for spec in specifications(repo):
        kind = spec["kind"]
        source = spec["source"]
        raw = source.read_bytes()
        canonical = output / source.relative_to(repo)
        canonical.parent.mkdir(parents=True, exist_ok=True)
        if not canonical.exists():
            canonical.write_bytes(raw)
        if "catalog" in spec:
            target = output / spec["catalog"].relative_to(repo)
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copyfile(spec["catalog"], target)
        values = photos(json.loads(raw))
        if spec.get("paused"):
            values = copy.deepcopy(values)
            for value in values:
                value["state"]["source_state"] = "paused"
        counts = prefixes(len(values)) if spec["counts"] == "prefixes" else spec["counts"] or [len(values)]
        if any(count < 1 or count > len(values) for count in counts):
            raise ValueError("Prefijo del plan fuera de la fixture")
        if spec.get("preferences"):
            raise ValueError("Escena con preferencias no trasladables al batch GPUI: revisar contrato antes de capturar")
        directory = f"inputs/{kind}-{spec['name']}"
        case_root = output / directory
        case_root.mkdir()
        for index, value in enumerate(values):
            write_json(case_root / f"photo-{index:03}.json", value)
        for count in counts:
            write_json(case_root / f"scene-p{count}.json", values[:count])
            (case_root / f"photos-p{count}.tsv").write_text("".join(f"0\tphoto-{i:03}.json\n" for i in range(count)), encoding="utf-8")
        for look in looks(kind):
            tones = ("neo", "neutro") if look == "vantare" else ("original",)
            for tone in tones:
                settings = {"kind": kind, **spec["settings"]}
                if "catalog" not in spec and kind in {"relative", "standings", "fuel-strategy", "delta"}:
                    settings.setdefault("contentVersion", 1)
                if kind in LOOK_WIDGETS:
                    settings.update(designSystem=look, style="neo" if tone == "original" else tone, brandVisible=True)
                tag = f"{look}-{tone}"
                settings_name = f"{directory}/{tag}.settings.json"
                layout_name = f"{directory}/{tag}.layout.json"
                write_json(output / settings_name, settings)
                write_json(output / layout_name, {"version": 1, "performance": {"level": "balanced", "widgets": {"qa": 15}}, "instances": [{"id": "qa", "x": 0, "y": 0, "settings": settings}]})
                for count in counts:
                    manifest["captures"].append({"id": f"{kind}-{spec['name']}-{tag}-p{count}", "kind": kind,
                        "look": look, "tone": tone, "content_model": "catalog defaults preserved" if "catalog" in spec else "current defaults", "settings": settings_name, "layout": layout_name,
                        "scene": f"{directory}/scene-p{count}.json", "sequence": f"{directory}/photos-p{count}.tsv", "scale": 1,
                        "at_ms": 0, "motion": False, "wall_ms": values[0]["epoch"] if kind == "session-alerts" else 1767225600000,
                        "expected_size_hint": spec.get("size_hint"), "size_contract": "natural size_for(snapshot); compare actual PNG dimensions",
                        "source_fixture": str(source.relative_to(repo)).replace("\\", "/"), "source_sha256": hashlib.sha256(raw).hexdigest(),
                        "source_catalog": str(spec["catalog"].relative_to(repo)).replace("\\", "/") if "catalog" in spec else None,
                        "source_catalog_entry": spec.get("catalog_entry"), "transform": "state.source_state=paused" if spec.get("paused") else None,
                        "photo_count": count, "source_order_preserved": True})
                if not visual and spec.get("measure") and tone != "neutro":
                    number = list(SCENES).index(kind)
                    motors = ("gpui", "rune") if number % 2 == 0 else ("rune", "gpui")
                    for state in ("replay", "waiting"):
                        for motor in motors:
                            manifest["measurements"].append({"id": f"{kind}-{look}-{state}-{motor}", "kind": kind,
                                "look": look, "state": state, "motor": motor, "layout": layout_name, "effective_host_hz": 0 if kind == "racing-flags" else 15})
    # Native constructors recognize these exact photos; retain the selector too.
    penalty = repo / "vantare-v2/native/ui/fixtures/racing-flags-design-system.penalties.json"
    shutil.copyfile(penalty, output / penalty.relative_to(repo))
    manifest["look_support"] = {kind: list(looks(kind)) for kind in SCENES}
    # Keep the original sampler tree: imports and guards are shared, not forked.
    scripts = Path(__file__).resolve().parent
    manifest["tools_sha"] = subprocess.check_output(["git", "-C", str(scripts), "rev-parse", "HEAD"], text=True).strip()
    copy_tracked_tree(scripts, output / "tools/qa-overlays")
    sampler = Path("vantare-v2/native/pruebas-rune/muestreador")
    copy_tracked_tree(repo / sampler, output / sampler)
    shutil.copyfile(scripts / "TANDA.ps1", output / "TANDA.ps1")
    shutil.copyfile(scripts / "SEGURIDAD_TANDA.ps1", output / "SEGURIDAD_TANDA.ps1")
    shutil.copyfile(scripts / "LICENCIA_TANDA.ps1", output / "LICENCIA_TANDA.ps1")
    shutil.copyfile(repo / "vantare-v2/native/ui/diff.py", output / "diff.py")
    (output / "vantare-v2/native/ui").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(repo / "vantare-v2/native/ui/diff.py", output / "vantare-v2/native/ui/diff.py")
    provenance = output / "procedencia"
    provenance.mkdir()
    for relative, name in (("native/Cargo.lock", "native.Cargo.lock"),
                           ("native/overlays-rune/Cargo.lock", "rune.Cargo.lock"),
                           ("native/rust-toolchain.toml", "rust-toolchain.toml")):
        shutil.copyfile(repo / "vantare-v2" / relative, provenance / name)
        original = output / "vantare-v2" / relative
        original.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / "vantare-v2" / relative, original)
    for file in sorted(output.rglob("*")):
        if file.is_file():
            manifest["files"].append({"path": file.relative_to(output).as_posix(), "sha256": digest(file)})
    if measurement_preset:
        if not measurement_sha:
            raise ValueError("El subconjunto requiere un kit de medición CI")
        manifest["measurements"] = select_measurement_preset(manifest["measurements"])
        manifest["captures"] = []
        manifest["measurement_preset"] = "cita-48"
        manifest["estimated_seconds"] = 65 * len(manifest["measurements"]) + 180
    else:
        manifest["estimated_seconds"] = 65 * len(manifest["measurements"]) + 10 * len(manifest["captures"]) + 1200
    write_json(output / "manifiesto.json", manifest)
    return manifest


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    for arg in ("repo", "output", "binary-directory"):
        p.add_argument("--" + arg, required=True)
    for arg in ("presentmon", "corpus", "inventory", "visual-sha", "measurement-sha", "zip"):
        p.add_argument("--" + arg)
    p.add_argument("--measurement-preset", action="store_true")
    a = p.parse_args()
    if a.zip and not a.measurement_sha:
        p.error("--zip requiere --measurement-sha")
    prepare(a.repo, a.output, a.binary_directory, a.presentmon, a.corpus, a.inventory,
            visual_sha=a.visual_sha, measurement_sha=a.measurement_sha, measurement_preset=a.measurement_preset)
    if a.zip:
        print(seal_measurement(a.output, a.zip))
