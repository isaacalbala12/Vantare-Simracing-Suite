import unittest

from score_transcripts import edit_distance, normalize, word_error_rate


class TranscriptScoringTests(unittest.TestCase):
    def test_normalize_is_case_accent_and_punctuation_insensitive(self) -> None:
        self.assertEqual(normalize("Mantén, TU línea!"), ["manten", "tu", "linea"])

    def test_edit_distance_counts_word_substitution(self) -> None:
        self.assertEqual(edit_distance(["car", "left"], ["car", "right"]), 1)

    def test_word_error_rate_is_zero_for_equivalent_text(self) -> None:
        self.assertEqual(word_error_rate("Coche a la izquierda", "coche a la izquierda."), 0.0)

    def test_word_error_rate_handles_empty_reference(self) -> None:
        self.assertEqual(word_error_rate("", ""), 0.0)
        self.assertEqual(word_error_rate("", "unexpected"), 1.0)


if __name__ == "__main__":
    unittest.main()
