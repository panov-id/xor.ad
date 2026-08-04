"""Fetch what the pipeline needs into the mounted cache, and say plainly what
could not be fetched.

Two resources, and they are not equal in how easy they are to get:

  * the language identification model — a direct download, published by the NLLB
    team, 218 languages, and it emits exactly the codes the translator expects;
  * the Toxicity-200 wordlists — human-written profanity lists for 200 languages,
    the layer that catches what translation launders. Meta announced them with
    NLLB, but they are not served from one stable, documented URL the way the
    model is.

If the lists cannot be fetched, this script fails loudly rather than leaving the
pipeline quietly running on four layers instead of five. A missing layer that
nobody notices is worse than a missing layer that stops the run.

    python fetch_resources.py
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

import requests

CACHE_DIRECTORY = Path("/cache")
LANGUAGE_MODEL_PATH = CACHE_DIRECTORY / "lid218e.bin"
TOXICITY_DIRECTORY = CACHE_DIRECTORY / "toxicity-200"

LANGUAGE_MODEL_URL = "https://dl.fbaipublicfiles.com/nllb/lid/lid218e.bin"

# The outer archive holds one password-protected archive per language. The
# password is published by the authors in the README of the dataset itself
# (facebookresearch/flores, toxicity/README.md), where they also say that
# unzipping is taken as consent to view the contents. It is a shield against
# indexing profanity lists, not a lock.
TOXICITY_PASSWORD = b"tL4nLLb"

# Tried in order. None of these is promised to stay put — that is exactly why the
# failure is reported with the names, so the next person knows what was tried.
TOXICITY_SOURCES = [
    "https://dl.fbaipublicfiles.com/nllb/NLLB-200_TWL.zip",
    "https://tinyurl.com/NLLB200TWL",
]


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=600) as response:
        response.raise_for_status()
        with destination.open("wb") as sink:
            for chunk in response.iter_content(chunk_size=1 << 20):
                sink.write(chunk)


def fetch_language_model() -> bool:
    if LANGUAGE_MODEL_PATH.exists():
        print(f"   уже есть: {LANGUAGE_MODEL_PATH.name}")
        return True
    try:
        print(f"   качаю {LANGUAGE_MODEL_URL}")
        download(LANGUAGE_MODEL_URL, LANGUAGE_MODEL_PATH)
        size = LANGUAGE_MODEL_PATH.stat().st_size // (1 << 20)
        print(f"   готово: {LANGUAGE_MODEL_PATH.name}, {size} МБ")
        return True
    except Exception as problem:  # noqa: BLE001
        print(f"   НЕ ВЫШЛО: {type(problem).__name__}: {problem}")
        return False


def fetch_toxicity_lists() -> bool:
    if TOXICITY_DIRECTORY.is_dir() and any(TOXICITY_DIRECTORY.glob("*.txt")):
        count = len(list(TOXICITY_DIRECTORY.glob("*.txt")))
        print(f"   уже есть: {count} списков")
        return True

    archive = CACHE_DIRECTORY / "toxicity-200.zip"
    for url in TOXICITY_SOURCES:
        try:
            print(f"   пробую {url}")
            download(url, archive)
        except Exception as problem:  # noqa: BLE001
            print(f"      не отдало: {type(problem).__name__}: {problem}")
            continue

        try:
            with zipfile.ZipFile(archive) as bundle:
                bundle.extractall(TOXICITY_DIRECTORY)
        except zipfile.BadZipFile:
            print("      скачалось, но это не архив — вероятно, страница-заглушка")
            archive.unlink(missing_ok=True)
            continue

        # Inside the outer archive sits one archive per language, each holding a
        # single text file and each locked with the published password.
        unpacked = 0
        for inner in sorted(TOXICITY_DIRECTORY.rglob("*_twl.zip")):
            try:
                with zipfile.ZipFile(inner) as language_bundle:
                    for entry in language_bundle.infolist():
                        if not entry.filename.endswith(".txt"):
                            continue
                        content = language_bundle.read(entry, pwd=TOXICITY_PASSWORD)
                        # Name the file by the language code alone: that is what
                        # the identifier returns, so the lookup needs no mapping.
                        code = Path(entry.filename).stem.removesuffix("_twl")
                        (TOXICITY_DIRECTORY / f"{code}.txt").write_bytes(content)
                        unpacked += 1
            except (RuntimeError, zipfile.BadZipFile) as problem:
                print(f"      {inner.name}: {problem}")

        if unpacked:
            print(f"   готово: {unpacked} списков")
            return True
        print("      архив распакован, но списков в нём нет")

    print("   НЕ ВЫШЛО: ни один источник не отдал списки")
    print("   Пятый слой (лексика по оригиналу) без них не работает — а это ровно")
    print("   тот слой, ради которого затевалась проверка на языках без разметки.")
    return False


def main() -> int:
    print("== определитель языка (NLLB LID, 218 языков)")
    language_model = fetch_language_model()
    print("== списки токсичной лексики (Toxicity-200)")
    toxicity = fetch_toxicity_lists()

    print("\n== итог")
    print(f"   определитель языка: {'есть' if language_model else 'НЕТ'}")
    print(f"   списки лексики:     {'есть' if toxicity else 'НЕТ'}")
    return 0 if (language_model and toxicity) else 1


if __name__ == "__main__":
    sys.exit(main())
