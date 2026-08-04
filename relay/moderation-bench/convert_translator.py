"""Convert the translation model to CTranslate2, quantized to int8.

Done once into the mounted cache. The converted model is roughly a quarter the
size of the float32 original, which matters twice over: the production node has
6 GB of usable memory and shares it with the relay and the database, and a
smaller model is also a faster one because less of it has to move through memory
per token.

    python convert_translator.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from translators import CONVERTED_DIRECTORY

MODEL = os.environ.get("TRANSLATION_MODEL", "facebook/nllb-200-distilled-600M")


def directory_size(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def main() -> int:
    if CONVERTED_DIRECTORY.is_dir():
        print(f"уже сконвертировано: {CONVERTED_DIRECTORY} "
              f"({directory_size(CONVERTED_DIRECTORY) // (1 << 20)} МБ)")
        return 0

    command = [
        "ct2-transformers-converter",
        "--model", MODEL,
        "--output_dir", str(CONVERTED_DIRECTORY),
        "--quantization", "int8",
    ]
    print("конвертирую:", " ".join(command))
    result = subprocess.run(command, check=False)
    if result.returncode != 0:
        # Leave nothing half-converted behind: a partial directory would load and
        # then fail somewhere far from here.
        shutil.rmtree(CONVERTED_DIRECTORY, ignore_errors=True)
        print("НЕ ВЫШЛО: конвертация завершилась с ошибкой", file=sys.stderr)
        return 1

    print(f"готово: {CONVERTED_DIRECTORY}, "
          f"{directory_size(CONVERTED_DIRECTORY) // (1 << 20)} МБ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
