"""Toxicity classifiers — the layer the first run proved was missing.

Llama Guard answers a different question than this product asks. It implements a
hazard taxonomy: threats, hate against a protected attribute, weapons, self-harm.
It called every one of twenty insults safe, and it was right to: rudeness is not
a hazard. What the feed needs is what Perspective used to do — a toxicity score.

Two arms are measured against each other on the same messages:

    native      classify the original text with a multilingual classifier
    translated  translate into English first, then classify with an English one

The second arm is the one the WMT comparison found better for most languages. It
was never tested here, because the first run put a guard model at the end of it
instead of a classifier.
"""

from __future__ import annotations

import os


# What counts as a toxicity score, spelled out rather than inferred.
#
# Learned the hard way: `unbiased-toxic-roberta` also emits a head per identity
# group — `muslim`, `jewish`, `homosexual_gay_or_lesbian` — meaning "this text
# mentions that group", not "this text attacks it". Treating every non-neutral
# label as toxicity turned those into blocks, and the model looked catastrophic
# when the fault was here. It would also have been the exact behaviour we object
# to: punishing a sentence for naming a group.
TOXIC_LABELS = {
    "toxic", "toxicity", "severe_toxic", "severe_toxicity", "obscene",
    "threat", "insult", "identity_hate", "identity_attack", "sexual_explicit",
    "offensive", "hate", "abusive",
}
NEUTRAL_LABELS = {"neutral", "non-toxic", "nontoxic", "label_0", "ok", "clean"}


class ToxicityClassifier:
    """An encoder classifier. Milliseconds on a processor, not seconds."""

    def __init__(self, model_name: str, label: str) -> None:
        self.model_name = model_name
        self.label = label
        self.pipeline = None
        self.failure = None
        if not model_name:
            self.failure = "model not configured"
            return
        try:
            from transformers import pipeline

            self.pipeline = pipeline(
                "text-classification",
                model=model_name,
                top_k=None,
                truncation=True,
                max_length=256,
            )
        except Exception as problem:  # noqa: BLE001 - reported, never swallowed
            self.failure = f"{type(problem).__name__}: {problem}"

    def score(self, text: str) -> tuple[float, str, dict[str, float]]:
        """Highest toxic-class score, the class that won, and every class.

        Label vocabularies differ between models, so anything that is not plainly
        the neutral class counts as a toxic class. Naming the winning class keeps
        that judgement visible instead of buried in a threshold.

        Every class is returned as well, because the Jigsaw model behind the
        English arm labels `threat` and `identity_hate` separately — which is what
        makes it possible to ask what the guard model still adds on top.
        """
        if self.pipeline is None or not text:
            return -1.0, "unavailable", {}
        try:
            scored = self.pipeline(text)[0]
        except Exception as problem:  # noqa: BLE001
            return -1.0, f"{type(problem).__name__}", {}

        by_label = {entry["label"]: float(entry["score"]) for entry in scored}
        # Prefer the named toxicity heads. Only when a model uses none of the
        # known names does the older rule apply — anything that is not plainly
        # the neutral class.
        known = {name: value for name, value in by_label.items()
                 if name.lower() in TOXIC_LABELS}
        considered = known or {name: value for name, value in by_label.items()
                               if name.lower() not in NEUTRAL_LABELS}
        if not considered:
            return 0.0, "neutral", by_label
        best_name = max(considered, key=considered.get)
        return considered[best_name], best_name, by_label


def build_classifiers() -> tuple[ToxicityClassifier, ToxicityClassifier]:
    native = ToxicityClassifier(
        os.environ.get("NATIVE_CLASSIFIER", ""), "native")
    translated = ToxicityClassifier(
        os.environ.get("ENGLISH_CLASSIFIER", ""), "translated")
    return native, translated
