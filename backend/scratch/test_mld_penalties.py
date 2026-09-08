import re

def phonetic_normalize(word):
    if not word:
        return ""
    w = word.lower()
    w = re.sub(r'([b-df-hj-np-tv-z])\1+', r'\1', w)
    w = w.replace('y', 'i')
    w = w.replace('w', 'o')
    w = w.replace('ch', 'ts')
    w = w.replace('j', 'dy')
    w = w.replace('sh', 'sy')
    w = w.replace('f', 'p')
    w = w.replace('v', 'b')
    w = w.replace('z', 's')
    w = w.replace('c', 'k')
    w = w.replace('q', 'k')
    return w

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

pairs = [
    ("sasakyan", "sasakyan"),
    ("sa", "ng"),
    ("florante", "flurante"),
    ("mahihinang", "mayhinang"),
    ("nanghaharang", "naghaharang")
]

for t, s in pairs:
    dist = modified_levenshtein(t, s)
    max_len = max(len(phonetic_normalize(t)), len(phonetic_normalize(s)))
    raw_dist = round(dist * max_len, 1)
    print(f"Target: {t:15} Spoken: {s:15} Raw Dist: {raw_dist}")
