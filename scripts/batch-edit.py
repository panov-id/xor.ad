#!/usr/bin/env python3
"""Пачка правок документов из одного JSON — всё или ничего.

    scripts/batch-edit.py batch.json             применить
    scripts/batch-edit.py batch.json --dry-run   показать дифф, ничего не писать
    scripts/batch-edit.py batch.json --root DIR  группа репозиториев в другом месте (для пробы)

Зачем. 14–15.09.2026 каждая пачка доводки была одноразовым скриптом на Python:
замены «ровно одно совпадение», зеркало в две витрины, бренд в юр-текстах, потом
контрольный grep по снятым формулировкам. Двенадцать скриптов повторяли одно и то
же, и каждый раз одно правило держалось на памяти: забытая EN-половина, витрина,
куда правка не доехала, снятая фраза, которую потом никто не искал.

Формат (пути — от корня группы репозиториев):

    {
      "edits":  [{"file": "xor.ad/docs/chat_RU.md", "old": "…", "new": "…"}],
      "screens": [{"file": "docs/11-empty-and-edge-states_RU.md", "old": "…", "new": "…"}],
      "legal":  [{"file": "landing/legal/terms_EN.md", "old": "… {domain} …", "new": "…"}],
      "retired": [{"phrase": "…", "files": "chat_RU.md chat_EN.md", "why": "…, 15.09.2026"}],
      "unpaired": {"xor.ad/docs/x_RU.md": "почему EN-половину не трогаем"}
    }

  edits    — как есть, в одном файле;
  screens  — одна и та же правка в sosed.place и neighbro.place (экраны зеркальны байт в байт);
  legal    — в обеих витринах, с подстановкой {brand} и {domain} (sosed / sosed.place,
             Neighbro / neighbro.place); юр-тексты совпадают только с точностью до бренда;
  retired  — дописывается в xor.ad/docs/retired-terms.txt, если такой строки там ещё нет;
             дальше её ищет check-retired-terms, а не глаз.

Правила, из-за которых пачка отклоняется целиком (код 1):
  * замена находится не ровно один раз (с учётом уже применённых замен того же файла);
  * у файла *_RU.md в пачке нет правки его *_EN.md, и наоборот, и причина не названа в unpaired;
  * файла нет.
Код 2 — пачка не читается.
"""
import argparse
import difflib
import json
import pathlib
import sys

FACES = {"sosed.place": {"brand": "sosed", "domain": "sosed.place"},
         "neighbro.place": {"brand": "Neighbro", "domain": "neighbro.place"}}
REGISTRY = "xor.ad/docs/retired-terms.txt"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("batch")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--root", default=str(pathlib.Path(__file__).resolve().parents[2]))
    args = ap.parse_args()
    root = pathlib.Path(args.root)

    try:
        batch = json.loads(pathlib.Path(args.batch).read_text())
    except (OSError, ValueError) as e:
        print(f"пачка не читается: {e}", file=sys.stderr)
        return 2

    ops = []  # (path relative to root, old, new)
    for e in batch.get("edits", []):
        ops.append((e["file"], e["old"], e["new"]))
    for e in batch.get("screens", []):
        for face in FACES:
            ops.append((f"{face}/{e['file']}", e["old"], e["new"]))
    for e in batch.get("legal", []):
        for face, sub in FACES.items():
            ops.append((f"{face}/{e['file']}", e["old"].format(**sub), e["new"].format(**sub)))

    errors, texts, originals = [], {}, {}
    for rel, old, new in ops:
        p = root / rel
        if not p.exists():
            errors.append(f"нет файла: {rel}")
            continue
        if p not in texts:
            texts[p] = originals[p] = p.read_text()
        n = texts[p].count(old)
        if n != 1:
            errors.append(f"{rel}: совпадений {n}, нужно ровно одно — {old[:70]!r}")
            continue
        texts[p] = texts[p].replace(old, new)

    touched = {str(p.relative_to(root)) for p in texts}
    unpaired = batch.get("unpaired", {})
    for rel in sorted(touched):
        for a, b in (("_RU.md", "_EN.md"), ("_EN.md", "_RU.md")):
            if rel.endswith(a):
                twin = rel[: -len(a)] + b
                if (root / twin).exists() and twin not in touched and rel not in unpaired:
                    errors.append(f"{rel}: правка без пары {twin} — добавьте её или назовите причину в unpaired")

    retired_lines = []
    for r in batch.get("retired", []):
        line = f"{r['phrase']} | {r['files']} | {r['why']}"
        reg = root / REGISTRY
        current = reg.read_text() if reg.exists() else ""
        if not reg.exists():
            errors.append(f"нет реестра {REGISTRY}")
        elif not any(l.split("|")[0].strip() == r["phrase"].strip() for l in current.splitlines() if "|" in l and not l.startswith("#")):
            retired_lines.append(line)

    if errors:
        print("пачка отклонена целиком:", file=sys.stderr)
        for e in errors:
            print("  ✗ " + e, file=sys.stderr)
        return 1

    for p, t in texts.items():
        if t == originals[p]:
            continue
        rel = str(p.relative_to(root))
        if args.dry_run:
            sys.stdout.writelines(difflib.unified_diff(originals[p].splitlines(True), t.splitlines(True), rel, rel, n=1))
        else:
            p.write_text(t)
    if retired_lines:
        if args.dry_run:
            print(f"+ в {REGISTRY}:\n  " + "\n  ".join(retired_lines))
        else:
            reg = root / REGISTRY
            reg.write_text(reg.read_text().rstrip("\n") + "\n" + "\n".join(retired_lines) + "\n")

    verb = "показано" if args.dry_run else "применено"
    print(f"{verb}: замен {len(ops)} в файлах {len(texts)}, снятых формулировок в реестр {len(retired_lines)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
