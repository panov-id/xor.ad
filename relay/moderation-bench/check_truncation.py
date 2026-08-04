"""Is the translator dropping half of the sentence, or is the model just missing it?

Three of the German misses looked like the offensive clause simply vanished in
translation: "TRAUE KEINEM MOSLEM" came back as "Don't trust anyone", and a
sentence calling people in Brussels idiots came back without the insult. If that
is systematic, the German result says more about the translator than about the
classifier — and it is fixable.
"""
import json, sys, statistics
sys.path.insert(0, "/bench")
from evaluate import sample
from translators import build_translator

german = {r["language"]: r for r in json.load(open("/bench/evaluation.json"))}["de"]
entry = {"identifier": "philschmid/germeval18", "configuration": None,
         "split": "train", "language": "de", "contaminates": []}
texts = [text for text, _ in sample(entry, 300, 20260804)]

toxic = [i for i, label in enumerate(german["labels"]) if label]
translator = build_translator("facebook/nllb-200-distilled-600M")
english = translator.translate_many([texts[i] for i in toxic], ["deu_Latn"] * len(toxic))

missed, caught = [], []
for position, index in enumerate(toxic):
    original, produced = texts[index], english[position] or ""
    ratio = len(produced) / max(len(original), 1)
    (missed if german["scores"]["translated"][index] < 0.5 else caught).append(
        (ratio, len(original)))

for name, group in (("пропущенные", missed), ("пойманные", caught)):
    ratios = [r for r, _ in group]
    lengths = [l for _, l in group]
    short = sum(1 for r in ratios if r < 0.6)
    print(f"{name:>12}: {len(group):3} шт · длина оригинала медиана {statistics.median(lengths):3.0f} "
          f"· перевод/оригинал медиана {statistics.median(ratios):.2f} "
          f"· короче 60% оригинала: {short} ({short/len(group):.0%})")
