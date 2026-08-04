"""Find human-labelled offensive-language data, and report honestly what is not there.

Why this is not a matter of picking the famous benchmark: both classifiers in the
pipeline were trained on the obvious ones. The multilingual arm is
`textdetox/xlmr-large-toxicity-classifier`, trained on the TextDetox corpus; the
English arm is `unitary/toxic-bert`, trained on Jigsaw. Measuring either on its
own training data produces a flattering number that means nothing.

So the sets are ranked by whether the model could have seen them:

    clean       neither model was trained on it — the only numbers worth quoting
    contaminated  one of the models was trained on it — usable to sanity-check the
                  other arm, never to claim accuracy

Each candidate is probed rather than assumed: a dataset that needs an account, a
signed form or a manual download is reported as such, not silently skipped.

    python fetch_datasets.py
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

CACHE_DIRECTORY = Path("/cache/datasets")


@dataclass
class Candidate:
    identifier: str
    language: str
    note: str
    # Which arm this set would flatter, because that arm was trained on it.
    # Contamination is per model, not per dataset: the multilingual arm was
    # trained on TextDetox, the English arm on Jigsaw, so a TextDetox set is
    # worthless for the first and perfectly honest for the second — and the
    # second is the arm the measurement chose.
    contaminates: tuple[str, ...] = ()
    configuration: str | None = None
    split: str = "train"

    @property
    def label(self) -> str:
        name = self.identifier
        if self.configuration:
            name += f" [{self.configuration}]"
        if self.split != "train":
            name += f" ({self.split})"
        return name


CANDIDATES = [
    Candidate("cardiffnlp/tweet_eval", "en",
              "OLID-derived offensive labels; neither arm trained on it",
              configuration="offensive"),
    Candidate("strombergnlp/offenseval_2020", "el",
              "Greek from OffensEval-2020 — the language the storefronts launch in",
              configuration="gr"),
    Candidate("strombergnlp/offenseval_2020", "tr",
              "Turkish — a language no storefront declares, kept as a control",
              configuration="tr"),
    Candidate("strombergnlp/offenseval_2020", "ar",
              "Arabic — likewise undeclared, likewise a control",
              configuration="ar"),
    Candidate("philschmid/germeval18", "de", "GermEval 2018, German offensive language"),
    Candidate("ukr-detect/ukr-toxicity-dataset", "uk",
              "Ukrainian — one of the few sets outside the big languages"),
    # Honest for the translated arm, worthless for the native one.
    Candidate("textdetox/multilingual_toxicity_dataset", "ru",
              "Russian — a main language of the district; the native arm was trained on this",
              contaminates=("native",), split="ru"),
    Candidate("textdetox/multilingual_toxicity_dataset", "es",
              "Spanish; the native arm was trained on this",
              contaminates=("native",), split="es"),
    Candidate("textdetox/multilingual_toxicity_dataset", "fr",
              "French; the native arm was trained on this",
              contaminates=("native",), split="fr"),
]


# The training corpus of the multilingual arm, kept as texts so overlap can be
# checked rather than assumed.
TRAINING_SPLITS = ("en", "ru", "uk", "de", "es", "am", "zh", "ar", "hi", "it", "fr",
                   "he", "hin", "tt", "ja")


def training_texts() -> set[str]:
    """Everything the multilingual classifier was trained on, as raw strings."""
    from datasets import load_dataset

    collected: set[str] = set()
    for split in TRAINING_SPLITS:
        try:
            data = load_dataset("textdetox/multilingual_toxicity_dataset",
                                split=split, trust_remote_code=False)
        except Exception:  # noqa: BLE001 - a missing split is not fatal here
            continue
        collected.update((row.get("text") or "").strip() for row in data)
    collected.discard("")
    return collected


def measure_overlap(candidate: Candidate, training: set[str]) -> float:
    """What share of this set the multilingual arm has already seen.

    Written because provenance lied once already: the Ukrainian set was labelled
    by hand as clean for both arms, and 99.8% of it turned out to be the training
    data itself, which produced a recall of 1.00 that meant nothing. Names of
    datasets do not establish independence — comparing the texts does.
    """
    from datasets import load_dataset

    try:
        data = load_dataset(candidate.identifier, candidate.configuration,
                            split=candidate.split, trust_remote_code=False)
    except Exception:  # noqa: BLE001
        return 0.0
    texts = {(row.get("text") or "").strip() for row in data}
    texts.discard("")
    if not texts:
        return 0.0
    return len(texts & training) / len(texts)


def probe(candidate: Candidate) -> tuple[bool, str]:
    from datasets import load_dataset

    try:
        dataset = load_dataset(
            candidate.identifier,
            candidate.configuration,
            split=candidate.split,
            trust_remote_code=False,
        )
    except Exception as problem:  # noqa: BLE001 - the reason is the point
        return False, f"{type(problem).__name__}: {str(problem).splitlines()[0][:110]}"
    return True, f"{len(dataset)} строк, поля: {', '.join(list(dataset.features)[:5])}"


def main() -> int:
    CACHE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    available: list[dict] = []
    print("== читаю обучающую выборку многоязычной модели, чтобы сверять пересечение")
    training = training_texts()
    print(f"   в ней {len(training)} текстов")

    for candidate in CANDIDATES:
        purity = ("чистый для обеих веток" if not candidate.contaminates
                  else "загрязняет: " + ", ".join(candidate.contaminates))
        print(f"\n== {candidate.language:>4} · {purity:24} {candidate.label}")
        print(f"   {candidate.note}")
        reachable, detail = probe(candidate)
        print(f"   {'ЕСТЬ' if reachable else 'НЕТ '} — {detail}")
        contaminates = set(candidate.contaminates)
        if reachable:
            overlap = measure_overlap(candidate, training)
            if overlap > 0.05:
                contaminates.add("native")
                print(f"   ПЕРЕСЕЧЕНИЕ {overlap:.1%} с обучающей выборкой — "
                      f"числа ветки по оригиналу недействительны")
            elif overlap:
                print(f"   пересечение {overlap:.1%} — в пределах допустимого")
        if reachable:
            available.append({
                "identifier": candidate.identifier,
                "configuration": candidate.configuration,
                "split": candidate.split,
                "language": candidate.language,
                "contaminates": sorted(contaminates),
                "detail": detail,
            })

    (CACHE_DIRECTORY / "available.json").write_text(
        json.dumps(available, ensure_ascii=False, indent=2))

    for arm in ("native", "translated"):
        usable = [item for item in available if arm not in item["contaminates"]]
        print(f"\n   для ветки «{arm}» годится {len(usable)} наборов — "
              f"языки: {', '.join(sorted({item['language'] for item in usable})) or 'ни одного'}")
    clean = [item for item in available if "translated" not in item["contaminates"]]
    print(f"\n== итог")
    print(f"   доступно наборов: {len(available)} из {len(CANDIDATES)}")
    if not clean:
        print("   Мерить нечем: всё доступное — то, на чём модели учились.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
