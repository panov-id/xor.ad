"""Does removing the trigger keep real attacks blocked?

Two things have to be true at once, or the fix is not a fix:
  * naming a group stops mattering — the neutral sentences go through;
  * attacking a group still matters — the substitution keeps the verb, so hate
    aimed at a group must still be caught.
"""
import os
from classifiers import ToxicityClassifier
from identity_terms import score_without_bias, without_group, mentions_group
from check_bias import TEMPLATES, GROUPS

english = ToxicityClassifier(os.environ.get("ENGLISH_CLASSIFIER", "unitary/toxic-bert"), "english")
score = english.score

ATTACKS = [
    "Those Muslims are vermin and should be driven out of this town.",
    "Gays should not be allowed near our children.",
    "I hate Jews, they ruin everything here.",
    "Every immigrant here is a thief, send them all back.",
    "Black people are animals.",
]
NEUTRAL = [template.format(group) for template in TEMPLATES for group in GROUPS]
REAL = "Our speakers are here and we're ready to go - we're about to start #gay20"

def blocked(text, use_rule):
    if use_rule:
        value, _ = score_without_bias(text, score)
    else:
        value = score(text)[0]
    return value >= 0.50

print(f"нейтральные с упоминанием групп ({len(NEUTRAL)}):")
print(f"   сейчас заблокировано:    {sum(blocked(t, False) for t in NEUTRAL)}")
print(f"   после снятия триггера:   {sum(blocked(t, True) for t in NEUTRAL)}")
print(f"\nнападки на группы ({len(ATTACKS)}):")
print(f"   сейчас заблокировано:    {sum(blocked(t, False) for t in ATTACKS)}")
print(f"   после снятия триггера:   {sum(blocked(t, True) for t in ATTACKS)}")
for text in ATTACKS:
    before = score(text)[0]
    after, _ = score_without_bias(text, score)
    print(f"      {before:.2f} -> {after:.2f}  {without_group(text)[:64]}")
print(f"\nтот самый анонс: сейчас {'заблокирован' if blocked(REAL, False) else 'проходит'}, "
      f"после снятия триггера {'заблокирован' if blocked(REAL, True) else 'проходит'}")
