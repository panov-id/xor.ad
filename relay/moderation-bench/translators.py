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


# --- Семейства моделей -------------------------------------------------------
#
# Переводчик перестал быть одной моделью 11.09.2026: у NLLB-200 лицензия
# cc-by-nc-4.0 (проверено в реестре моделей), то есть некоммерческая, а лента
# несёт соседские офферы и рядом живёт кнопка донатов — на том же доводе об
# экономической деятельности держится статус микропредприятия по ст. 19 DSA.
# Значит выбор переводчика должен стать замером, а не допущением, и стенд обязан
# уметь сравнивать модели с разной лицензией.
#
# Различаются они тремя вещами, и только ими: как называется язык-источник, как
# сказать «переведи на английский» и надо ли что-то дописать в сам текст.
# Определитель языка (lid218e) всегда отдаёт коды NLLB вида `rus_Cyrl`, поэтому
# перевод кода — часть семейства, а не вызывающего кода.

NLLB_TO_ISO = {
    "eng_Latn": "en", "rus_Cyrl": "ru", "deu_Latn": "de", "ell_Grek": "el",
    "spa_Latn": "es", "fra_Latn": "fr", "pol_Latn": "pl", "ukr_Cyrl": "uk",
    "ron_Latn": "ro", "bel_Cyrl": "be", "kaz_Cyrl": "kk", "uzn_Latn": "uz",
    "azj_Latn": "az", "hye_Armn": "hy", "kat_Geor": "ka", "tgk_Cyrl": "tg",
    "kir_Cyrl": "ky", "tur_Latn": "tr", "ita_Latn": "it", "por_Latn": "pt",
}


class NllbFamily:
    """Коды вида `rus_Cyrl`, целевой язык — принудительным первым токеном."""

    name = "nllb"
    english = "eng_Latn"

    def source(self, language: str) -> str:
        return language

    def prepare(self, text: str, language: str) -> str:
        return text

    def forced_token(self, tokenizer):
        return tokenizer.convert_tokens_to_ids(self.english)


class M2M100Family:
    """Коды ISO (`ru`), целевой язык — через get_lang_id."""

    name = "m2m100"
    english = "en"

    def source(self, language: str) -> str:
        return NLLB_TO_ISO.get(language, language)

    def prepare(self, text: str, language: str) -> str:
        return text

    def forced_token(self, tokenizer):
        return tokenizer.get_lang_id(self.english)


class MadladFamily:
    """Языка-источника не спрашивает вовсе: цель пишется префиксом в текст."""

    name = "madlad"
    english = "en"

    def source(self, language: str) -> str:
        return ""

    def prepare(self, text: str, language: str) -> str:
        return f"<2{self.english}> {text}"

    def forced_token(self, tokenizer):
        return None


def family_of(model_name: str):
    lowered = model_name.lower()
    if "m2m100" in lowered:
        return M2M100Family()
    if "madlad" in lowered:
        return MadladFamily()
    return NllbFamily()



class TransformersTranslator:
    """The reference engine: whatever transformers does out of the box."""

    name = "transformers"

    def __init__(self, model_name: str) -> None:
        self.model = None
        self.tokenizer = None
        self.failure = None
        self.family = family_of(model_name)
        self.model_name = model_name
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

            source = self.family.source(language)
            if source:
                self.tokenizer.src_lang = source
            prepared = self.family.prepare(text, language)
            encoded = self.tokenizer(prepared, return_tensors="pt", truncation=True, max_length=256)
            forced = self.family.forced_token(self.tokenizer)
            arguments = {"max_new_tokens": 128}
            if forced is not None:
                arguments["forced_bos_token_id"] = forced
            with torch.no_grad():
                produced = self.model.generate(**encoded, **arguments)
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


# Модель по умолчанию остаётся прежней, чтобы старый замер воспроизводился, но
# вызывающий больше не вшивает её: TRANSLATION_MODEL перекрывает всё, и это
# единственный способ сравнить лицензионно чистые модели с той, что мерили в
# августе (11.09.2026).
DEFAULT_MODEL = "facebook/nllb-200-distilled-600M"


def build_translator(model_name: str = ""):
    model_name = os.environ.get("TRANSLATION_MODEL") or model_name or DEFAULT_MODEL
    backend = os.environ.get("TRANSLATOR_BACKEND", "transformers")
    if backend == "ctranslate2":
        # Конвертация в int8 сделана для NLLB и лежит в своей папке. Для другой
        # модели её нет — молча подсунуть чужие веса хуже, чем отказаться.
        if family_of(model_name).name != "nllb":
            translator = TransformersTranslator(model_name)
            translator.failure = (
                f"ctranslate2 сконвертирован только для NLLB, а просят {model_name} — "
                "запускать с TRANSLATOR_BACKEND=transformers")
            return translator
        return CTranslate2Translator(model_name)
    return TransformersTranslator(model_name)
