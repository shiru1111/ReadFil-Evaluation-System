import unittest
from scoring_engine import (
    modified_levenshtein,
    phonetic_normalize,
    is_correct_pronunciation,
    needleman_wunsch_alignment,
    get_proficiency_level,
    calculate_full_evaluation,
    select_best_model
)

class TestReadFilScoringEngineUAT(unittest.TestCase):
    """
    UAT & QA Test Suite for ReadFil Speech Recognition System
    Validates requirements FR-010 to FR-016 and BR-003 to BR-006.
    """

    def test_exact_match(self):
        target = "May isang asong gutom na gutom na naglalakad sa kalsada"
        spoken = "May isang asong gutom na gutom na naglalakad sa kalsada"
        res = calculate_full_evaluation(target, spoken, duration_seconds=6.0)

        self.assertEqual(res["total_target_words"], 10)
        self.assertEqual(res["correct_words"], 10)
        self.assertEqual(res["errors"], 0)
        self.assertEqual(res["accuracy"], 100.0)
        self.assertEqual(res["proficiency_level"], "Independent")
        # 10 words in 6 seconds (0.1 min) = 100 WCPM
        self.assertEqual(res["wcpm"], 100.0)

    def test_regional_vowel_shifts_batangueno_lagunense(self):
        """
        FR-011 / BR-004: Modified Levenshtein Distance Matrix for regional vowel shifts.
        Ensures valid Tagalog shifts (e <-> i, o <-> u) are not unfairly penalized.
        """
        # lalake (spoken) vs lalaki (target), tutoo (spoken) vs totoo (target)
        target = "Ang lalaki ay may totoo na marumi na damit"
        spoken = "Ang lalake ay may tutoo na marume na damit"
        res = calculate_full_evaluation(target, spoken, duration_seconds=6.0)

        self.assertEqual(res["total_target_words"], 9)
        self.assertEqual(res["correct_words"], 9)
        self.assertEqual(res["accuracy"], 100.0)
        self.assertEqual(res["proficiency_level"], "Independent")

        # Verify token sub-type
        tokens = {t["target"]: t["type"] for t in res["alignment_tokens"] if t["target"]}
        self.assertEqual(tokens["lalaki"], "accent_variation")
        self.assertEqual(tokens["totoo"], "accent_variation")
        self.assertEqual(tokens["marumi"], "accent_variation")

    def test_consonant_shift(self):
        """Validates Tagalog d <-> r consonant variation (e.g. madami vs marami)."""
        target = "Marami ang kumakain"
        spoken = "Madami ang kumakain"
        res = calculate_full_evaluation(target, spoken, duration_seconds=3.0)

        self.assertEqual(res["correct_words"], 3)
        self.assertEqual(res["accuracy"], 100.0)

    def test_omissions_deletions(self):
        """
        FR-010 / BR-003: Needleman-Wunsch sequence alignment detecting skipped words.
        """
        target = "Nakita nila ang palaka at bibe"
        # Spoken skipped 'nila' and 'ang'
        spoken = "Nakita palaka at bibe"
        res = calculate_full_evaluation(target, spoken, duration_seconds=4.0)

        self.assertEqual(res["total_target_words"], 6)
        self.assertEqual(res["correct_words"], 4)
        self.assertEqual(res["deletions"], 2)
        self.assertAlmostEqual(res["accuracy"], 66.67, places=1)
        self.assertEqual(res["proficiency_level"], "Frustration")

    def test_insertions_added_words(self):
        """
        FR-010: Needleman-Wunsch detecting added words or stutters without corrupting alignment.
        """
        target = "Pumunta sa lawa si Tito"
        spoken = "Pumunta ah sa lawa talaga si Tito"
        res = calculate_full_evaluation(target, spoken, duration_seconds=5.0)

        self.assertEqual(res["total_target_words"], 5)
        self.assertEqual(res["correct_words"], 5)
        self.assertEqual(res["insertions"], 2)
        self.assertEqual(res["accuracy"], 100.0)

    def test_mispronunciations_substitutions(self):
        """FR-011: Spoken words that deviate from target must be penalized."""
        target = "Pusa ang alaga ni Maria"
        # 'Aso' is substitution for 'pusa', 'bata' for 'maria'
        spoken = "Aso ang alaga ni bata"
        res = calculate_full_evaluation(target, spoken, duration_seconds=5.0)

        self.assertEqual(res["total_target_words"], 5)
        self.assertEqual(res["correct_words"], 3)
        self.assertEqual(res["substitutions"], 2)
        self.assertEqual(res["accuracy"], 60.0)
        self.assertEqual(res["proficiency_level"], "Frustration")

    def test_phil_iri_proficiency_thresholds(self):
        """FR-016 / BR-006: Phil-IRI standard categorization levels."""
        self.assertEqual(get_proficiency_level(100.0), "Independent")
        self.assertEqual(get_proficiency_level(97.0), "Independent")
        self.assertEqual(get_proficiency_level(96.9), "Instructional")
        self.assertEqual(get_proficiency_level(90.0), "Instructional")
        self.assertEqual(get_proficiency_level(89.9), "Frustration")
        self.assertEqual(get_proficiency_level(45.0), "Frustration")

    def test_wcpm_speed_calculation(self):
        """FR-012: Words Correct Per Minute calculation."""
        target = "isa dalawa tatlo apat lima anim pito walo siyam sampu"
        spoken = "isa dalawa tatlo apat lima anim pito walo siyam sampu"
        # 10 words spoken in 6 seconds (0.1 min) = 100 WCPM
        res = calculate_full_evaluation(target, spoken, duration_seconds=6.0)
        self.assertEqual(res["wcpm"], 100.0)

        # 10 words spoken in 12 seconds (0.2 min) = 50 WCPM
        res2 = calculate_full_evaluation(target, spoken, duration_seconds=12.0)
        self.assertEqual(res2["wcpm"], 50.0)

    def test_dynamic_model_selector(self):
        """FR-007 / FR-008: Dynamic model selector picks the superior transcription."""
        target = "Masaya ang mga bata sa bakuran"
        # Wav2Vec got it perfectly
        w2v = "Masaya ang mga bata sa bakuran"
        # Whisper hallucinated or dropped words
        whi = "Masaya bata"

        best_eval, winner, winner_text = select_best_model(target, w2v, whi, duration_seconds=5.0)
        self.assertEqual(winner, "WAV2VEC")
        self.assertEqual(best_eval["accuracy"], 100.0)

        # Scenario 2: Whisper got it right, Wav2Vec produced garbage
        w2v_bad = "Msa ah"
        whi_good = "Masaya ang mga bata sa bakuran"
        best_eval2, winner2, winner_text2 = select_best_model(target, w2v_bad, whi_good, duration_seconds=5.0)
        self.assertEqual(winner2, "WHISPER")
        self.assertEqual(best_eval2["accuracy"], 100.0)

    def test_phrase_segmentation(self):
        """Sprint 5 / FR-010: Multi-phrase passage evaluation."""
        target = "Nakita nila ang palaka. Nakita nila ang bibe!"
        spoken = "Nakita nila ang palaka. Nakita nila bibe"
        res = calculate_full_evaluation(target, spoken, duration_seconds=6.0)

        self.assertEqual(len(res["phrase_breakdown"]), 2)
        p1 = res["phrase_breakdown"][0]
        p2 = res["phrase_breakdown"][1]
        self.assertEqual(p1["accuracy"], 100.0)
        self.assertEqual(p1["correct_words"], 4)
        # In p2, 'ang' was skipped
        self.assertEqual(p2["correct_words"], 3)
        self.assertEqual(p2["total_words"], 4)
        self.assertEqual(p2["accuracy"], 75.0)

if __name__ == '__main__':
    unittest.main()
