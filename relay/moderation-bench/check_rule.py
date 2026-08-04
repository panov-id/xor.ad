"""Does the corroboration rule remove the identity-term blocks, and at what cost?

The rule: block when the English arm is confident (>= 0.80), or when it is above
0.50 and the multilingual arm agrees. It exists because the identity-term bias
produces borderline scores — 0.29, 0.62 — rather than confident ones, so a rule
that ignores a single borderline signal removes the bias without a new model.

Two things are checked here: the neutral sentences that name a group, and the
actual German announcement that started this.
"""
import os, statistics
from classifiers import ToxicityClassifier
from check_bias import TEMPLATES, GROUPS, NEUTRAL_FILLERS

english = ToxicityClassifier(os.environ.get("ENGLISH_CLASSIFIER", "unitary/toxic-bert"), "english")
native = ToxicityClassifier(os.environ.get("NATIVE_CLASSIFIER", ""), "native")


def blocked_now(text: str) -> bool:
    return english.score(text)[0] >= 0.50


def blocked_with_rule(text: str) -> bool:
    value = english.score(text)[0]
    return value >= 0.80 or (value >= 0.50 and native.score(text)[0] >= 0.50)


sentences = [template.format(group) for template in TEMPLATES for group in GROUPS]
neutral = [template.format(filler) for template in TEMPLATES for filler in NEUTRAL_FILLERS]
print(f"нейтральные фразы с упоминанием групп: {len(sentences)}")
print(f"   заблокировано сейчас:      {sum(blocked_now(s) for s in sentences)}")
print(f"   заблокировано по правилу:  {sum(blocked_with_rule(s) for s in sentences)}")
print(f"нейтральные без упоминания: {len(neutral)}")
print(f"   заблокировано сейчас:      {sum(blocked_now(s) for s in neutral)}")
print(f"   заблокировано по правилу:  {sum(blocked_with_rule(s) for s in neutral)}")

real = "Our speakers are here and we're ready to go - we're about to start #gay20"
print(f"\nтот самый анонс: сейчас {'заблокирован' if blocked_now(real) else 'проходит'}, "
      f"по правилу {'заблокирован' if blocked_with_rule(real) else 'проходит'}")
