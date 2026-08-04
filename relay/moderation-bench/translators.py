"""Translation into English, behind one interface with two engines.

Translation is the expensive layer and by a wide margin: 1.8 s of the 3 s a
message costs, with a worst case near 13 s. Everything else in the pipeline
answers in tens of milliseconds. So this is the only place where optimising is
worth the trouble.

Two engines, chosen by TRANSLATOR_BACKEND, measured against each other on the
same messages:

    transformers  the reference — plain PyTorch, float32
    ctranslate2   the same weights, quantized to int8 and run by a purpose-built
                  inference engine

Speed is not the only thing that has to be compared. Quantization changes the
arithmetic, so the translations themselves can change, and a translation that
changes can change a moderation decision. A speed-up that quietly starts
publishing what used to be blocked is not a speed-up. The bench therefore reports
both: how much faster, and how many decisions moved.
"""

from __future__ import annotations

import os
from pathlib import Path

ENGLISH = "eng_Latn"
CACHE_DIRECTORY = Path("/cache")
CONVERTED_DIRECTORY = CACHE_DIRECTORY / "nllb-ctranslate2-int8"


class TransformersTranslator:
    """The reference engine: whatever transformers does out of the box."""

    name = "transformers"

    def __init__(self, model_name: str) -> None:
        self.model = None
        self.tokenizer = None
        self.failure = None
        try:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
            self.model.eval()
        except Exception as problem:  # noqa: BLE001
            self.failure = f"{type(problem).__name__}: {problem}"

    def translate(self, text: str, language: str) -> str | None:
        if self.model is None or not language or language == ENGLISH:
            return text if language == ENGLISH else None
        try:
            import torch

            self.tokenizer.src_lang = language
            encoded = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=256)
            with torch.no_grad():
                produced = self.model.generate(
                    **encoded,
                    forced_bos_token_id=self.tokenizer.convert_tokens_to_ids(ENGLISH),
                    max_new_tokens=128,
                )
            return self.tokenizer.batch_decode(produced, skip_special_tokens=True)[0]
        except Exception:  # noqa: BLE001 - an unknown source language is normal
            return None


class CTranslate2Translator:
    """The same model, quantized to int8 and run by CTranslate2.

    The tokenizer stays the transformers one — only the arithmetic changes, which
    keeps the comparison about the engine rather than about two different ways of
    cutting text into pieces.
    """

    name = "ctranslate2"

    def __init__(self, model_name: str, converted: Path = CONVERTED_DIRECTORY) -> None:
        self.translator = None
        self.tokenizer = None
        self.failure = None
        try:
            import ctranslate2
            from transformers import AutoTokenizer

            if not converted.is_dir():
                raise FileNotFoundError(f"{converted} — сначала convert_translator.py")
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.translator = ctranslate2.Translator(
                str(converted),
                device="cpu",
                # The production node has three cores and has to serve the relay
                # from them too. Letting the engine take everything would make the
                # measurement describe a machine we do not have.
                inter_threads=1,
                intra_threads=int(os.environ.get("TRANSLATOR_THREADS", "3")),
            )
        except Exception as problem:  # noqa: BLE001
            self.failure = f"{type(problem).__name__}: {problem}"

    def translate(self, text: str, language: str) -> str | None:
        if self.translator is None or not language or language == ENGLISH:
            return text if language == ENGLISH else None
        try:
            self.tokenizer.src_lang = language
            pieces = self.tokenizer.convert_ids_to_tokens(
                self.tokenizer.encode(text, truncation=True, max_length=256))
            produced = self.translator.translate_batch(
                [pieces], target_prefix=[[ENGLISH]], max_decoding_length=128)
            # The first token of the output is the language tag we forced.
            hypothesis = produced[0].hypotheses[0][1:]
            return self.tokenizer.decode(self.tokenizer.convert_tokens_to_ids(hypothesis))
        except Exception:  # noqa: BLE001
            return None


    def translate_many(self, texts: list[str], languages: list[str]) -> list[str | None]:
        """Translate a batch in one call, which is where this engine earns its keep.

        One message at a time costs about 0.6 s almost regardless of length: the
        engine spends it on overhead rather than on the sentence. A few hundred at
        once amortise that overhead away, which is the difference between a
        measurement run of minutes and one of half an hour.
        """
        if self.translator is None:
            return [None] * len(texts)
        # Grouped by source language, because the tokenizer carries the source
        # language as state and a batch has to share it.
        results: list[str | None] = [None] * len(texts)
        by_language: dict[str, list[int]] = {}
        for position, language in enumerate(languages):
            if language == ENGLISH:
                results[position] = texts[position]
            elif language:
                by_language.setdefault(language, []).append(position)

        for language, positions in by_language.items():
            try:
                self.tokenizer.src_lang = language
                pieces = [
                    self.tokenizer.convert_ids_to_tokens(
                        self.tokenizer.encode(texts[position], truncation=True, max_length=256))
                    for position in positions
                ]
                produced = self.translator.translate_batch(
                    pieces, target_prefix=[[ENGLISH]] * len(pieces), max_decoding_length=128,
                    max_batch_size=32)
                for position, outcome in zip(positions, produced):
                    hypothesis = outcome.hypotheses[0][1:]
                    results[position] = self.tokenizer.decode(
                        self.tokenizer.convert_tokens_to_ids(hypothesis))
            except Exception:  # noqa: BLE001 - an unknown source language is normal
                continue
        return results


def build_translator(model_name: str):
    backend = os.environ.get("TRANSLATOR_BACKEND", "transformers")
    if backend == "ctranslate2":
        return CTranslate2Translator(model_name)
    return TransformersTranslator(model_name)
