"""Compile/replay isolated historical Go sources; never overwrite reviewed fixtures."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def extract(name, target):
    entry = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))[name]
    archive = HERE / entry["archive"]
    if hashlib.sha256(archive.read_bytes()).hexdigest() != entry["sha256"]:
        raise ValueError(f"archive SHA-256 mismatch: {name}")
    with tarfile.open(archive) as source:
        members = source.getmembers()
        if len(members) != len(entry["files"]) or len({m.name for m in members}) != len(members):
            raise ValueError("unexpected archive entries")
        for member in members:
            path = PurePosixPath(member.name)
            if (not member.isfile() or path.is_absolute() or ".." in path.parts
                    or "\\" in member.name or ":" in member.name
                    or any(part.startswith(".env") for part in path.parts)):
                raise ValueError(f"unsafe archived source: {member.name}")
            expected = entry["files"].get(member.name)
            stream = source.extractfile(member)
            if stream is None:
                raise ValueError(f"missing source: {member.name}")
            data = stream.read()
            if hashlib.sha256(data).hexdigest() != expected:
                raise ValueError(f"source SHA-256 mismatch: {member.name}")
            destination = target.joinpath(*path.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
    return entry


def run(name, output=None):
    if output is not None:
        output = output.resolve()
        if output.exists():
            raise ValueError("output must not exist; reviewed fixtures are immutable")
    with tempfile.TemporaryDirectory(prefix="vantare-frozen-go-") as temporary:
        target = Path(temporary)
        entry = extract(name, target)
        environment = os.environ.copy()
        environment.update(GOWORK="off", GOPROXY="off", NATIVE_ORACLE_ROOT=str(ROOT),
                           NATIVE_ORACLE_GO_COMMIT=entry["commit"])
        if name == "lmu":
            environment["NATIVE_ORACLE_OUT"] = str(output or target / "unused-output")
            command = ["go", "test", "-p", "2", "-tags", "native_oracle",
                       "./internal/telemetry/drivers/lmu", "-count=1", "-timeout", "10m",
                       "-run", "^TestNativeOracleFreeze$" if output else "^$", "-v"]
        else:
            exporter = target / "tools/strategy-oracle/main.go"
            text = exporter.read_text(encoding="utf-8")
            # The exporter originally queried the current checkout. An extracted
            # module has no .git: pin only that metadata to the archived source.
            old = 'exec.Command("git", "rev-parse", "HEAD").Output()'
            if old not in text:
                raise ValueError("unrecognized Strategy exporter metadata")
            text = text.replace(old, f'[]byte("{entry["commit"]}"), error(nil)')
            text = text.replace('\n\t"os/exec"', '')
            exporter.write_text(text, encoding="utf-8", newline="\n")
            command = (["go", "run", "-p", "2", "./tools/strategy-oracle", "--out", str(output)]
                       if output else ["go", "test", "-p", "2", "./tools/strategy-oracle", "-count=1"])
        subprocess.run(command, cwd=target, env=environment, check=True)
        print(f"PASS frozen {name} at {entry['commit']}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("oracle", choices=["lmu", "strategy", "strategy-legacy", "all"])
    parser.add_argument("--out", type=Path, help="new output directory; omission compiles and tests without regenerating")
    args = parser.parse_args()
    if args.oracle == "all" and args.out:
        parser.error("--out requires one oracle")
    for oracle in (["lmu", "strategy", "strategy-legacy"] if args.oracle == "all" else [args.oracle]):
        run(oracle, args.out)
