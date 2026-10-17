import re

# =================================================================
# SPRINT 4, 5, 6: PHONETIC & ALIGNMENT SCORING ENGINE
# Implements Needleman-Wunsch Alignment & Modified Levenshtein Matrix
# per ReadFil SRS (FR-010, FR-011, FR-012, FR-013, FR-016)
# =================================================================

VOWELS = set('aeiou')

def clean_text(text):
    """Normalize whitespace and strip outer punctuation for processing."""
    if not text:
        return ""
    # Remove punctuation except internal apostrophes/hyphens for contractions
    cleaned = re.sub(r'[^\w\s\'-]', '', text.lower())
    return " ".join(cleaned.split())

def get_clean_words(text):
    """Extract list of words cleaned for alignment."""
    cleaned = clean_text(text)
    if not cleaned:
        return []
    # Strip any remaining stray symbols from words
    return [re.sub(r'^[^\w]+|[^\w]+$', '', w) for w in cleaned.split() if w.strip()]

def phonetic_normalize(word):
    """
    Phonetic normalizer for Tagalog speech.
    Folds duplicate consonants and standardizes common phonetic equivalents:
    - Collapses double consonants (e.g., kk -> k, ll -> l, tt -> t)
    - Normalizes foreign/borrowed phonemes: c->k, f->p, v->b, z->s, j->dy, ch->ts, sh->sy
    - Tagalog diphthongs/glides: y->i, w->o
    """
    if not word:
        return ""
    w = word.lower().strip()
    # Collapse double consonants
    w = re.sub(r'([b-df-hj-np-tv-z])\1+', r'\1', w)

    # Tagalog phonetic mappings
    w = w.replace('y', 'i')
    w = w.replace('w', 'o')
    w = w.replace('ch', 'ts')
    w = w.replace('j', 'dy')
    w = w.replace('sh', 'sy')
    w = w.replace('f', 'p')
    w = w.replace('v', 'b')
    w = w.replace('z', 's')
    w = w.replace('c', 'k')
    return w

def consonant_skeleton(word):
    """
    Extracts the ordered consonant sequence from a word.
    Folds Tagalog morphophonemic allophones (r <-> d) so 'marami' and 'madami' share skeleton.
    E.g., 'palaka' -> 'plk', 'marami' -> 'mdm', 'madami' -> 'mdm'
    """
    if not word:
        return ""
    w = phonetic_normalize(word)
    w = w.replace('r', 'd')  # Tagalog morphophonemic allophone (dito/rito, madami/marami)
    return "".join(ch for ch in w if ch not in VOWELS and ch.isalpha())

def is_consonant_subsequence(target, spoken):
    """Verifies that target consonant skeleton matches spoken consonant skeleton."""
    t_skel = consonant_skeleton(target)
    s_skel = consonant_skeleton(spoken)
    if not t_skel and not s_skel:
        return True
    if not t_skel or not s_skel:
        return False
    # Allow exact match or subsequence with length diff <= 1
    if t_skel == s_skel:
        return True
    it = iter(s_skel)
    is_sub = all(ch in it for ch in t_skel)
    return is_sub and abs(len(t_skel) - len(s_skel)) <= 1

