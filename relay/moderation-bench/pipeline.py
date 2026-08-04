"""The moderation pipeline, laid out in layers so each can be measured alone.

    normalize -> identify language -> lexicon on the original -> two arms -> decide

Two arms are run on every message and reported separately, because which one is
better is the question this bench exists to answer:

    native      a multilingual toxicity classifier reads the original
    translated  NLLB puts the message into English, an English classifier reads it

Alongside both runs the guard model, which answers a different question — hazard
rather than rudeness — and answers it well. The first run proved these are not
interchangeable: the guard called all twenty insults safe, correctly, because an
insult is not a hazard.

Two fixes the first run demanded are here as well: a confidence floor under the
language identifier, and transliteration of Latin-written Greek and Russian.

    python pipeline.py --input samples.jsonl --output results.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, field, asdict
from pathlib import Path

import requests

import transliterate
from classifiers import build_classifiers
from translators import build_translator

CACHE_DIRECTORY = Path("/cache")
TOXICITY_LISTS_DIRECTORY = CACHE_DIRECTORY / "toxicity-200"

# A run is not allowed to quietly skip a layer: if a layer cannot run, every
# message carries the reason, and the summary counts it.
UNAVAILABLE = "unavailable"

# Below this the identifier is guessing, and the first run showed what a guess
# costs: Albanian at 0.36 for Greek written in Latin letters, and a translation
# that came back as nonsense.
CONFIDENCE_FLOOR = float(os.environ.get("CONFIDENCE_FLOOR", "0.50"))

# A message scoring above this is treated as toxic. Deliberately one number for
# both arms so the comparison is of the arms, not of two thresholds.
TOXICITY_THRESHOLD = float(os.environ.get("TOXICITY_THRESHOLD", "0.50"))

# Which arm makes the decision in this run; both are always measured.
DECIDING_ARM = os.environ.get("DECIDING_ARM", "translated")


# --------------------------------------------------------------------------
# Layer 1 — normalization
# --------------------------------------------------------------------------

INVISIBLE_CHARACTERS = re.compile(r"[​-‏‪-‮⁠﻿]")
REPEATED_CHARACTER = re.compile(r"(.)\1{2,}")
LOOKALIKE_CHARACTERS = str.maketrans({
    "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s",
})
# "п р и д у р о к" — letters split by spaces to walk past a word list.
SPACED_LETTERS = re.compile(r"(?:(?<=\s)|^)(?:\w[\s_]+){2,}\w(?:(?=\s)|$)")


def normalize(text: str) -> str:
    """Fold away the cheap ways of hiding a word from a filter."""
    folded = unicodedata.normalize("NFKC", text)
    folded = INVISIBLE_CHARACTERS.sub("", folded)
    folded = REPEATED_CHARACTER.sub(r"\1\1", folded)
    folded = SPACED_LETTERS.sub(lambda match: re.sub(r"[\s_]+", "", match.group(0)), folded)
    return folded.strip()


def deobfuscate(text: str) -> str:
    """A harsher reading, used only for the word list, never for translation."""
    return text.lower().translate(LOOKALIKE_CHARACTERS)


# --------------------------------------------------------------------------
# Layer 2 — language identification, with a floor and a second reading
# --------------------------------------------------------------------------

@dataclass
class Reading:
    """One way of reading a message: as written, or transliterated back."""

    name: str
    language: str
    confidence: float
    text: str


class LanguageIdentifier:
    """FastText over 218 languages, in the codes NLLB and the word lists use.

    One naming scheme across identifier, translator and lexicon: no mapping table
    between language-code conventions, which is where pipelines like this rot.
    """

    def __init__(self, model_path: Path) -> None:
        self.model = None
        self.failure = None
        try:
            import fasttext

            if not model_path.exists():
                raise FileNotFoundError(f"{model_path} — сначала fetch_resources.py")
            self.model = fasttext.load_model(str(model_path))
        except Exception as problem:  # noqa: BLE001
            self.failure = f"{type(problem).__name__}: {problem}"

    def _predict(self, text: str) -> tuple[str, float]:
        if self.model is None:
            return UNAVAILABLE, 0.0
        labels, scores = self.model.predict(text.replace("\n", " "), k=1)
        return labels[0].removeprefix("__label__"), float(scores[0])

    def readings(self, text: str) -> list[Reading]:
        """Every way this message might be meant, not just the most confident one.

        The first run showed why one is not enough. The greeklish table turns any
        Latin text into Greek letters, so the identifier calls the result Greek
        with confidence 1.00 — including for `Ty polnyy pridurok`, which is
        Russian. Confidence cannot choose between readings, because a wrong
        reading can be perfectly confident.

        So nothing chooses. Every plausible reading is carried forward and scored,
        and the harshest score decides. Ambiguity resolves towards blocking, which
        is the same rule the rest of the pipeline follows.
        """
        language, confidence = self._predict(text)
        direct = Reading("as written", language, confidence, text)
        if confidence >= CONFIDENCE_FLOOR:
            return [direct]

        found = [direct]
        for name, candidate in transliterate.candidates(text):
            candidate_language, candidate_confidence = self._predict(candidate)
            if candidate_confidence >= CONFIDENCE_FLOOR:
                found.append(Reading(name, candidate_language, candidate_confidence, candidate))
        return found


# --------------------------------------------------------------------------
# Layer 3 — the word list, on the original
# --------------------------------------------------------------------------

class ToxicityLexicon:
    """Toxicity-200: human-written profanity lists for 200 languages.

    Measured limit, worth stating: these were built to catch profanity a
    translator hallucinates, so they hold obscenity, not rudeness. The Russian
    list has 1465 entries and none of them is "придурок". As a net under
    profanity it works; as a detector of insults it does not.
    """

    def __init__(self, directory: Path) -> None:
        self.terms_by_language: dict[str, set[str]] = {}
        self.failure = None
        if not directory.is_dir():
            self.failure = f"lists not found in {directory}"
            return
        for path in sorted(directory.glob("*.txt")):
            terms = {
                line.strip().lower()
                for line in path.read_text(encoding="utf-8", errors="ignore").splitlines()
                if line.strip()
            }
            if terms:
                self.terms_by_language[path.stem] = terms
        if not self.terms_by_language:
            self.failure = f"no lists read from {directory}"

    def matches(self, text: str, language: str) -> list[str]:
        terms = self.terms_by_language.get(language)
        if not terms:
            return []
        haystack = f" {deobfuscate(text)} "
        return sorted(term for term in terms if f" {term} " in haystack)


# --------------------------------------------------------------------------
# Layer 4 — translation into English
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# Layer 5b — the guard model, for hazards rather than rudeness
# --------------------------------------------------------------------------

class GuardModel:
    """Llama Guard behind Ollama: threats, hate, harm. Not insults, by design."""

    def __init__(self, base_url: str, model_name: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name

    def pull(self) -> str | None:
        try:
            response = requests.post(
                f"{self.base_url}/api/pull",
                json={"model": self.model_name, "stream": False},
                timeout=1800,
            )
            response.raise_for_status()
            return None
        except Exception as problem:  # noqa: BLE001
            return f"{type(problem).__name__}: {problem}"

    def classify(self, english_text: str) -> tuple[str, list[str]]:
        try:
            response = requests.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model_name,
                    "messages": [{"role": "user", "content": english_text}],
                    "stream": False,
                    "options": {"temperature": 0},
                },
                timeout=300,
            )
            response.raise_for_status()
            answer = response.json()["message"]["content"].strip()
        except Exception as problem:  # noqa: BLE001
            return UNAVAILABLE, [f"{type(problem).__name__}: {problem}"]

        lines = [line.strip() for line in answer.splitlines() if line.strip()]
        verdict = lines[0].lower() if lines else UNAVAILABLE
        categories = lines[1].split(",") if len(lines) > 1 else []
        return verdict, [category.strip() for category in categories if category.strip()]


# --------------------------------------------------------------------------
# The pipeline
# --------------------------------------------------------------------------

@dataclass
class Measurement:
    text: str
    expected: str | None = None
    normalized: str = ""
    reading: str = "as written"
    readings_tried: list[str] = field(default_factory=list)
    language: str = UNAVAILABLE
    language_confidence: float = 0.0
    lexicon_hits: list[str] = field(default_factory=list)
    english: str | None = None
    native_score: float = -1.0
    native_class: str = ""
    translated_score: float = -1.0
    translated_class: str = ""
    english_labels: dict[str, float] = field(default_factory=dict)
    guard_verdict: str = UNAVAILABLE
    guard_categories: list[str] = field(default_factory=list)
    decision: str = "blocked"
    reason: str = ""
    milliseconds: dict[str, int] = field(default_factory=dict)

    def arm_score(self, arm: str) -> float:
        if arm == "native":
            return self.native_score
        if arm == "translated":
            return self.translated_score
        # "both" — the union: the two arms fail in different places, native on the
        # low-resource tail and translated on transliteration, so either firing is
        # worth measuring as a rule of its own.
        return max(self.native_score, self.translated_score)


def decide(measurement: Measurement, arm: str) -> tuple[str, str]:
    """The product rule, written once so the numbers describe the real thing.

    Fail-closed throughout: a message is published only when every layer that had
    to speak actually spoke. Nothing passes because it was not understood.
    """
    if measurement.language == UNAVAILABLE:
        return "blocked", "language could not be identified"
    if measurement.language_confidence < CONFIDENCE_FLOOR:
        return "blocked", f"language unsure ({measurement.language_confidence:.2f})"
    if measurement.guard_verdict.startswith("unsafe"):
        return "blocked", "hazard: " + (", ".join(measurement.guard_categories) or "unsafe")
    if measurement.lexicon_hits:
        return "blocked", "profanity list: " + ", ".join(measurement.lexicon_hits)

    score = measurement.arm_score(arm)
    if score < 0:
        return "blocked", f"the {arm} classifier did not answer"
    if score >= TOXICITY_THRESHOLD:
        name = measurement.native_class if arm == "native" else measurement.translated_class
        return "blocked", f"toxicity {score:.2f} ({name})"
    return "published", "clean"


def run(input_path: Path, output_path: Path) -> int:
    identifier = LanguageIdentifier(CACHE_DIRECTORY / "lid218e.bin")
    lexicon = ToxicityLexicon(TOXICITY_LISTS_DIRECTORY)
    translator = build_translator(os.environ.get("TRANSLATION_MODEL", ""))
    guard = GuardModel(os.environ.get("GUARD_URL", ""), os.environ.get("GUARD_MODEL", ""))
    native_classifier, translated_classifier = build_classifiers()

    print("== layers", file=sys.stderr)
    for name, failure in (
        ("language identifier", identifier.failure),
        ("profanity lists", lexicon.failure),
        (f"translator: {translator.name}", translator.failure),
        ("classifier: native", native_classifier.failure),
        ("classifier: english", translated_classifier.failure),
    ):
        print(f"   {name:22} {'ready' if failure is None else 'NOT READY — ' + failure}",
              file=sys.stderr)
    guard_failure = guard.pull()
    print(f"   {'guard model':22} {'ready' if guard_failure is None else 'NOT READY — ' + guard_failure}",
          file=sys.stderr)
    print(f"   deciding arm: {DECIDING_ARM}, threshold {TOXICITY_THRESHOLD}, "
          f"confidence floor {CONFIDENCE_FLOOR}", file=sys.stderr)

    measurements: list[Measurement] = []
    with input_path.open(encoding="utf-8") as source:
        for line in source:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            record = json.loads(line)
            measurement = Measurement(text=record["text"], expected=record.get("label"))
            clock: dict[str, int] = {}

            started = time.perf_counter()
            measurement.normalized = normalize(measurement.text)
            clock["normalize"] = int((time.perf_counter() - started) * 1000)

            started = time.perf_counter()
            readings = identifier.readings(measurement.normalized)
            clock["identify"] = int((time.perf_counter() - started) * 1000)
            measurement.readings_tried = [
                f"{reading.name}:{reading.language}:{reading.confidence:.2f}"
                for reading in readings
            ]

            # Every reading is scored; the harshest wins. A second reading costs a
            # translation, and only unsure messages ever get one.
            clock["lexicon"] = clock["classify-native"] = 0
            clock["translate"] = clock["classify-english"] = clock["guard"] = 0
            for reading in readings:
                started = time.perf_counter()
                hits = lexicon.matches(reading.text, reading.language)
                clock["lexicon"] += int((time.perf_counter() - started) * 1000)

                started = time.perf_counter()
                native_score, native_class, _ = native_classifier.score(reading.text)
                clock["classify-native"] += int((time.perf_counter() - started) * 1000)

                started = time.perf_counter()
                english = translator.translate(reading.text, reading.language)
                clock["translate"] += int((time.perf_counter() - started) * 1000)

                started = time.perf_counter()
                translated_score, translated_class, english_labels = (
                    translated_classifier.score(english) if english is not None
                    else (-1.0, "", {}))
                clock["classify-english"] += int((time.perf_counter() - started) * 1000)

                started = time.perf_counter()
                verdict, categories = (
                    guard.classify(english) if english is not None else (UNAVAILABLE, []))
                clock["guard"] += int((time.perf_counter() - started) * 1000)

                # The rule is the harshest score across readings, and it is taken
                # per arm. Picking one winning reading first and reading its score
                # afterwards is a different rule, and a worse one: the greeklish
                # reading of a Greek insult scored 1.00 natively while a competing
                # reading scored 0.03 in English, and choosing the reading by the
                # larger of the two threw the native 1.00 away.
                if native_score > measurement.native_score:
                    measurement.native_score, measurement.native_class = native_score, native_class
                if translated_score > measurement.translated_score:
                    measurement.translated_score = translated_score
                    measurement.translated_class = translated_class
                    measurement.english = english
                    measurement.english_labels = english_labels
                if hits and not measurement.lexicon_hits:
                    measurement.lexicon_hits = hits
                if verdict.startswith("unsafe") or measurement.guard_verdict == UNAVAILABLE:
                    measurement.guard_verdict, measurement.guard_categories = verdict, categories
                if reading is readings[0] or reading.confidence > measurement.language_confidence:
                    measurement.reading = reading.name
                    measurement.language = reading.language
                    measurement.language_confidence = reading.confidence

            measurement.decision, measurement.reason = decide(measurement, DECIDING_ARM)
            clock["total"] = sum(clock.values())
            measurement.milliseconds = clock
            measurements.append(measurement)

            print(
                f"{measurement.language:>9} {measurement.language_confidence:4.2f} "
                f"{measurement.reading:>14}  native {measurement.native_score:5.2f}  "
                f"eng {measurement.translated_score:5.2f}  {measurement.decision:>9}  "
                f"{measurement.text[:40]}",
                file=sys.stderr,
            )

    with output_path.open("w", encoding="utf-8") as sink:
        for measurement in measurements:
            sink.write(json.dumps(asdict(measurement), ensure_ascii=False) + "\n")

    report(measurements)
    return 0


def score_arm(measurements: list[Measurement], arm: str) -> tuple[int, int, int, int]:
    """Missed toxic, over-blocked clean, and the totals they are out of."""
    toxic = [m for m in measurements if m.expected == "toxic"]
    clean = [m for m in measurements if m.expected == "clean"]
    missed = sum(1 for m in toxic if 0 <= m.arm_score(arm) < TOXICITY_THRESHOLD)
    over = sum(1 for m in clean if m.arm_score(arm) >= TOXICITY_THRESHOLD)
    return missed, len(toxic), over, len(clean)


def report(measurements: list[Measurement]) -> None:
    if not measurements:
        print("\nничего не измерено — входной файл пуст", file=sys.stderr)
        return

    print("\n== ветки, по одному порогу", file=sys.stderr)
    for arm in ("native", "translated", "both"):
        missed, toxic, over, clean = score_arm(measurements, arm)
        silent = sum(1 for m in measurements if m.arm_score(arm) < 0)
        print(f"   {arm:>10}: пропущено {missed}/{toxic} токсичного, "
              f"перекрыто {over}/{clean} чистого, не ответил {silent}", file=sys.stderr)

    # What the guard model adds over the classifier. The Jigsaw model behind the
    # English arm labels `threat` and `identity_hate` itself, so a guard verdict
    # that those two already cover is a second opinion, not a second capability.
    hazards = [m for m in measurements if m.guard_verdict.startswith("unsafe")]
    profanity = [m for m in measurements if m.lexicon_hits]
    print(f"\n   guard поймал опасного: {len(hazards)}", file=sys.stderr)
    print(f"   список брани сработал: {len(profanity)}", file=sys.stderr)

    if hazards:
        print("\n== что guard добавляет сверх классификатора", file=sys.stderr)
        alone = 0
        for m in hazards:
            covered = max(
                (value for name, value in m.english_labels.items()
                 if name in {"threat", "identity_hate", "severe_toxic"}),
                default=0.0)
            classifier_saw = covered >= TOXICITY_THRESHOLD or m.translated_score >= TOXICITY_THRESHOLD
            if not classifier_saw:
                alone += 1
            print(f"   {'ТОЛЬКО GUARD' if not classifier_saw else 'оба видят  '} "
                  f"{','.join(m.guard_categories) or 'unsafe':>6}  "
                  f"классификатор {m.translated_score:4.2f} (threat/hate {covered:4.2f})  "
                  f"{m.text[:38]}", file=sys.stderr)
        print(f"   уникально за guard: {alone} из {len(hazards)}", file=sys.stderr)

    rewritten = [m for m in measurements if m.reading != "as written"]
    print(f"   перечитано транслитерацией: {len(rewritten)}", file=sys.stderr)
    for m in rewritten:
        print(f"      {m.reading:>14} -> {m.language} {m.language_confidence:.2f}  "
              f"{m.text[:44]}", file=sys.stderr)

    unsure = [m for m in measurements if m.language_confidence < CONFIDENCE_FLOOR]
    print(f"   язык так и не опознан: {len(unsure)}", file=sys.stderr)

    print("\n== задержки, мс", file=sys.stderr)
    for layer in ("identify", "lexicon", "classify-native", "translate",
                  "classify-english", "guard", "total"):
        values = sorted(m.milliseconds.get(layer, 0) for m in measurements)
        print(f"   {layer:>16}: медиана {values[len(values) // 2]}, худшее {values[-1]}",
              file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("samples.jsonl"))
    parser.add_argument("--output", type=Path, default=Path("results.jsonl"))
    arguments = parser.parse_args()
    return run(arguments.input, arguments.output)


if __name__ == "__main__":
    raise SystemExit(main())
