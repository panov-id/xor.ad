#!/usr/bin/env bash
# Меряет стоимость Argon2id для ПИНа на этом железе.
#
# Зачем. `depth-client` держит открытым вопрос: параметры 64 МБ / t=3 взяты по
# аналогии с кодом переноса, а у ПИНа другая модель угроз — шесть цифр, ввод при
# КАЖДОМ запуске, и от онлайнового перебора защищает счётчик узла (десять
# попыток), а не стоимость хэша. Значит выбирать надо между двумя ценами:
# задержкой на каждом старте и стоимостью офлайнового перебора украденного
# volume. Обе меряются, а не обсуждаются.
#
#   scripts/measure-argon2-pin.sh            # сетка параметров
#
# Ставим только внутрь контейнера: на хост не ставится ничего.
set -uo pipefail
IMAGE="${ARGON_IMAGE:-python:3.12-slim}"

docker run --rm "$IMAGE" sh -c '
  pip install --quiet --disable-pip-version-check argon2-cffi >/dev/null 2>&1
  python - <<"PY"
import time
from argon2.low_level import hash_secret_raw, Type

PIN = b"493028"
SALT = b"0123456789abcdef"

def measure(memory_kib, iterations, lanes=1, rounds=5):
    best = None
    for _ in range(rounds):
        start = time.perf_counter()
        hash_secret_raw(secret=PIN, salt=SALT, time_cost=iterations,
                        memory_cost=memory_kib, parallelism=lanes,
                        hash_len=32, type=Type.ID)
        elapsed = time.perf_counter() - start
        best = elapsed if best is None else min(best, elapsed)
    return best * 1000

print("    память  итераций       мс   офлайн-перебор миллиона ПИНов")
for memory_mib, iterations in ((16, 2), (32, 2), (32, 3), (64, 2), (64, 3), (128, 3), (256, 3)):
    ms = measure(memory_mib * 1024, iterations)
    hours = ms * 1_000_000 / 1000 / 3600
    print(f"{memory_mib:>8} МБ {iterations:>9} {ms:>8.0f}   {hours:>8.1f} ч на одном ядре")
PY
'
