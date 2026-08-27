#!/usr/bin/env python3
"""Сводит замер к числам, по которым принимается решение о ветке модерации.

`evaluation.json` содержит по 300 размеченных человеком примеров на язык и два
чтения каждого: `native` — мультиязычный классификатор по оригиналу, `translated`
— перевод в английский и английский классификатор. Файл лежит с 04.08.2026, но
вывода из него никто не сделал, а §8.14 спеки требует именно замер, а не спор.

Считаем по каждой ветке долю верных решений, где «решение» — сравнение оценки с
порогом. Порог не задан заранее: он подбирается по самим данным, потому что
выбирать его на глаз означало бы подгонять вывод.

Загрязнённые языки (`contaminates`) считаются отдельно и в итог не идут: там
модель мерили на её же обучающем наборе, и число льстивое.

    python summarize.py            # сводка
    python summarize.py --csv      # то же машиночитаемо
"""
from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent


def rates(scores: list[float], labels: list[int], threshold: float) -> dict:
    tp = sum(1 for s, y in zip(scores, labels) if s >= threshold and y == 1)
    fp = sum(1 for s, y in zip(scores, labels) if s >= threshold and y == 0)
    fn = sum(1 for s, y in zip(scores, labels) if s < threshold and y == 1)
    tn = sum(1 for s, y in zip(scores, labels) if s < threshold and y == 0)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": precision, "recall": recall, "f1": f1,
            "accuracy": (tp + tn) / len(labels) if labels else 0.0}


def best_threshold(scores: list[float], labels: list[int]) -> tuple[float, dict]:
    """Порог, дающий лучший F1. Перебираем сами оценки — их и так триста."""
    best = (0.5, rates(scores, labels, 0.5))
    for candidate in sorted(set(round(s, 3) for s in scores)):
        current = rates(scores, labels, candidate)
        if current["f1"] > best[1]["f1"]:
            best = (candidate, current)
    return best


def main() -> int:
    data = json.loads((HERE / "evaluation.json").read_text(encoding="utf-8"))
    as_csv = "--csv" in sys.argv
    if as_csv:
        print("language,arm,contaminated,threshold,precision,recall,f1,accuracy,seconds")

    totals: dict[str, list[float]] = {"native": [], "translated": []}
    clean_languages = []

    for row in data:
        language = row["language"]
        labels = row["labels"]
        contaminated = bool(row.get("contaminates"))
        if not contaminated:
            clean_languages.append(language)
        if not as_csv:
            mark = "  (загрязнён — в итог не идёт)" if contaminated else ""
            print(f"\n{language}, примеров {row['count']}{mark}")
        for arm in ("native", "translated"):
            scores = row["scores"][arm]
            threshold, r = best_threshold(scores, labels)
            seconds = (row.get("seconds") or {}).get(arm, 0)
            if not contaminated:
                totals[arm].append(r["f1"])
            if as_csv:
                print(f"{language},{arm},{int(contaminated)},{threshold:.3f},"
                      f"{r['precision']:.3f},{r['recall']:.3f},{r['f1']:.3f},"
                      f"{r['accuracy']:.3f},{seconds}")
            else:
                print(f"  {arm:11} порог {threshold:.2f}  точность {r['precision']:.2f}  "
                      f"полнота {r['recall']:.2f}  F1 {r['f1']:.2f}  верных {r['accuracy']:.0%}")

    if as_csv:
        return 0

    print("\n" + "=" * 64)
    print(f"незагрязнённых языков: {len(clean_languages)} — {', '.join(clean_languages)}")
    for arm in ("native", "translated"):
        values = totals[arm]
        if values:
            print(f"  {arm:11} средний F1 по ним: {sum(values) / len(values):.3f}"
                  f"   худший язык: {min(values):.3f}")
    # Отдельно — то, что и будет в проде: ОДИН порог на все языки. Порог на язык
    # подбирать нельзя, потому что язык узнаётся тем же конвейером и с ошибкой, а
    # калибровать девять чисел по горстке примеров значит подгонять их под замер.
    print("\n" + "-" * 64)
    print("один порог на все языки (так и будет в проде):")
    for arm in ("native", "translated"):
        pooled_scores, pooled_labels = [], []
        for row in data:
            if row.get("contaminates"):
                continue
            pooled_scores += row["scores"][arm]
            pooled_labels += row["labels"]
        threshold, r = best_threshold(pooled_scores, pooled_labels)
        per_language = []
        for row in data:
            if row.get("contaminates"):
                continue
            per_language.append((row["language"],
                                 rates(row["scores"][arm], row["labels"], threshold)["f1"]))
        worst = min(per_language, key=lambda x: x[1])
        print(f"  {arm:11} порог {threshold:.2f}  F1 общий {r['f1']:.3f}  "
              f"точность {r['precision']:.2f}  полнота {r['recall']:.2f}  "
              f"худший язык {worst[0]} {worst[1]:.3f}")

    if totals["native"] and totals["translated"]:
        gap = sum(totals['native']) / len(totals['native']) - \
              sum(totals['translated']) / len(totals['translated'])
        better = "по оригиналу" if gap > 0 else "через перевод"
        print(f"\nразрыв: {abs(gap):.3f} в пользу ветки «{better}»")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
