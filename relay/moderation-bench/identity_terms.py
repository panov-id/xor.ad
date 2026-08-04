"""Naming a group must not, by itself, make a message toxic.

The measurement found the word `gay` alone raising a classifier's score to 0.29
against 0.001 for a neutral word in the same sentence — 457 times higher — and
blocking "our speakers are here and we're ready to start #gay20". A model trained
specifically against this bias, `unitary/unbiased-toxic-roberta`, scored 0.288 on
the same word: retraining did not remove it.

So the trigger is removed here rather than hoped away, by asking the question the
classifier should have been asked in the first place: is this sentence toxic
because of what it says, or because of who it names?

    "gays should be driven out of this town"  ->  "people should be driven out of
                                                   this town"

The attack survives the substitution, because the attack is in the verb. Mere
mention does not survive it, because there is nothing left once the noun is
ordinary. Scoring both and taking the substituted one means a message can only be
blocked for what it does, never for whom it mentions.

This matters beyond fairness. Section 5 of the mechanics dropped topic
classification because inferring who someone is touches a special category of
data under Article 9. A classifier that blocks a message for naming a group
reproduces exactly that effect while claiming to classify nothing.
"""

from __future__ import annotations

import re

# Groups whose mere naming must not move a score. The list is deliberately about
# who people are — the attributes the law treats as special — and not about what
# they do.
IDENTITY_TERMS = [
    # orientation and gender
    "gay", "gays", "lesbian", "lesbians", "bisexual", "queer", "lgbt", "lgbtq",
    "homosexual", "homosexuals", "trans", "transgender", "transsexual",
    "nonbinary", "non-binary", "woman", "women", "man", "men", "female", "male",
    # religion
    "muslim", "muslims", "islamic", "jew", "jews", "jewish", "christian",
    "christians", "catholic", "orthodox", "buddhist", "hindu", "atheist",
    # origin and race
    "black", "white", "asian", "arab", "arabs", "african", "latino", "latina",
    "hispanic", "roma", "gypsy", "immigrant", "immigrants", "migrant",
    "migrants", "refugee", "refugees", "foreigner", "foreigners",
    # disability and age
    "disabled", "deaf", "blind", "autistic", "elderly", "old",
]

# What they are replaced with: a word that names a person and carries nothing.
NEUTRAL_TERM = "person"

# A hashtag may carry a year or a number after the word — `#gay20` was the actual
# trigger — so a trailing digit run is part of the match rather than a reason to
# miss it.
_PATTERN = re.compile(
    r"(?<![\w])#?(" + "|".join(sorted(IDENTITY_TERMS, key=len, reverse=True)) + r")\d*(?![\w])",
    re.IGNORECASE,
)


def mentions_group(text: str) -> bool:
    return bool(_PATTERN.search(text))


def without_group(text: str) -> str:
    """The same sentence with every group name replaced by an ordinary one.

    Hashtags are included: `#gay20` was the actual trigger in the German set, and
    a rule that reads plain words but not hashtags would have missed the very
    case that prompted it.
    """
    return _PATTERN.sub(NEUTRAL_TERM, text)


def score_without_bias(text: str, score) -> tuple[float, bool]:
    """Score the message as if it named nobody in particular.

    Returns the score to judge by, and whether the substitution changed anything —
    the second value is what makes the effect visible in a report instead of
    silently improving a number.
    """
    if not mentions_group(text):
        return score(text)[0], False
    return score(without_group(text))[0], True
