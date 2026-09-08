import re

def phonetic_normalize(word):
    if not word:
        return ""
    w = word.lower()
    w = re.sub(r'([b-df-hj-np-tv-z])\1+', r'\1', w)
    w = w.replace('y', 'i').replace('w', 'o').replace('ch', 'ts').replace('j', 'dy')
    w = w.replace('sh', 'sy').replace('f', 'p').replace('v', 'b').replace('z', 's')
    w = w.replace('c', 'k').replace('q', 'k')
    return w

def is_pure_vowel_shift(word1, word2):
    if not word1 or not word2:
        return False
    w1 = re.sub(r'[^a-z0-9]', '', str(word1).lower())
    w2 = re.sub(r'[^a-z0-9]', '', str(word2).lower())
    if w1 == w2:
        return False
    if len(w1) != len(w2):
        return False
    diff_count = 0
    for c1, c2 in zip(w1, w2):
        if c1 != c2:
            is_valid_shift = (c1 in ('e', 'i') and c2 in ('e', 'i')) or \
                             (c1 in ('o', 'u') and c2 in ('o', 'u'))
            if not is_valid_shift:
                return False
            diff_count += 1
    return diff_count > 0

def check_is_synonym(w1, w2):
    return False

def modified_levenshtein(word1, word2):
    w1 = phonetic_normalize(word1)
    w2 = phonetic_normalize(word2)
    m, n = len(w1), len(w2)
    dp = [[0.0] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1): dp[i][0] = float(i)
    for j in range(n + 1): dp[0][j] = float(j)

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if w1[i - 1] == w2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                c1, c2 = w1[i - 1], w2[j - 1]
                is_vowel_shift = (c1 == 'e' and c2 == 'i') or (c1 == 'i' and c2 == 'e') or \
                                 (c1 == 'o' and c2 == 'u') or (c1 == 'u' and c2 == 'o')
                is_consonant_shift = (c1 == 'd' and c2 == 'r') or (c1 == 'r' and c2 == 'd') or \
                                     (c1 == 'l' and c2 == 'r') or (c1 == 'r' and c2 == 'l') or \
                                     (c1 == 'p' and c2 == 'b') or (c1 == 'b' and c2 == 'p')
                
                if is_vowel_shift or is_consonant_shift:
                    cost = 0.3
                else:
                    cost = 1.0
                dp[i][j] = min(
                    dp[i - 1][j] + 1.0,
                    dp[i][j - 1] + 1.0,
                    dp[i - 1][j - 1] + cost
                )

    max_len = max(len(w1), len(w2))
    if max_len == 0: return 0.0
    return dp[m][n] / float(max_len)

def clean_text(text):
    text = text.lower()
    text = re.sub(r"[-'\u2010-\u2015\ufe63\uff0d’‘`]", '', text)
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return text.split()

def is_correct_pronunciation(target, spoken):
    if not target or not spoken:
        return False
    t_lower = str(target).lower().strip()
    s_lower = str(spoken).lower().strip()
    if t_lower == s_lower:
        return True
    if check_is_synonym(t_lower, s_lower):
        return True
    t_norm = phonetic_normalize(target)
    s_norm = phonetic_normalize(spoken)
    if t_norm == s_norm:
        return True
    if is_pure_vowel_shift(target, spoken):
        return True
    return False

