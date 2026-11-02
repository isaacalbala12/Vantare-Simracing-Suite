"""Physical line counts for #1840: fixed perimeter, no generated/build outputs.

Includes comments/blank lines. Reuses the existing Rust test-item classifier.
Reports production, Rust tests, fixtures, PS product/tests, docs and tooling
separately. Default head reads working files (including untracked scoped files);
--head SHA reads only Git blobs. Never reads env files or installation roots.
"""
import argparse
import importlib.util
import json
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PREFIX = "vantare-v2/"
spec = importlib.util.spec_from_file_location(
    "rust_lines", Path(__file__).with_name("license-production-lines.py"))
rust_lines = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rust_lines)


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8-sig")


def category(path, projection=False):
    if projection and path in {
        PREFIX + "native/hub/src/installation.rs",
        PREFIX + "native/hub/src/settings/windows.rs",
        PREFIX + "native/runtime/src/bin/vantare/beta.rs",
        PREFIX + "native/runtime/src/bin/vantare/beta_indicator.rs",
    }:
        return "rust_production"
    if path.startswith(PREFIX + "native/installer/src/") and path.endswith(".rs"):
        return "rust_production"
    if path in {PREFIX + "native/hub/src/settings/mod.rs",
                PREFIX + "native/hub/src/settings/updates.rs",
                PREFIX + "native/hub/src/settings/view.rs",
                PREFIX + "native/hub/src/settings/view/rail.rs"}:
        return "rust_production"
    if path.startswith(PREFIX + "native/installer/tests/"):
        return "rust_tests"
    if path.startswith(PREFIX + "native/installer/fixtures/") and path.endswith(".json"):
        return "fixtures"
    if path.startswith(PREFIX + "native/installer/examples/") and path.endswith(".rs"):
        return "rust_tests"
    if path == PREFIX + "native/installer/build.rs":
        return "rust_build_tooling"
    if path.startswith(PREFIX + "native/packaging/") and path.endswith(".ps1"):
        return "ps_product" if path.rsplit("/", 1)[1] in {
            "candidate.ps1", "beta.ps1", "installer-driver.ps1", "installer-shell.ps1", "installer-cleanup.ps1"} else "ps_tests_and_tooling"
    if path == PREFIX + "native/packaging/matrix/cleanup-image-probe.cs":
        return "cs_tests"
    if path in {PREFIX + "native/README.md", PREFIX + "native/installer/README.md",
                PREFIX + "native/hub/README.md", PREFIX + "native/packaging/README.md",
                PREFIX + "native/packaging/matrix/README.md",
                PREFIX + "native/packaging/matrix/evidence-1840-p3.md",
                PREFIX + "native/packaging/matrix/evidence-1840-p4.md",
                PREFIX + "native/packaging/matrix/evidence-1840-p5.md",
                PREFIX + "docs/adr/0103-instalacion-nativa.md",
                PREFIX + "docs/vantare-program/handoffs/platform-commercial.md",
                PREFIX + "docs/vantare-program/installer-design.md",
                PREFIX + "docs/changelog/fragments/ISA-1840.json"}:
        return "docs"
    if path == PREFIX + "native/scripts/installer-lines.py":
        return "python_tooling"
    if path == ".github/workflows/branch-channel-gates.yml":
        return "ci"
    return None


def measure(ref, projection=False):
    paths = (git("ls-tree", "-r", "--name-only", ref) if ref else
             git("ls-files", "--cached", "--others", "--exclude-standard")).splitlines()
    totals = defaultdict(int)
    files = {}
    for path in sorted(set(paths)):
        kind = category(path, projection)
        if kind is None:
            continue
        if not ref and not (ROOT / path).is_file():
            continue
        source = git("show", f"{ref}:{path}") if ref else (ROOT / path).read_text(encoding="utf-8-sig")
        count = len(source.splitlines())
        if kind == "rust_production":
            production, _ = rust_lines.production(source)
            totals["rust_tests"] += count - production
            count = production
        totals[kind] += count
        files[path] = {"category": kind, "lines": count}
    return {"totals": dict(totals), "files": files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head")
    parser.add_argument("--projection", action="store_true",
                        help="include the four legacy Rust hosts targeted by steps 6-8")
    args = parser.parse_args()
    before, after = measure(args.base, args.projection), measure(args.head, args.projection)
    categories = sorted(before["totals"].keys() | after["totals"].keys())
    print(json.dumps({"base": git("rev-parse", args.base).strip(),
                      "head": git("rev-parse", args.head).strip() if args.head else "working-tree",
                      "scope": "installer and selected Hub settings plus four legacy hosts" if args.projection else "installer and selected Hub settings",
                      "method": "physical lines; Rust test-only items excluded from production",
                      "delta": {key: after["totals"].get(key, 0) - before["totals"].get(key, 0) for key in categories},
                      "before": before, "after": after}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
