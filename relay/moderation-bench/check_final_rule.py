"""The rule that has to satisfy both requirements at once.

    grubost   judged on the substituted text — naming a group changes nothing
    napadki   judged on the original, by the identity_hate head, at a threshold
              above anything a neutral sentence reaches

Neither half works alone. Substitution alone lost "Gays should not be allowed
near our children" (0.92 -> 0.04): an attack on a group needs the group named.
The identity_hate head alone does not separate either — a neutral sentence reached
0.53 while a real attack sat at 0.05. Together they do, and the numbers below are
the whole argument for it.
"""
import os
from classifiers import ToxicityClassifier
from identity_terms import without_group, mentions_group
from check_bias import TEMPLATES, GROUPS

english = ToxicityClassifier(os.environ.get("ENGLISH_CLASSIFIER", "unitary/toxic-bert"), "english")
TOXIC_THRESHOLD = 0.50
# Above every neutral sentence measured (highest was 0.53) and below every real
# attack that this head recognises at all (lowest was 0.77).
HATE_THRESHOLD = 0.70

ATTACKS = [
    "Those Muslims are vermin and should be driven out of this town.",
    "Gays should not be allowed near our children.",
    "I hate Jews, they ruin everything here.",
    "Every immigrant here is a thief, send them all back.",
    "Black people are animals.",
]
RUDE = [
    "You are a complete idiot and nobody wants you here.",
    "Shut up you moron.",
]
NEUTRAL = [t.format(g) for t in TEMPLATES for g in GROUPS]
REAL = "Our speakers are here and we're ready to go - we're about to start #gay20"


def blocked(text: str) -> tuple[bool, str]:
    _, _, original = english.score(text)
    neutralised = without_group(text) if mentions_group(text) else text
    _, _, substituted = english.score(neutralised)
    general = max(substituted.get(name, 0.0)
                  for name in ("toxic", "severe_toxic", "obscene", "insult", "threat"))
    hate = original.get("identity_hate", 0.0)
    if general >= TOXIC_THRESHOLD:
        return True, f"грубость {general:.2f} (по подстановке)"
    if hate >= HATE_THRESHOLD:
        return True, f"нападки на группу {hate:.2f} (по оригиналу)"
    return False, f"грубость {general:.2f} · нападки {hate:.2f}"


for name, group in (("нападки на группы", ATTACKS), ("обычная грубость", RUDE)):
    caught = sum(blocked(t)[0] for t in group)
    print(f"{name}: заблокировано {caught} из {len(group)}")
    for text in group:
        yes, why = blocked(text)
        print(f"   {'ДА ' if yes else 'нет'} {why:>36}  {text[:44]}")
print(f"\nнейтральные с упоминанием групп: заблокировано "
      f"{sum(blocked(t)[0] for t in NEUTRAL)} из {len(NEUTRAL)}")
yes, why = blocked(REAL)
print(f"тот самый анонс: {'ЗАБЛОКИРОВАН' if yes else 'проходит'} — {why}")
