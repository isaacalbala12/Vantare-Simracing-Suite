"""Compare complete Go/Rust product JSON for every real temporal event.

Only field paths are printed on failure, never captured values. Both inputs
are streamed so the 3839-event corpus does not need to fit in memory.
"""

import argparse
import json
from itertools import zip_longest
from pathlib import Path


def difference(left, right, path="$"):
    if type(left) is not type(right):
        return path + "<type>"
    if isinstance(left, dict):
        if left.keys() != right.keys():
            return path + "<keys>"
        for key in left:
            found = difference(left[key], right[key], path + "." + key)
            if found:
                return found
    elif isinstance(left, list):
        if len(left) != len(right):
            return path + "<length>"
        for index, (item_left, item_right) in enumerate(zip(left, right)):
            found = difference(item_left, item_right, path + f"[{index}]")
            if found:
                return found
    elif left != right:
        return path
    return None


def compare(go_path: Path, rust_path: Path, expected: int) -> None:
    count = 0
    with go_path.open(encoding="utf-8") as go, rust_path.open(encoding="utf-8") as rust:
        for count, pair in enumerate(zip_longest(go, rust), start=1):
            if None in pair:
                raise ValueError(f"event {count}: one product stream ended early")
            left = json.loads(pair[0])
            right = json.loads(pair[1])
            found = difference(left, right)
            if found:
                raise ValueError(f"event {count}: first difference at {found}")
    if count != expected:
        raise ValueError(f"product streams have {count} events, expected {expected}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("go", type=Path)
    parser.add_argument("rust", type=Path)
    parser.add_argument("--expected-events", type=int, required=True)
    args = parser.parse_args()
    try:
        compare(args.go, args.rust, args.expected_events)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        parser.exit(1, f"high-rate parity failed: {exc}\n")
    print(f"high-rate parity PASS: {args.expected_events} complete events")


if __name__ == "__main__":
    main()
