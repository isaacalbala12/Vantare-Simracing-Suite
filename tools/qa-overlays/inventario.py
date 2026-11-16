"""Agrupa copias por hash y llama al analizador CPU productivo. No decodifica LMU."""
import csv
import hashlib
import json
import subprocess
import sys
from pathlib import Path


def inventory(binary, candidates, output):
    root = Path(output)
    root.mkdir(parents=True, exist_ok=False)
    groups = {}
    with Path(candidates).open(encoding="utf-8-sig", newline="") as stream:
        for item in csv.DictReader(stream):
            path = Path(item["path"])
            with path.open("rb") as recording:
                hasher = hashlib.sha256()
                for chunk in iter(lambda: recording.read(1024 * 1024), b""):
                    hasher.update(chunk)
                digest = hasher.hexdigest()
            # Una misma memoria leída con otra build no es la misma interpretación.
            group = groups.setdefault((digest, item["build"]), {"sha256": digest, "bytes": path.stat().st_size, "paths": [], "build": item["build"]})
            group["paths"].append(str(path))
    matrix = []
    for (digest, build), item in groups.items():
        result_id = digest + ("-" + build if build else "")
        command = [str(binary), item["paths"][0]] + ([item["build"]] if item["build"] else [])
        process = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
        item["exit_code"] = process.returncode
        (root / f"{result_id}.stderr.txt").write_text(process.stderr, encoding="utf-8")
        if process.returncode:
            item["status"] = "rejected_by_existing_adapter"
            continue
        value = json.loads(process.stdout)
        (root / f"{result_id}.json").write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
        item["status"] = "analysed_cpu"
        item["last_event_s"] = value["last_event_s"]
        item["photos"] = value["photos"]
        for kind, coverage in value["coverage"].items():
            matrix.append({"sha256": digest, "build": build, "kind": kind, "frames_with_data": coverage["frames_with_data"],
                           "frames_5_55s_desde_primer_evento": coverage["frames_5_55s_desde_primer_evento"],
                           "first_s": coverage["first_s"], "last_s": coverage["last_s"],
                           "note": "presencia, no evento ni garantía de 50 s continuos"})
    (root / "inventario.json").write_text(json.dumps(list(groups.values()), indent=2, ensure_ascii=False), encoding="utf-8")
    if matrix:
        with (root / "matriz.csv").open("w", newline="", encoding="utf-8-sig") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(matrix[0]))
            writer.writeheader()
            writer.writerows(matrix)
    return groups


if __name__ == "__main__":
    try:
        inventory(*sys.argv[1:])
    except KeyError as error:
        raise SystemExit(f"Inventario incompatible: falta el campo requerido {error.args[0]!r}; comprobar versión del ejemplo y CSV de entradas") from error
