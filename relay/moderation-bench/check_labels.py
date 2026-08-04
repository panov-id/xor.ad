"""Can the model tell "names a group" from "attacks a group" on its own?

Plain substitution failed: it removed real hate along with the trigger, because
an attack on a group needs the group named. So the question becomes whether the
`identity_hate` head separates the two by itself — if it does, rudeness can be
judged on the substituted text while an attack is judged on the original.
"""
import os
from classifiers import ToxicityClassifier
from identity_terms import without_group
from check_bias import TEMPLATES, GROUPS

english = ToxicityClassifier(os.environ.get("ENGLISH_CLASSIFIER", "unitary/toxic-bert"), "english")

ATTACKS = [
    "Those Muslims are vermin and should be driven out of this town.",
    "Gays should not be allowed near our children.",
    "I hate Jews, they ruin everything here.",
    "Every immigrant here is a thief, send them all back.",
    "Black people are animals.",
]
NEUTRAL = [t.format(g) for t in TEMPLATES for g in GROUPS]
REAL = "Our speakers are here and we're ready to go - we're about to start #gay20"

def parts(text):
    _, _, labels = english.score(text)
    return labels.get("toxic", 0), labels.get("identity_hate", 0), labels.get("insult", 0)

print(f"{'':6} {'toxic':>6} {'ident':>6} {'insult':>7}   текст")
for text in ATTACKS:
    toxic, ident, insult = parts(text)
    print(f"НАПАД {toxic:6.2f} {ident:6.2f} {insult:7.2f}   {text[:52]}")
worst = max(NEUTRAL, key=lambda t: parts(t)[1])
print()
for text in [REAL, worst]:
    toxic, ident, insult = parts(text)
    print(f"НЕЙТР {toxic:6.2f} {ident:6.2f} {insult:7.2f}   {text[:52]}")
    toxic, ident, insult = parts(without_group(text))
    print(f"  подстановка -> {toxic:.2f} / {ident:.2f} / {insult:.2f}   {without_group(text)[:46]}")
print()
print("максимум identity_hate по 60 нейтральным:", f"{max(parts(t)[1] for t in NEUTRAL):.2f}")
print("минимум identity_hate по 5 нападкам:     ", f"{min(parts(t)[1] for t in ATTACKS):.2f}")
