"""Measure the two arms on human-labelled data, per language, honestly.

Everything before this ran on forty-one examples I wrote myself, which can show
that a layer works and can show a structural failure, but cannot show accuracy: a
model marked against an exam written by its marker always does well.

Here the labels come from people who were not us, on nine languages. Two rules
keep the numbers meaning what they say:

    contamination is per arm  the multilingual classifier was trained on the
                              TextDetox sets, so its numbers on Russian, Spanish
                              and French are not reported at all — not footnoted,
                              not reported
    the guard is not involved this measures rudeness, which is what the two arms
                              disagree about; hazards were measured separately and
                              the guard costs a second a message

    python evaluate.py [--per-language 300]
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
import time
from pathlib import Path

from classifiers import build_classifiers
from pipeline import (CONFIDENCE_FLOOR, TOXICITY_THRESHOLD, CACHE_DIRECTORY,
                      LanguageIdentifier, normalize)
from translators import build_translator

AVAILABLE = Path("/cache/datasets/available.json")

# How each set says "this one is offensive". Kept as data rather than guessed at
# run time: a label read wrongly turns a measurement into noise that looks fine.
LABELS = {
    "cardiffnlp/tweet_eval": ("label", lambda value: int(value) == 1),
    # ClassLabel(names=['NOT', 'OFF']) — the value is the index, not the name.
    "strombergnlp/offenseval_2020": ("subtask_a", lambda value: int(value) == 1),
    "philschmid/germeval18": ("binary", lambda value: str(value).upper().startswith("OFFENSE")),
    "ukr-detect/ukr-toxicity-dataset": ("toxic", lambda value: int(value) == 1),
    "textdetox/multilingual_toxicity_dataset": ("toxic", lambda value: int(value) == 1),
}


def sample(entry: dict, count: int, seed: int) -> list[tuple[str, bool]]:
    """A balanced sample: as many offensive as not, so a share means something."""
    from datasets import load_dataset

    field, is_toxic = LABELS[entry["identifier"]]
    dataset = load_dataset(entry["identifier"], entry["configuration"],
                           split=entry["split"], trust_remote_code=False)
    toxic, clean = [], []
    for row in dataset:
        text = (row.get("text") or "").strip()
        if len(text) < 3:
            continue
        (toxic if is_toxic(row[field]) else clean).append(text)

    generator = random.Random(seed)
    generator.shuffle(toxic)
    generator.shuffle(clean)
    half = count // 2
    return ([(text, True) for text in toxic[:half]]
            + [(text, False) for text in clean[:half]])


def run_language(entry, texts, labels, identifier, translator, native, english):
    started = time.perf_counter()
    normalized = [normalize(text) for text in texts]
    languages, confidences = [], []
    for text in normalized:
        readings = identifier.readings(text)
        languages.append(readings[0].language)
        confidences.append(readings[0].confidence)
    identify_seconds = time.perf_counter() - started

    started = time.perf_counter()
    if hasattr(translator, "translate_many"):
        english_texts = translator.translate_many(normalized, languages)
    else:
        english_texts = [translator.translate(text, language)
                         for text, language in zip(normalized, languages)]
    translate_seconds = time.perf_counter() - started

    started = time.perf_counter()
    native_scores = [native.score(text)[0] for text in normalized]
    english_scores = [english.score(text)[0] if text else -1.0 for text in english_texts]
    classify_seconds = time.perf_counter() - started

    return {
        "language": entry["language"],
        "count": len(texts),
        "scores": {"native": [round(value, 4) for value in native_scores],
                   "translated": [round(value, 4) for value in english_scores]},
        "confidences": [round(value, 3) for value in confidences],
        "labels": labels,
        "unsure": sum(1 for value in confidences if value < CONFIDENCE_FLOOR),
        "native": arm_result(native_scores, confidences, labels),
        "translated": arm_result(english_scores, confidences, labels),
        "contaminates": entry["contaminates"],
        "seconds": {"identify": round(identify_seconds, 1),
                    "translate": round(translate_seconds, 1),
                    "classify": round(classify_seconds, 1)},
    }


def arm_result(scores, confidences, labels) -> dict:
    """Blocked means: the language was unsure, or the score cleared the threshold.

    The unsure case belongs here rather than in a footnote — fail-closed is part
    of the product rule, so a message blocked for being unreadable is a real
    false positive when the message was fine.
    """
    missed = over = caught = passed = 0
    for score, confidence, toxic in zip(scores, confidences, labels):
        blocked = confidence < CONFIDENCE_FLOOR or score >= TOXICITY_THRESHOLD
        if toxic:
            caught += blocked
            missed += not blocked
        else:
            over += blocked
            passed += not blocked
    total_toxic = caught + missed
    total_clean = over + passed
    return {
        "missed": missed, "toxic": total_toxic,
        "over": over, "clean": total_clean,
        "recall": round(caught / total_toxic, 3) if total_toxic else None,
        "false_positive": round(over / total_clean, 3) if total_clean else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--per-language", type=int, default=300)
    parser.add_argument("--seed", type=int, default=20260804)
    parser.add_argument("--output", type=Path, default=Path("evaluation.json"))
    arguments = parser.parse_args()

    if not AVAILABLE.exists():
        print("нет списка наборов — сначала fetch_datasets.py", file=sys.stderr)
        return 1
    entries = json.loads(AVAILABLE.read_text())

    identifier = LanguageIdentifier(CACHE_DIRECTORY / "lid218e.bin")
    native, english = build_classifiers()
    translator = build_translator("facebook/nllb-200-distilled-600M")
    for name, failure in (("определитель", identifier.failure), ("классификатор оригинала", native.failure),
                          ("классификатор английского", english.failure),
                          (f"переводчик ({translator.name})", translator.failure)):
        if failure:
            print(f"{name} не готов: {failure}", file=sys.stderr)
            return 1
    print(f"переводчик: {translator.name} · порог {TOXICITY_THRESHOLD} · "
          f"уверенность языка от {CONFIDENCE_FLOOR}", file=sys.stderr)

    results = []
    for entry in entries:
        pairs = sample(entry, arguments.per_language, arguments.seed)
        if not pairs:
            print(f"   {entry['language']}: пусто, пропускаю", file=sys.stderr)
            continue
        texts = [text for text, _ in pairs]
        labels = [label for _, label in pairs]
        outcome = run_language(entry, texts, labels, identifier, translator, native, english)
        results.append(outcome)
        print(f"   {outcome['language']:>3}: {outcome['count']:4} сообщений · "
              f"перевод {outcome['seconds']['translate']:6.1f} с", file=sys.stderr)

    arguments.output.write_text(json.dumps(results, ensure_ascii=False, indent=2))
    report(results)
    return 0


def report(results: list[dict]) -> None:
    print("\n== по языкам (доля пойманного токсичного / доля зря заблокированного)",
          file=sys.stderr)
    print(f"   {'язык':>4}  {'по оригиналу':>22}  {'через перевод':>22}   не опознан",
          file=sys.stderr)
    for row in sorted(results, key=lambda item: item["language"]):
        def show(arm: str) -> str:
            if arm in row["contaminates"]:
                return "— обучалась на этом —"
            result = row[arm]
            return f"{result['recall']:.2f} поймано / {result['false_positive']:.2f} зря"
        print(f"   {row['language']:>4}  {show('native'):>22}  {show('translated'):>22}"
              f"   {row['unsure']}", file=sys.stderr)

    for arm in ("native", "translated"):
        usable = [row for row in results if arm not in row["contaminates"]]
        if not usable:
            continue
        recalls = [row[arm]["recall"] for row in usable]
        positives = [row[arm]["false_positive"] for row in usable]
        print(f"\n   {arm:>10}: по {len(usable)} языкам — "
              f"медиана поймано {statistics.median(recalls):.2f}, "
              f"медиана зря {statistics.median(positives):.2f}, "
              f"худший язык {min(usable, key=lambda r: r[arm]['recall'])['language']} "
              f"({min(recalls):.2f})", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
