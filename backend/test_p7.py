import sys
from app import clean_text, fix_segmentation_errors

target_text = "Nawalang-saysay rin ang mungkahi ng Kapitan sapagkat ipinahayag na tapos na ang desisyon ng pari tungkol sa pista. Ang desisyon ay ang pagdaraos ng anim na prusisyon, tatlong sermon, tatlong misa, at komedyang mula sa Tundo."
spoken_text = "nawalang saysayrin ang mungkahi ng Kapitan sapagkat ipinahayag na tapos na ang disisyon ng pari tungkol sa pista ang disisyon ay ang pagdaraos ng anim na prosisyon tatlong sermon tatlong misa akomend dyang mula sa Tundo"

t_words = clean_text(target_text)
s_words = clean_text(spoken_text)
print("Target:", t_words[:3])
print("Spoken:", s_words[:3])

opt = fix_segmentation_errors(t_words, s_words)
print("Optimized:", opt[:3])
