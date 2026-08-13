import sys
sys.path.append('.')
from app import clean_text, fix_segmentation_errors, needleman_wunsch_alignment, merge_syllable_hallucinations_and_stutters, get_alignment_mapping

target = "Ang bawat panukalang-batas na mapagtitibay ng Kongreso ay ihaharap sa Pangulo bago maging batas. Lalagdaan ito ng Pangulo kung sinasang-ayunan niya ito."
spoken = "ang bawat panoka lang batas na mapagtetebay ng kongreso ay ihaharap sa pangulo bago maging batas lalagdaan ito ng pangulo kung sinasang ayunan nya ito"

target_words = clean_text(target)
spoken_words = clean_text(spoken)

import sys
sys.path.append('.')
from app import clean_text, fix_segmentation_errors as old_fix

def tracking_fix_segmentation_errors(target_words, spoken_words):
    target_set = set(target_words)
    optimized = []
    i = 0
    from app import SYNONYM_PAIRS, find_phonetic_target_match, is_correct_pronunciation, modified_levenshtein, has_vowel_shift, letters_are_subset_of
    
    while i < len(spoken_words):
        current = spoken_words[i]
        print(f"DEBUG: Processing word: {current} at index {i}")
        if i < len(spoken_words) - 1:
            nxt = spoken_words[i + 1]
            fused2 = current + nxt
            is_nxt_target = (nxt in target_set or any(nxt in pair and any(s in target_set for s in pair) for pair in SYNONYM_PAIRS))
            if not is_nxt_target and current not in target_set:
                fused2_target = find_phonetic_target_match(fused2, target_set)
                if fused2_target is not None:
                    print(f"  -> Triggered P2 (fused2_target={fused2_target}) on {fused2}")
            
            if current and nxt and current[-1] == nxt[0]:
                overlap = current + nxt[1:]
                if not is_nxt_target:
                    overlap_target = find_phonetic_target_match(overlap, target_set)
                    if overlap_target is not None:
                        print(f"  -> Triggered P2b (overlap_target={overlap_target}) on {overlap}")
        
        return old_fix(target_words, spoken_words)

optimized = tracking_fix_segmentation_errors(target_words, spoken_words)
print("\nALIGNMENT:")
for i, w in enumerate(optimized):
    t_idx = align_t.get(i)
    t_w = target_words[t_idx] if t_idx is not None else "---"
    print(f"[{i}] spoken: {w} -> target: {t_w}")

cleaned = merge_syllable_hallucinations_and_stutters(optimized, target_words)
print("\nAFTER MERGE_SYLLABLE_HALLUCINATIONS_AND_STUTTERS:")
print(cleaned)

