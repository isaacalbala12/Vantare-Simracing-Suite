"""Re-pin the 27 Workshop scene fixtures whose watchFor text changed in #2592.

Usage (from the repository root, without third-party packages):
    python -I vantare-v2/native/retirement/tools/pin_watch_for_2592.py
    python -I vantare-v2/native/retirement/tools/pin_watch_for_2592.py --check

The script never rewrites the manifest: it edits only the `sha256` and the last
`revisions[]` entry of the 27 pinned fixtures, proving first that rebuilding
each JSON with its previous watchFor reproduces `previous_sha256` byte by byte.
The manifest is derived from the base commit, so the run is idempotent.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

BASE_COMMIT = "36ec706c15c7fdf01892711fa07a2ac8be3f7280"
REASON = (
    "Reescritura de watchFor (texto del Taller); datos, frames y snapshots "
    "intactos; la comparación inversa byte a byte reproduce el pin previo"
)
SCENES = """broadcast-tower-default broadcast-tower-fast-inversion
car-damage-numbers-default car-damage-visual-default delta-default
delta-trace-default fastest-lap-alert fastest-lap-default fuel-strategy-default
head-to-head-default input-telemetry-default multiclass-relative-default
pedals-default pedals-telemetry-default racing-flags-default radar-default
relative-default relative-functional-sequence standings-default
standings-functional-combined standings-functional-personal-best
standings-functional-pit standings-functional-position
standings-functional-session-best standings-functional-window
track-map-default track-weather-default""".split()

README_NOTE = """
#2592 reescribe el texto `watchFor` de 27 escenas del Taller: 18 que repetían
el genérico "Datos de demostración del Workshop React." y 9 que pedían
controles inexistentes. Cada revisión conserva el pin previo y la base
36ec706c1; la inversión byte a byte del `watchFor` reproduce ese pin, con datos,
frames y snapshots intactos. El corpus generado del contrato se regeneró con
`export-types`; no cambia ningún otro archivo. verify.py sigue exigiendo el hash
exacto de las 472 entradas. El script de esta migración vive en
`native/retirement/tools/pin_watch_for_2592.py`.
"""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(repo: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, check=True
    )
    return result.stdout


def entry_span(text: str, key: str) -> tuple[int, int]:
    """Byte-safe span of one `"key": { ... }` object, quotes and escapes aware."""
    marker = f'    "{key}": {{'
    start = text.index(marker)
    depth = 0
    in_string = False
    escaped = False
    for index in range(start + len(marker) - 1, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return start, index + 1
    raise ValueError(f"unclosed object for {key}")


def inverse_bytes(new_bytes: bytes, old_value: str) -> bytes:
    """Rebuild the fixture with the previous watchFor, nothing else touched."""
    new_value = json.loads(new_bytes.decode("utf-8"))["watchFor"]
    prefix = '"watchFor":'
    needle = prefix + json.dumps(new_value, ensure_ascii=False)
    replacement = prefix + json.dumps(old_value, ensure_ascii=False)
    text = new_bytes.decode("utf-8")
    if text.count(needle) != 1:
        raise ValueError("watchFor is not unique in the fixture")
    return text.replace(needle, replacement, 1).encode("utf-8")


def main() -> int:
    check_only = "--check" in sys.argv[1:]
    unknown = [arg for arg in sys.argv[1:] if arg != "--check"]
    if unknown:
        print(f"FAIL: argumentos desconocidos: {unknown}")
        return 2
    here = Path(__file__).resolve()
    v2 = here.parents[3]
    repo = here.parents[4]
    if git(repo, "rev-parse", f"{BASE_COMMIT}^{{commit}}").decode().strip() != BASE_COMMIT:
        print("FAIL: la base declarada no resuelve al commit esperado")
        return 1

    manifest_path = v2 / "native/retirement/manifest.json"
    manifest_rel = "vantare-v2/native/retirement/manifest.json"
    original_text = git(repo, "show", f"{BASE_COMMIT}:{manifest_rel}").decode("utf-8")
    original = json.loads(original_text)
    current_text = manifest_path.read_bytes().decode("utf-8")

    expected_text = original_text
    expected = json.loads(expected_text)
    proofs = []
    for scene in SCENES:
        key = f"native/ui/fixtures/{scene}.scene.json"
        entry = expected["files"][key]
        fixture = v2 / key
        new_bytes = fixture.read_bytes()
        old_bytes = git(repo, "show", f"{BASE_COMMIT}:vantare-v2/{key}")
        previous = entry["sha256"]
        if sha256(old_bytes) != previous:
            print(f"FAIL {scene}: el pin actual no reproduce el fichero de la base")
            return 1
        rebuilt = inverse_bytes(new_bytes, json.loads(old_bytes.decode("utf-8"))["watchFor"])
        if rebuilt != old_bytes or sha256(rebuilt) != previous:
            print(f"FAIL {scene}: la comparación inversa no reproduce previous_sha256")
            return 1
        proofs.append((scene, sha256(new_bytes), previous))

        # Sólo sha256 + una revisión más; source_sha256 y el resto quedan igual.
        revised = dict(entry)
        revised["sha256"] = sha256(new_bytes)
        revised["revisions"] = list(entry["revisions"]) + [
            {
                "issues": [2592],
                "base_commit": BASE_COMMIT,
                "previous_sha256": previous,
                "reason": REASON,
            }
        ]
        if revised["source_sha256"] != entry["source_sha256"]:
            print(f"FAIL {scene}: cambia source_sha256")
            return 1
        expected["files"][key] = revised

        # Edición textual exacta del manifiesto original (nunca json.dump entero).
        start, end = entry_span(expected_text, key)
        block = expected_text[start:end]
        sha_line = f'      "sha256": "{entry["sha256"]}",'
        if block.count(sha_line) != 1:
            print(f"FAIL {scene}: no encuentro la línea sha256 en el manifiesto")
            return 1
        block = block.replace(sha_line, f'      "sha256": "{sha256(new_bytes)}",', 1)
        closer = "\n      ]\n    }"
        if block.count(closer) != 1:
            print(f"FAIL {scene}: no encuentro el cierre de revisions")
            return 1
        block = block.replace(
            closer,
            ",\n        {\n"
            '          "issues": [\n            2592\n          ],\n'
            f'          "base_commit": "{BASE_COMMIT}",\n'
            f'          "previous_sha256": "{previous}",\n'
            f'          "reason": {json.dumps(REASON, ensure_ascii=False)}\n'
            "        }\n      ]\n    }",
            1,
        )
        expected_text = expected_text[:start] + block + expected_text[end:]

    if expected_text == original_text:
        print("FAIL: no se generó ninguna revisión")
        return 1
    if json.loads(expected_text) != expected:
        print("FAIL: la edición textual no coincide con el manifiesto esperado")
        return 1

    # Ninguna otra entrada cambia: comparación byte a byte de cada bloque.
    changed = 0
    for key in original["files"]:
        if key in {f"native/ui/fixtures/{scene}.scene.json" for scene in SCENES}:
            changed += 1
            continue
        old_block = original_text[slice(*entry_span(original_text, key))]
        new_block = expected_text[slice(*entry_span(expected_text, key))]
        if old_block != new_block:
            print(f"FAIL: cambia un baseline ajeno: {key}")
            return 1
    if changed != 27:
        print(f"FAIL: entradas tocadas {changed}")
        return 1

    readme_path = v2 / "native/retirement/README.md"
    readme_text = readme_path.read_bytes().decode("utf-8")
    expected_readme = (
        readme_text
        if "#2592 reescribe el texto" in readme_text
        else readme_text.rstrip("\n") + "\n" + README_NOTE
    )

    if current_text == expected_text:
        print("PASS manifiesto: ya estaba actualizado (sin cambios que escribir)")
    elif current_text == original_text:
        if check_only:
            print("FAIL: el manifiesto aún no tiene las revisiones de #2592 (--check)")
            return 1
        manifest_path.write_bytes(expected_text.encode("utf-8"))
        print("PASS manifiesto: 27 pins actualizados y revisions[] añadidas")
    else:
        print("FAIL: el manifiesto no está ni en el estado base ni en el esperado")
        return 1

    if readme_text != expected_readme:
        if check_only:
            print("FAIL: falta la nota de #2592 en README.md (--check)")
            return 1
        readme_path.write_bytes(expected_readme.encode("utf-8"))
        print("PASS README: nota de #2592 añadida")
    else:
        print("PASS README: nota de #2592 presente")

    print(f"PASS inversa: 27/27 reconstrucciones reproducen previous_sha256 byte a byte")
    for scene, new_sha, previous in proofs:
        print(f"  {scene:<40} previous={previous[:12]}…  new={new_sha[:12]}…  OK")
    print(f"PASS resto: {len(original['files']) - len(SCENES)} entradas del manifiesto byte a byte idénticas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
