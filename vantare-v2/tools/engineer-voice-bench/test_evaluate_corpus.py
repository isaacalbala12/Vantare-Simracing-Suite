import unittest

from evaluate_corpus import character_error_rate, summarize


class CorpusEvaluationTests(unittest.TestCase):
    def test_character_error_rate_normalizes_accents_and_case(self) -> None:
        self.assertEqual(character_error_rate("Mantén", "manten"), 0.0)

    def test_summary_groups_language_condition_and_model(self) -> None:
        cases = [
            {"model": "tiny", "locale": "es", "condition": "clean", "reference": "hola", "transcript": "hola", "wall_ms": 10, "cpu_ms": 4, "working_set_bytes": 100},
            {"model": "tiny", "locale": "es", "condition": "clean", "reference": "adios", "transcript": "adios", "wall_ms": 30, "cpu_ms": 6, "working_set_bytes": 120},
        ]
        result = summarize(cases)
        group = result["groups"][0]
        self.assertEqual(group["micro_wer"], 0.0)
        self.assertEqual(group["micro_cer"], 0.0)
        self.assertEqual(group["latency_ms"]["p50"], 20.0)
        self.assertEqual(group["latency_ms"]["p95"], 29.0)
        self.assertEqual(group["latency_ms"]["max"], 30.0)
        self.assertEqual(group["intent_accuracy"], None)

    def test_micro_wer_weights_reference_lengths_instead_of_utterances(self) -> None:
        cases = [
            {"model": "base", "locale": "en", "condition": "clean", "reference": "wrong", "transcript": "", "wall_ms": 1, "cpu_ms": 1, "working_set_bytes": 1},
            {"model": "base", "locale": "en", "condition": "clean", "reference": "one two three four five six seven eight nine", "transcript": "one two three four five six seven eight nine", "wall_ms": 1, "cpu_ms": 1, "working_set_bytes": 1},
        ]
        group = summarize(cases)["groups"][0]
        self.assertEqual(group["micro_wer"], 0.1)
        self.assertEqual(group["macro_utterance_wer"], 0.5)


if __name__ == "__main__":
    unittest.main()
