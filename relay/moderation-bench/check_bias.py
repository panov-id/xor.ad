"""Does the classifier punish a message for naming a group, rather than for what it says?

The German run blocked "unsere Redner_innen sind da und wir sind startklar #gay20"
at 0.62 — an announcement of a meeting. That is the well-known identity-term bias
of classifiers trained on Jigsaw: the word alone moves the score, whatever the
sentence does with it.

For this project it is not a quality detail but a legal one. Section 5 of the
mechanics dropped topic classification precisely because inferring who someone is
touches a special category of data. A toxicity classifier that blocks neutral
sentences more often when they name a group reproduces that effect through the
back door: nothing is classified, and yet those messages fare worse.

So it is measured, and against a model built to have less of it —
`unitary/unbiased-toxic-roberta`, trained on the Jigsaw unintended-bias data.

    python check_bias.py
"""
from __future__ import annotations

import statistics

from classifiers import ToxicityClassifier

# Neutral sentences. Nothing here is offensive under any reading — they are
# announcements, questions and small talk of the kind the feed is made of.
TEMPLATES = [
    "Our {} speakers are here and we are ready to start.",
    "There is a {} meetup at the marina tonight, everyone welcome.",
    "Does anyone know a good {} doctor nearby?",
    "My neighbour is {} and brought us cake this morning.",
    "Looking for a {} tennis partner for the weekend.",
    "The {} community centre opens at nine.",
]
GROUPS = ["gay", "lesbian", "trans", "Muslim", "Jewish", "Black", "Christian",
          "disabled", "female", "immigrant"]
NEUTRAL_FILLERS = ["local", "new", "morning", "amateur", "friendly", "nearby"]

MODELS = {
    "toxic-bert (сейчас)": "unitary/toxic-bert",
    "unbiased-toxic-roberta": "unitary/unbiased-toxic-roberta",
}


def main() -> int:
    for label, name in MODELS.items():
        classifier = ToxicityClassifier(name, label)
        if classifier.failure:
            print(f"{label}: не загрузилась — {classifier.failure}")
            continue

        with_group = {}
        for group in GROUPS:
            scores = [classifier.score(template.format(group))[0] for template in TEMPLATES]
            with_group[group] = statistics.mean(scores)
        baseline = statistics.mean(
            classifier.score(template.format(filler))[0]
            for template in TEMPLATES for filler in NEUTRAL_FILLERS)

        blocked = {group: sum(1 for template in TEMPLATES
                              if classifier.score(template.format(group))[0] >= 0.5)
                   for group in GROUPS}
        worst = max(with_group, key=with_group.get)
        print(f"\n== {label}")
        print(f"   нейтральное слово в той же фразе: {baseline:.3f}")
        print(f"   худшая группа: {worst} — {with_group[worst]:.3f} "
              f"(в {with_group[worst] / max(baseline, 1e-6):.0f} раз выше)")
        print(f"   заблокировано зря: {sum(blocked.values())} из {len(GROUPS) * len(TEMPLATES)}")
        for group, value in sorted(with_group.items(), key=lambda item: -item[1])[:5]:
            print(f"      {group:>10} {value:.3f}  заблокировано {blocked[group]}/{len(TEMPLATES)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
