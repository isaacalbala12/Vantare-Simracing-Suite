"""Canonical observable disk snapshot. Reads only the explicitly supplied QA tree."""
import argparse
import base64
import hashlib
import json
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(root, assets):
    install = root / "install"
    replacements = {str(root).replace("\\", "/"): "$case",
                    str(assets).replace("\\", "/"): "$assets"}
    # Source fixture identities vary with OS/compiler/source revision. Preserve
    # every other hash; normalization is by exact known bytes, never extension.
    for version in ("v987", "v988", "v989"):
        for file in sorted((assets / version).rglob("*")):
            if file.is_file():
                rel = file.relative_to(assets / version).as_posix()
                if rel != "manifest.json":
                    replacements[digest(file)] = "$fixture:" + rel
        archive = assets / (version + ".zip")
        replacements[digest(archive)] = "$zip:" + version
    generations = install / "generations"
    generated = sorted((p for p in generations.glob("*") if p.is_dir()),
                       key=lambda p: (p.stat().st_ctime_ns, p.name))
    for index, generation in enumerate(generated):
        replacements[generation.name] = f"$generation{index}"
        manifest = generation / "manifest.json"
        if manifest.exists():
            replacements[digest(manifest)] = f"$manifest{index}"

    def normalize(value):
        if isinstance(value, dict):
            if set(value) == {"payload", "signature"}:
                return {"signed_payload": normalize(json.loads(base64.b64decode(value["payload"])))}
            return {key: normalize(item) for key, item in sorted(value.items())}
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if isinstance(value, str):
            value = value.replace("\\", "/")
            for old, new in sorted(replacements.items(), key=lambda pair: -len(pair[0])):
                value = value.replace(old, new)
            return value
        return value

    files = {}
    for file in sorted(install.rglob("*")):
        if not file.is_file():
            continue
        rel = file.relative_to(install).as_posix()
        if file.name == "hub-ready":
            value = "$pid"
        elif file.suffix == ".json":
            try:
                value = normalize(json.loads(file.read_text(encoding="utf-8-sig")))
            except (ValueError, UnicodeError):
                value = normalize(digest(file))
            # Exact source sizes are checked by the engine; platform/compiler
            # variation belongs to the fixture, not installation behavior.
            if file.name == "manifest.json" and isinstance(value, dict):
                for member in value["files"]:
                    if member["sha256"].startswith("$fixture:"):
                        member["size"] = "$fixture-size"
        elif file.suffix.lower() == ".ps1":
            # Installed code is observable even when it matches the source fixture.
            # Keep JSON fixture identities normalized, but pin all script bytes.
            value = digest(file)
        else:
            value = normalize(digest(file))
        files[normalize(rel)] = value
    shell = json.loads((root / "shell.json").read_text(encoding="utf-8-sig"))
    return {"files": dict(sorted(files.items())), "shell": normalize(shell)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(snapshot(args.root, args.assets), sort_keys=True,
                                     ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
