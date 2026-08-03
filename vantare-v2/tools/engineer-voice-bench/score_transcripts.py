"""Score command transcripts without third-party dependencies."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path


def normalize(value: str) -> list[str]:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.findall(r"[a-z0-9]+", value)


def edit_distance(reference: list[str], hypothesis: list[str]) -> int:
    previous = list(range(len(hypothesis) + 1))
    for row, ref_token in enumerate(reference, start=1):
        current = [row]
        for column, hyp_token in enumerate(hypothesis, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[column] + 1,
                    previous[column - 1] + (ref_token != hyp_token),
                )
            )
        previous = current
    return previous[-1]


def word_error_rate(reference: str, hypothesis: str) -> float:
    reference_tokens = normalize(reference)
    hypothesis_tokens = normalize(hypothesis)
    if not reference_tokens:
        return 0.0 if not hypothesis_tokens else 1.0
    return edit_distance(reference_tokens, hypothesis_tokens) / len(reference_tokens)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    cases = payload.get("cases", payload.get("measurements"))
    if cases is None:
        raise SystemExit("input must contain cases or measurements")
    scored = []
    for case in cases:
        scored.append(
            {
                **case,
                "wer": round(word_error_rate(case["reference"], case["transcript"]), 4),
            }
        )
    result = {"schema": "vantare.engineer.voice-bench.stt-score.v1", "cases": scored}
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