def modified_levenshtein(w1, w2):
    """
    Modified Levenshtein Distance Matrix for Tagalog (FR-011, BR-004).
    Reduces substitution penalty to 0.3 for valid regional accent variations:
    - Regional vowel shifts: e <-> i, o <-> u (Lagunense, Caviteño, Batangueño)
    - Common phonetic consonant shifts: d <-> r, r <-> d, l <-> r, r <-> l
    Returns normalized distance in [0.0, 1.0].
    """
    w1 = w1.lower()
    w2 = w2.lower()
    m, n = len(w1), len(w2)
    if m == 0 and n == 0:
        return 0.0
    if m == 0:
        return 1.0
    if n == 0:
        return 1.0

    dp = [[0.0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = float(i)
    for j in range(n + 1):
        dp[0][j] = float(j)

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            c1, c2 = w1[i - 1], w2[j - 1]
            if c1 == c2:
                cost = 0.0
            else:
                # Valid Tagalog regional vowel shift (e <-> i, o <-> u)
                is_vowel_shift = (c1 in 'ei' and c2 in 'ei') or (c1 in 'ou' and c2 in 'ou')
                # Tagalog consonant shift (d <-> r, l <-> r)
                is_consonant_shift = (c1 in 'dr' and c2 in 'dr') or (c1 in 'lr' and c2 in 'lr')

                if is_vowel_shift or is_consonant_shift:
                    cost = 0.3  # Reduced penalty for valid dialectal / accent shifts
                else:
                    cost = 1.0

            dp[i][j] = min(
                dp[i - 1][j] + 1.0,        # Deletion
                dp[i][j - 1] + 1.0,        # Insertion
                dp[i - 1][j - 1] + cost    # Substitution
            )

    max_len = max(m, n)
    return dp[m][n] / float(max_len) if max_len > 0 else 0.0

def is_correct_pronunciation(target, spoken):
    """
    Evaluates whether spoken word is acceptable pronunciation for target word.
    Returns (is_correct, classification) where classification is:
    'exact', 'phonetic_match', 'accent_variation', or 'mismatch'.
    """
    if not target or not spoken:
        return False, "mismatch"

    t_clean = target.lower().strip()
    s_clean = spoken.lower().strip()

    if t_clean == s_clean:
        return True, "exact"

    # Phonetic normalization match
    t_norm = phonetic_normalize(t_clean)
    s_norm = phonetic_normalize(s_clean)
    if t_norm == s_norm:
        return True, "phonetic_match"

    # Consonant skeleton and regional shift check
    if is_consonant_subsequence(t_clean, s_clean):
        dist = modified_levenshtein(t_clean, s_clean)
        # Threshold: up to 0.20 normalized distance allowed for regional vowel shifts
        if dist <= 0.20 and abs(len(t_clean) - len(s_clean)) <= 1:
            return True, "accent_variation"

    return False, "mismatch"

def needleman_wunsch_alignment(target_words, spoken_words):
    """
    Needleman-Wunsch Global Sequence Alignment Algorithm (FR-010, BR-003).
    Aligns spoken words against target words to identify:
    - Matches (correct words)
    - Substitutions (mispronounced words)
    - Deletions (skipped words / omissions)
    - Insertions (added words)
    """
    MATCH_BASE = 5.0
    MISMATCH = -2.0
    GAP = -2.5

    m, n = len(target_words), len(spoken_words)
    score = [[0.0] * (n + 1) for _ in range(m + 1)]
    pointers = [[None] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1):
        score[i][0] = GAP * i
        pointers[i][0] = 'U'  # Up (Target deletion / omitted word)
    for j in range(n + 1):
        score[0][j] = GAP * j
        pointers[0][j] = 'L'  # Left (Spoken insertion / added word)
    pointers[0][0] = None

    for i in range(1, m + 1):
        tw = target_words[i - 1]
        for j in range(1, n + 1):
            sw = spoken_words[j - 1]
            is_correct, _ = is_correct_pronunciation(tw, sw)
            dist = modified_levenshtein(tw, sw)

            if is_correct:
                match_val = MATCH_BASE * (1.0 - (dist * 0.5))
                diag_score = score[i - 1][j - 1] + match_val
            else:
                diag_score = score[i - 1][j - 1] + MISMATCH

            up_score = score[i - 1][j] + GAP
            left_score = score[i][j - 1] + GAP

            best = max(diag_score, up_score, left_score)
            score[i][j] = best

            if best == diag_score:
                pointers[i][j] = 'D'  # Diagonal
            elif best == up_score:
                pointers[i][j] = 'U'  # Up (Target omitted)
            else:
                pointers[i][j] = 'L'  # Left (Spoken inserted)

    # Backtracking to reconstruct global alignment
    i, j = m, n
    aligned_tokens = []
    correct_count = 0
    substitutions = 0
    deletions = 0
    insertions = 0

    while i > 0 or j > 0:
        p = pointers[i][j]
        if p == 'D':
            tw = target_words[i - 1]
            sw = spoken_words[j - 1]
            is_correct, sub_type = is_correct_pronunciation(tw, sw)
            if is_correct:
                correct_count += 1
                aligned_tokens.append({
                    "target": tw,
                    "spoken": sw,
                    "status": "correct",
                    "type": sub_type  # 'exact', 'phonetic_match', 'accent_variation'
                })
            else:
                substitutions += 1
                aligned_tokens.append({
                    "target": tw,
                    "spoken": sw,
                    "status": "substitution",
                    "type": "mispronunciation"
                })
            i -= 1
            j -= 1
        elif p == 'U':
            # Target word was skipped (Omission / Deletion)
            tw = target_words[i - 1]
            deletions += 1
            aligned_tokens.append({
                "target": tw,
                "spoken": None,
                "status": "deletion",
                "type": "omission"
            })
            i -= 1
        elif p == 'L':
            # Extra word spoken (Insertion)
            sw = spoken_words[j - 1]
            insertions += 1
            aligned_tokens.append({
                "target": None,
                "spoken": sw,
                "status": "insertion",
                "type": "insertion"
            })
            j -= 1
        else:
            break

    aligned_tokens.reverse()
    total_target = len(target_words)
    errors = substitutions + deletions

    return {
        "aligned_tokens": aligned_tokens,
        "total_target_words": total_target,
        "correct_words": correct_count,
        "substitutions": substitutions,
        "deletions": deletions,
        "insertions": insertions,
        "errors": errors,
        "alignment_score": score[m][n] if m > 0 and n > 0 else 0.0
    }

def get_proficiency_level(accuracy):
    """
    Phil-IRI reading proficiency categorization (FR-016, BR-006):
    - Independent: >= 97%
    - Instructional: 90% - 96%
    - Frustration: < 90%
    """
    if accuracy >= 97.0:
        return "Independent"
    elif accuracy >= 90.0:
        return "Instructional"
    else:
        return "Frustration"

def calculate_full_evaluation(target_text, transcription, duration_seconds):
    """
    Calculates complete reading metrics (FR-010 to FR-016, BR-005).
    Returns metrics dictionary with alignment, WCPM, accuracy, and proficiency level.
    """
    target_words = get_clean_words(target_text)
    spoken_words = get_clean_words(transcription)

    alignment = needleman_wunsch_alignment(target_words, spoken_words)
    total_words = alignment["total_target_words"]
    correct_words = alignment["correct_words"]

    accuracy = round((correct_words / total_words * 100.0), 2) if total_words > 0 else 0.0
    duration_minutes = duration_seconds / 60.0 if duration_seconds > 0 else 0.0
    wcpm = round((correct_words / duration_minutes), 2) if duration_minutes > 0 else 0.0

    proficiency_level = get_proficiency_level(accuracy)

    # Composite Score calculation (60% Accuracy + 40% Speed relative to 100 WCPM benchmark)
    speed_factor = min(wcpm / 100.0, 1.0)
    composite_score = round((accuracy * 0.6) + (speed_factor * 100.0 * 0.4), 2)

    phrase_breakdown = segment_phrases(target_text, alignment["aligned_tokens"])

    return {
        "target_text": target_text,
        "transcription": transcription,
        "duration_seconds": round(duration_seconds, 2),
        "total_target_words": total_words,
        "correct_words": correct_words,
        "errors": alignment["errors"],
        "substitutions": alignment["substitutions"],
        "deletions": alignment["deletions"],
        "insertions": alignment["insertions"],
        "wcpm": wcpm,
        "accuracy": accuracy,
        "proficiency_level": proficiency_level,
        "composite_score": composite_score,
        "alignment_tokens": alignment["aligned_tokens"],
        "phrase_breakdown": phrase_breakdown
    }

def segment_phrases(target_text, aligned_tokens):
    """
    Segments target text into sentences and maps alignment tokens to each sentence.
    Produces phrase-level accuracy and breakdown for diagnostic feedback (Sprint 5 & 7).
    """
    sentences = re.split(r'(?<=[.?!])\s+', target_text.strip())
    if not sentences or not sentences[0]:
        sentences = [target_text]

    token_idx = 0
    n_tokens = len(aligned_tokens)
    phrase_breakdown = []

    for sentence in sentences:
        s_words = get_clean_words(sentence)
        num_target_words = len(s_words)
        if num_target_words == 0:
            continue

        matched_targets = 0
        phrase_tokens = []

        while token_idx < n_tokens and matched_targets < num_target_words:
            tok = aligned_tokens[token_idx]
            phrase_tokens.append(tok)
            if tok["target"] is not None:
                matched_targets += 1
            token_idx += 1

        p_correct = sum(1 for tok in phrase_tokens if tok["status"] == "correct")
        p_acc = round((p_correct / num_target_words * 100.0), 2) if num_target_words > 0 else 0.0

        phrase_breakdown.append({
            "target_phrase": sentence,
            "total_words": num_target_words,
            "correct_words": p_correct,
            "accuracy": p_acc,
            "tokens": phrase_tokens
        })

    return phrase_breakdown

def select_best_model(target_text, wav2vec_raw, whisper_raw, duration_seconds):
    """
    Dynamic Model Selector Logic (Sprint 3 / FR-007, FR-008):
    Evaluates both Wav2Vec and Whisper outputs against target using Needleman-Wunsch.
    Selects the candidate with higher accuracy and alignment quality.
    """
    w2v_clean = clean_text(wav2vec_raw)
    whi_clean = clean_text(whisper_raw)

    if not w2v_clean and not whi_clean:
        return None, "NONE", None

    if w2v_clean and not whi_clean:
        eval_res = calculate_full_evaluation(target_text, wav2vec_raw, duration_seconds)
        return eval_res, "WAV2VEC", wav2vec_raw

    if whi_clean and not w2v_clean:
        eval_res = calculate_full_evaluation(target_text, whisper_raw, duration_seconds)
        return eval_res, "WHISPER", whisper_raw

    # Both produced transcripts — compare using Needleman-Wunsch accuracy & alignment score
    eval_w2v = calculate_full_evaluation(target_text, wav2vec_raw, duration_seconds)
    eval_whi = calculate_full_evaluation(target_text, whisper_raw, duration_seconds)

    # Prefer model with higher accuracy; if tied, compare alignment score or acoustic Wav2Vec
    if eval_w2v["accuracy"] > eval_whi["accuracy"]:
        return eval_w2v, "WAV2VEC", wav2vec_raw
    elif eval_whi["accuracy"] > eval_w2v["accuracy"]:
        return eval_whi, "WHISPER", whisper_raw
    else:
        # Tied accuracy — select Wav2Vec as primary Tagalog acoustic model
        return eval_w2v, "WAV2VEC", wav2vec_raw