def get_simulation_trace(target_words, spoken_words):
    MATCH    =  5.0
    MISMATCH = -2.0
    GAP      = -2.0

    m, n = len(target_words), len(spoken_words)
    score    = [[0.0]  * (n + 1) for _ in range(m + 1)]
    pointers = [[None] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1):
        score[i][0]    = GAP * i
        pointers[i][0] = 'U'
    for j in range(n + 1):
        score[0][j]    = GAP * j
        pointers[0][j] = 'L'
    pointers[0][0] = None

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            t_w = target_words[i - 1]
            s_w = spoken_words[j - 1]
            t_low = t_w.lower()
            s_low = s_w.lower()
            w1_norm = phonetic_normalize(t_w)
            w2_norm = phonetic_normalize(s_w)
            is_zero_dist = (t_low == s_low) or check_is_synonym(t_low, s_low) or (w1_norm == w2_norm)
            is_v_shift = is_pure_vowel_shift(t_w, s_w)

            if is_zero_dist or is_v_shift:
                match_score = score[i - 1][j - 1] + MATCH
            else:
                dist = modified_levenshtein(t_w, s_w)
                match_score = score[i - 1][j - 1] + (MATCH * (1.0 - dist)) if dist <= 0.4 else score[i - 1][j - 1] + MISMATCH

            delete_score = score[i - 1][j] + GAP
            insert_score = score[i][j - 1] + GAP
            best_score   = max(match_score, delete_score, insert_score)
            score[i][j]  = best_score

            if best_score == match_score: pointers[i][j] = 'D'
            elif best_score == delete_score: pointers[i][j] = 'U'
            else: pointers[i][j] = 'L'

    i, j = m, n
    trace = []
    
    while i > 0 or j > 0:
        if pointers[i][j] == 'D':
            t_word = target_words[i - 1]
            s_word = spoken_words[j - 1]
            t_low = t_word.lower()
            s_low = s_word.lower()
            w1_norm = phonetic_normalize(t_word)
            w2_norm = phonetic_normalize(s_word)
            
            is_zero_dist = (t_low == s_low) or check_is_synonym(t_low, s_low) or (w1_norm == w2_norm)
            is_v_shift = is_pure_vowel_shift(t_word, s_word)

            if is_zero_dist:
                raw_dist = 0.0
                is_correct = True
                step_type = "match"
            elif is_v_shift:
                dist = modified_levenshtein(t_word, s_word)
                max_len = max(len(w1_norm), len(w2_norm))
                raw_dist = round(dist * max_len, 1)
                is_correct = True  # Not flagged as error
                step_type = "match"
            else:
                dist = modified_levenshtein(t_word, s_word)
                max_len = max(len(w1_norm), len(w2_norm))
                raw_dist = round(dist * max_len, 1)
                is_correct = False
                step_type = "substitution"

            trace.append({
                "type": step_type,
                "target": t_word,
                "spoken": s_word,
                "distance": raw_dist,
                "is_correct": is_correct,
                "is_vowel_shift": is_v_shift
            })
            i -= 1; j -= 1
        elif pointers[i][j] == 'U':
            t_word = target_words[i - 1]
            trace.append({
                "type": "deletion",
                "target": t_word,
                "spoken": "-",
                "distance": 1.0,
                "is_correct": False,
                "is_vowel_shift": False
            })
            i -= 1
        elif pointers[i][j] == 'L':
            s_word = spoken_words[j - 1]
            trace.append({
                "type": "insertion",
                "target": "-",
                "spoken": s_word,
                "distance": 1.0,
                "is_correct": False,
                "is_vowel_shift": False
            })
            j -= 1
            
    trace.reverse()
    errors = sum(1 for step in trace if not step["is_correct"] and step["target"] != "-")
    insertions = sum(1 for step in trace if step["type"] == "insertion")
    total_errors = errors + insertions
    correct_words = max(0, len(target_words) - total_errors)
    return trace, correct_words, total_errors

target = "Nagsigawan sa tuwa ang mga sundalo nang makitang buhay sina Florante at Laura. Nagsibalik ang lahat sa palasyo. Hindi nagtagal at ikinasal ang dalawa at naging hari at reyna ng Albanya."
spoken = "Nagsigawan ng tuwa ang mga sundalo nang makitang buhay sina Flurante at Laura Nagsibalik ang lahat sa palasyo Hindi nagtagal at ikinasal ang dalawa at naging hari at reyna ng Albanya"

t_words = clean_text(target)
s_words = clean_text(spoken)

trace, correct, errors = get_simulation_trace(t_words, s_words)
print(f"Total Errors: {errors}, Correct Words: {correct}")
for step in trace:
    if not step['is_correct'] or step['is_vowel_shift']:
        print("HIGHLIGHT STEP:", step)
