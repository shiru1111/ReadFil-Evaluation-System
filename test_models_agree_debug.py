import sys
sys.path.append('backend')
from app import models_agree_on_letter, align_chars, is_vowel

def debug_models_agree(target, w2v_word, whi_word):
    w2v_align = align_chars(target, w2v_word) if w2v_word else [(c, '-') for c in target]
    whi_align = align_chars(target, whi_word) if whi_word else [(c, '-') for c in target]
    
    w2v_target_aligned = [s for t, s in w2v_align if t != '-']
    whi_target_aligned = [s for t, s in whi_align if t != '-']
    
    print("w2v_target_aligned:", w2v_target_aligned)
    print("whi_target_aligned:", whi_target_aligned)
    
    for i in range(len(target)):
        t_char = target[i].lower()
        w_char = w2v_target_aligned[i] if i < len(w2v_target_aligned) else '-'
        h_char = whi_target_aligned[i] if i < len(whi_target_aligned) else '-'
        print(f"i={i} t={t_char} w={w_char} h={h_char}")
        
        if is_vowel(t_char):
            if not is_vowel(w_char) and not is_vowel(h_char):
                print("FAILED AT", i, "VOWEL")
                return False
        else:
            if w_char != t_char and h_char != t_char:
                print("FAILED AT", i, "CONSONANT")
                return False
    return True

debug_models_agree('lipunang', 'ipunang', 'lipu')
