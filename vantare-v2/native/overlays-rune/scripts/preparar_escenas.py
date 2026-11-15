"""Prepara entradas QA desde las escenas GPUI originales; no ejecuta motores.

El plan no es evidencia gráfica. Los PNG se obtienen en el PC de juego cuando
el orquestador dé la hora. No lee perfiles, cuentas ni carpetas del usuario.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess

RUNE_REV = "d5338988a7c1b3377adb60853815b6d0843dae7c"
UI = Path(__file__).resolve().parents[2] / "ui"
MAX_BYTES = 8 * 1024 * 1024


def read_json(path, root):
    path = path.resolve()
    if not path.is_relative_to(root.resolve()) or path.suffix != ".json":
        raise ValueError("La escena y sus fotos deben ser JSON dentro del corpus UI")
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("La escena excede la cota QA de 8 MiB")
    return json.loads(path.read_text(encoding="utf-8"))


def prepare(scenes, root, destination, commit, looks=("eficiencia",), scales=(100, 125, 150), widget="relative"):
    if widget not in ("relative", "standings"):
        raise ValueError("Widget no preparado")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("El plan necesita el commit completo de los motores")
    if not looks or any(look not in ("eficiencia", "vantare") for look in looks):
        raise ValueError("Look desconocido")
    if not scales or any(scale not in (100, 125, 150) for scale in scales):
        raise ValueError("Escala QA desconocida")
    if len(set(looks)) != len(looks) or len(set(scales)) != len(scales):
        raise ValueError("Look o escala repetidos")
    records = read_json(scenes, root)
    if not isinstance(records, list) or not records:
        raise ValueError("El corpus debe contener escenas")
    outputs, entries, seen = {}, [], set()
    for scene in records:
        if not isinstance(scene, dict) or set(scene) != {"name", "snapshot", "layout"}:
            raise ValueError("Formato de escena desconocido; no se ignoran pasos de captura")
        name = scene.get("name", "")
        if not isinstance(name, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9-]{0,63}", name) or name.casefold() in seen:
            raise ValueError("Nombre de escena inválido o repetido")
        seen.add(name.casefold())
        if not isinstance(scene["snapshot"], str) or not isinstance(scene["layout"], dict):
            raise ValueError("Foto o diseño de escena inválidos")
        snapshot = read_json(scenes.parent / scene["snapshot"], root)
        snapshot_bytes = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        snapshot_name = f"snapshot-{hashlib.sha256(snapshot_bytes).hexdigest()}.json"
        outputs[snapshot_name] = snapshot_bytes
        for look in looks:
            layout = copy.deepcopy(scene["layout"])
            instances = layout.get("instances", [])
            if not isinstance(instances, list) or not instances or any(not isinstance(instance, dict)
                    or not isinstance(instance.get("settings"), dict)
                    or instance["settings"].get("kind") != widget for instance in instances):
                raise ValueError("El lote debe contener solo el widget solicitado")
            for instance in instances:
                instance["settings"]["designSystem"] = look
            layout_name = f"{name}-{look}.layout.json"
            layout_bytes = json.dumps(layout, ensure_ascii=False, indent=2).encode("utf-8")
            outputs[layout_name] = layout_bytes
            digest = hashlib.sha256(snapshot_bytes + b"\0" + layout_bytes).hexdigest()
            for scale in scales:
                entries.append({"scene": name, "look": look, "scale": scale / 100,
                    "snapshot": snapshot_name, "layout": layout_name, "input_sha256": digest,
                    "rune_png": f"{name}-{look}-{scale}/rune.png", "gpui_png": f"{name}-{look}-{scale}/gpui.png",
                    "rune_key": f"rune:{commit}:{RUNE_REV}:{digest}:{scale}",
                    "gpui_key": f"gpui:{commit}:{digest}:{scale}"})
    # Validar el lote entero antes de escribir y conservar evidencias anteriores.
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise ValueError("El destino debe estar vacío; no se sobrescriben evidencias")
    destination.mkdir(parents=True, exist_ok=True)
    plan = {"version": 1, "status": "planned-not-captured", "commit": commit, "rune_rev": RUNE_REV, "entries": entries}
    outputs["plan.json"] = (json.dumps(plan, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    report = f"# Capturas {widget} · plan, todavía SIN EJECUTAR\n\n"
    report += f"Commit de ambos motores: `{commit}`. Rune: `{RUNE_REV}`.\n\n"
    report += "Mismos datos y diseño en GPUI/Rune. Solo PC de juego en el horario del orquestador; ningún PNG es PASS hasta capturarlo y revisarlo.\n\n"
    report += "| Escena | Look | Escala | Rune | GPUI | Estado |\n| --- | --- | --- | --- | --- | --- |\n"
    report += "".join(f"| {e['scene']} | {e['look']} | {e['scale']:g} | {e['rune_png']} | {e['gpui_png']} | Pendiente |\n" for e in entries)
    outputs["INDEX.md"] = report.encode("utf-8")
    for name, content in outputs.items():
        # El modo exclusivo impide reemplazar un fichero creado concurrentemente.
        with (destination / name).open("xb") as stream:
            stream.write(content)
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--escenas", type=Path, default=UI / "src/relative/scenes.json")
    parser.add_argument("--widget", choices=("relative", "standings"), default="relative")
    parser.add_argument("--salida", type=Path, required=True)
    parser.add_argument("--look", choices=("eficiencia", "vantare"), action="append")
    args = parser.parse_args()
    commit = subprocess.check_output(["git", "-C", str(UI), "rev-parse", "HEAD"], text=True).strip()
    plan = prepare(args.escenas, UI, args.salida, commit, args.look or ("eficiencia",), widget=args.widget)
    print(f"{len(plan['entries'])} comparaciones preparadas, SIN ejecutar gráfica: {args.salida}")


if __name__ == "__main__":
    main()
