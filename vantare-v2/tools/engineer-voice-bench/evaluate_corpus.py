"""Aggregate human-corpus STT measurements by model, locale and condition."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

from score_transcripts import edit_distance, normalize, word_error_rate


def character_error_rate(reference: str, hypothesis: str) -> float:
    reference_chars = list("".join(normalize(reference)))
    hypothesis_chars = list("".join(normalize(hypothesis)))
    if not reference_chars:
        return 0.0 if not hypothesis_chars else 1.0
    return edit_distance(reference_chars, hypothesis_chars) / len(reference_chars)


def percentile(values: list[float], percentage: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentage
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def summarize(cases: list[dict[str, object]]) -> dict[str, object]:
    groups: dict[tuple[str, str, str], list[dict[str, object]]] = defaultdict(list)
    for case in cases:
        groups[(str(case["model"]), str(case["locale"]), str(case["condition"]))].append(case)
    result = []
    for (model, locale, condition), measurements in sorted(groups.items()):
        wers = [word_error_rate(str(item["reference"]), str(item["transcript"])) for item in measurements]
        cers = [character_error_rate(str(item["reference"]), str(item["transcript"])) for item in measurements]
        word_edits = 0
        word_references = 0
        character_edits = 0
        character_references = 0
        for item in measurements:
            reference_words = normalize(str(item["reference"]))
            hypothesis_words = normalize(str(item["transcript"]))
            reference_characters = list("".join(reference_words))
            hypothesis_characters = list("".join(hypothesis_words))
            word_edits += edit_distance(reference_words, hypothesis_words)
            word_references += len(reference_words)
            character_edits += edit_distance(reference_characters, hypothesis_characters)
            character_references += len(reference_characters)
        latencies = [float(item["wall_ms"]) for item in measurements]
        intents = [item for item in measurements if item.get("expected_intent") is not None]
        result.append(
            {
                "model": model,
                "locale": locale,
                "condition": condition,
                "samples": len(measurements),
                "micro_wer": round(word_edits / word_references, 4) if word_references else (0.0 if word_edits == 0 else 1.0),
                "micro_cer": round(character_edits / character_references, 4) if character_references else (0.0 if character_edits == 0 else 1.0),
                "macro_utterance_wer": round(statistics.fmean(wers), 4),
                "macro_utterance_cer": round(statistics.fmean(cers), 4),
                "latency_ms": {
                    "p50": round(percentile(latencies, 0.5), 3),
                    "p95": round(percentile(latencies, 0.95), 3),
                    "max": round(max(latencies), 3),
                },
                "cpu_ms_mean": round(statistics.fmean(float(item["cpu_ms"]) for item in measurements), 3),
                "working_set_bytes_max": max(int(item["working_set_bytes"]) for item in measurements),
                "intent_accuracy": None if not intents else round(sum(item.get("predicted_intent") == item["expected_intent"] for item in intents) / len(intents), 4),
            }
        )
    return {"schema": "vantare.engineer.human-corpus-summary.v1", "groups": result}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    payload = json.loads(args.input.read_text(encoding="utf-8-sig"))
    result = summarize(payload["measurements"])
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
