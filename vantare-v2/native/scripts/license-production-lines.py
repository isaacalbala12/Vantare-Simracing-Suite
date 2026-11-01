"""Reproducible physical Rust line count for #1827 (standard library only).

Counts tracked src/*.rs in services/runtime/hub/ipc, including comments and blank
lines, excluding test files and items gated exclusively by test. Feature-gated
production and all platform implementations remain included. This is a source
size measure, not compiled LOC or a claim that every line concerns licensing.
Use --ref SHA for a clean historical tree; default reads tracked working files.
"""
import argparse
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PREFIX = "vantare-v2/native/"
CRATES = ("services", "runtime", "hub", "ipc")
# Deliberately fixed perimeter, including the destination of step 11.
LICENSE = {
    "services": ("license", "license_remote", "app", "outcome", "account", "storage",
                 "billing", "roadmap", "report", "pilot"),
    "runtime": ("rights", "services"),
    "hub": ("home", "services", "shell/navigation"),
    "ipc": ("control", "services_protocol"),
    "admin": ("session",),
}


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT).decode("utf-8-sig")


def masked(source):
    """Hide literals/comments while preserving offsets, braces and newlines."""
    pattern = re.compile(
        r'//[^\n]*|/\*|r(?P<hashes>\#*)"|"(?:\\.|[^"\\])*"'
        r"|'(?:\\(?:u\{[0-9a-fA-F]+\}|.)|[^'\\\n])'", re.DOTALL
    )
    result = list(source)
    pos = 0
    while match := pattern.search(source, pos):
        end = match.end()
        if match.group() == "/*":
            depth = 1
            while depth:
                token = re.search(r"/\*|\*/", source[end:])
                if token is None:
                    raise ValueError("unclosed block comment")
                depth += 1 if token.group() == "/*" else -1
                end += token.end()
        elif match.group("hashes") is not None:
            close = '"' + match.group("hashes")
            end = source.index(close, end) + len(close)
        for index in range(match.start(), end):
            if result[index] != "\n":
                result[index] = " "
        pos = end
    return "".join(result)


def production(source):
    code = masked(source)
    removed = set()
    modules = []
    # all(test, platform) requires test; any(test, feature) also has production.
    marker = re.compile(r"#\[(?:test|cfg\(\s*test\s*\)|cfg\(\s*all\(\s*test\b[^\]]*)\]")
    for match in marker.finditer(code):
        start = code.rfind("\n", 0, match.start()) + 1
        cursor = match.end()
        while True:
            attr = re.match(r"\s*#\[[^\]]*\]", code[cursor:])
            if not attr:
                break
            cursor += attr.end()
        nested = []
        for index in range(cursor, len(code)):
            token = code[index]
            if token in "([<":
                nested.append({"(": ")", "[": "]", "<": ">"}[token])
            elif nested and token == nested[-1]:
                nested.pop()
            elif not nested and token in ";,{":
                end = index + 1
                break
        else:
            raise ValueError("test item without terminator")
        module = re.search(r"\bmod\s+(\w+)\s*;", code[cursor:end])
        if module:
            modules.append(module.group(1))
        if token == "{":
            depth = 1
            for index in range(end, len(code)):
                depth += (code[index] == "{") - (code[index] == "}")
                if depth == 0:
                    end = index + 1
                    break
            else:
                raise ValueError("unclosed test item")
        first = source.count("\n", 0, start)
        last = source.count("\n", 0, end)
        removed.update(range(first, last + 1))
    return len(source.splitlines()) - len(removed), modules


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref")
    parser.add_argument("--include-admin", action="store_true", help="also measure the Store consumer in Gestión")
    args = parser.parse_args()
    crates = (*CRATES, "admin") if args.include_admin else CRATES
    paths = (git("ls-tree", "-r", "--name-only", args.ref) if args.ref
             else git("ls-files")).splitlines()
    sources = {}
    excluded = set()
    for path in paths:
        parts = Path(path).parts
        if (not path.startswith(PREFIX) or len(parts) < 5 or parts[2] not in crates
                or parts[3] != "src" or not path.endswith(".rs")):
            continue
        if any(p in ("tests", "testdata", "fixtures") or p.endswith("_tests.rs")
               or p in ("tests.rs", "test.rs") for p in parts[4:]):
            continue
        if not args.ref and not (ROOT / path).exists():
            raise FileNotFoundError(f"Tracked source missing: {path}; stage its deletion or restore it before counting")
        source = git("show", f"{args.ref}:{path}") if args.ref else (ROOT / path).read_text(encoding="utf-8-sig")
        count, modules = production(source)
        sources[path] = count
        parent = Path(path).parent
        if Path(path).stem not in ("lib", "main", "mod"):
            parent /= Path(path).stem
        for module in modules:
            excluded.add((parent / module).as_posix())
    files = {p: n for p, n in sorted(sources.items())
             if not any(p == e + ".rs" or p.startswith(e + "/") for e in excluded)}
    totals = defaultdict(int)
    license_totals = defaultdict(int)
    license_files = {}
    for path, count in files.items():
        crate = Path(path).parts[2]
        totals[crate] += count
        relative = path.split("/src/", 1)[1]
        if any(relative == item + ".rs" or relative.startswith(item + "/")
               for item in LICENSE[crate]):
            license_files[path] = count
            license_totals[crate] += count
    print(json.dumps({"ref": args.ref or "working-tree", "metric": "physical source lines without test-only items",
                      "crates": dict(sorted(totals.items())), "total": sum(totals.values()),
                      "license_crates": dict(sorted(license_totals.items())),
                      "license_total": sum(license_files.values()), "license_files": license_files,
                      "all_files": files}, indent=2))


if __name__ == "__main__":
    main()
