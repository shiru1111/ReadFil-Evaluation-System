def align_chars(target, spoken):
    target = target.lower()
    spoken = spoken.lower()
    m, n = len(target), len(spoken)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1): dp[i][0] = i
    for j in range(n + 1): dp[0][j] = j
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if target[i - 1] == spoken[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + 1)
                
    i, j = m, n
    aligned = []
    while i > 0 or j > 0:
        if i > 0 and j > 0 and (target[i - 1] == spoken[j - 1] or dp[i][j] == dp[i - 1][j - 1] + 1):
            aligned.append((target[i - 1], spoken[j - 1]))
            i -= 1; j -= 1
        elif i > 0 and (j == 0 or dp[i][j] == dp[i - 1][j] + 1):
            aligned.append((target[i - 1], '-'))
            i -= 1
        else:
            aligned.append(('-', spoken[j - 1]))
            j -= 1
            
    return aligned[::-1]

print("W2V:", align_chars("lipunang", "ipunang"))
print("WHI:", align_chars("lipunang", "lipu"))
