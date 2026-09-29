"""Compare Go and Rust product payloads exported from one real LMU corpus.

The exporters omit only IPC metadata, whose capture clock is supplied
differently by the two diagnostic runners. Product values and quality are
compared recursively without normalization or numeric tolerance.
"""

import argparse
import json
from pathlib import Path


def differences(left, right, path="$", limit=20):
    found = []

    def visit(first, second, current):
        if len(found) >= limit:
            return
        if type(first) is not type(second):
            found.append(f"{current}: type")
        elif isinstance(first, dict):
            for key in sorted(first.keys() | second.keys()):
                child = f"{current}.{key}"
                if key not in first or key not in second:
                    found.append(f"{child}: missing")
                else:
                    visit(first[key], second[key], child)
                if len(found) >= limit:
                    break
        elif isinstance(first, list):
            if len(first) != len(second):
                found.append(f"{current}: length")
            for index, (one, two) in enumerate(zip(first, second)):
                visit(one, two, f"{current}[{index}]")
                if len(found) >= limit:
                    break
        elif first != second:
            found.append(f"{current}: value")

    visit(left, right, path)
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("go_products", type=Path)
    parser.add_argument("rust_products", type=Path)
    args = parser.parse_args()
    with args.go_products.open(encoding="utf-8") as source:
        go = json.load(source)
    with args.rust_products.open(encoding="utf-8") as source:
        rust = json.load(source)
    if not isinstance(go, list) or not 8 <= len(go) <= 240:
        parser.error("Go export must contain 8..240 real samples")
    if not isinstance(rust, list) or len(rust) != len(go):
        parser.error("Rust export must contain the same number of samples")
    found = differences(go, rust)
    if found:
        print(f"FAIL: {len(go)} samples differ; first {len(found)} paths:")
        for item in found:
            print(item)
        return 1
    print(f"PASS: {len(go)} real samples; Overlay, Engineer and Strategy payloads match exactly")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
