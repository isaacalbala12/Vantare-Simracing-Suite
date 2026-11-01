"""Regression: changing source fixtures must not hide installed script bytes."""
import sys

sys.dont_write_bytecode = True  # Never create a cache beside the source harness.
import argparse
import hashlib
import os
from pathlib import Path

from snapshot import snapshot


parser = argparse.ArgumentParser()
parser.add_argument("--root", type=Path, required=True)
root = parser.parse_args().root.resolve()
prefix = Path("D:/VantareServer/qa").resolve()
ci = os.environ.get("CI") == "true" and os.environ.get("RUNNER_TEMP")
if not root.is_relative_to(prefix) and not (
    ci and root.is_relative_to(Path(os.environ["RUNNER_TEMP"]).resolve())
):
    raise SystemExit("SNAPSHOT_TEST_ROOT_REJECTED")
root.mkdir()  # Fresh root, after the same allowed-prefix check as the PS guard.
case = root / "case"
install = case / "install"
generation = install / "generations" / ("a" * 32)
generation.mkdir(parents=True)
(case / "shell.json").write_text("{}", encoding="utf-8")
assets = root / "assets"
paths = [install / "candidate.ps1", generation / "candidate.ps1",
         install / "uninstall-vantare.ps1"]
checks = 0
observed = []
for content in (b"first product script", b"changed product script"):
    for version in ("v987", "v988", "v989"):
        fixture = assets / version
        fixture.mkdir(parents=True, exist_ok=True)
        (fixture / "candidate.ps1").write_bytes(content)
        (assets / (version + ".zip")).write_bytes(version.encode())
    for path in paths:
        path.write_bytes(content)
    (install / "beta.ps1").write_bytes(b"beta bytes")
    result = snapshot(case, assets)["files"]
    for relative in ("candidate.ps1", "generations/$generation0/candidate.ps1",
                     "uninstall-vantare.ps1"):
        assert result[relative] == hashlib.sha256(content).hexdigest(), relative
        checks += 1
    assert result["beta.ps1"] == hashlib.sha256(b"beta bytes").hexdigest()
    checks += 1
    observed.append(result)
for relative in ("candidate.ps1", "generations/$generation0/candidate.ps1",
                 "uninstall-vantare.ps1"):
    assert observed[0][relative] != observed[1][relative], relative
    checks += 1
assert observed[0]["beta.ps1"] == observed[1]["beta.ps1"]
checks += 1
print(f"{checks} raw-script snapshot checks PASS")
