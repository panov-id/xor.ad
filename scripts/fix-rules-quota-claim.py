#!/usr/bin/env python3
"""Убирает из опубликованных правил утверждение, что жалобы и блокировки режут квоту.

26.08.2026 решено обратное — и решение записано в механике витрин и на экране 5:
жалоба скрывает сообщение у пожаловавшегося и считается к порогу, блокировка
разводит двоих, а квота автора не страдает ни от того, ни от другого. Довод:
резать чужую квоту одним нажатием значит дать одному человеку молча урезать
другому голос.

Правила сообщества переведены на 17 языков у одной витрины и 10 у другой, и
отменённое утверждение живёт в части из них. Это документ, который человек
принимает чекбоксом при регистрации, — расхождение здесь дороже, чем в спеке.

Предложение **удаляется**, а не переписывается. Переписать его правильно на
десяти языках я не могу, а плохой юридический перевод хуже отсутствующего
предложения: соседние фразы абзаца остаются верными и без него.

    scripts/fix-rules-quota-claim.py            # показать, что будет удалено
    scripts/fix-rules-quota-claim.py --apply    # удалить
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
REPOS = ("sosed.place", "neighbro.place")

# Точные предложения, найденные в файлах. Не regex по корню слова: «квота»
# встречается и в верных фразах — например, в разделе о последствиях нарушений,
# где снижение квоты остаётся правдой, потому что его назначает модерация, а не
# чужое нажатие.
SENTENCES = [
    "Reports and blocks reduce the author's posting quota.",
    "Жалобы и блокировки снижают квоту публикаций автора.",
    "Şikayət və bloklar müəllifin post kvotasını azaldır.",
    "Shikoyat va bloklar muallifning eʼlon qilish kvotasini kamaytiradi.",
    "Las denuncias y bloqueos reducen la cuota de publicación del autor.",
    "Zgłoszenia i blokady obniżają limit publikacji autora.",
]
# Языки, где предложение известно по началу, но хвост может отличаться пунктуацией.
PREFIXES = [
    "Les signalements et les blocages réduisent le quota",
    "Οι αναφορές και τα μπλοκαρίσματα μειώνουν το όριο",
    "Шағымдар мен бөгеулер автордың жарияланым квотасын",
    "Даттануулар жана блоктоолор автордун жарыялоо квотасын",
    "Скарги та блокування зменшують квоту",
    "Скаргі і блакіроўкі змяншаюць квоту",
]

apply = "--apply" in sys.argv
touched, found = 0, 0

for repo in REPOS:
    for path in sorted((ROOT / repo / "landing" / "legal").glob("community-guidelines_*.md")):
        text = path.read_text(encoding="utf-8")
        original = text

        for sentence in SENTENCES:
            if sentence in text:
                found += 1
                print(f"  − {path.relative_to(ROOT)}: {sentence[:70]}")
                text = text.replace(sentence + " ", "").replace(sentence, "")

        for prefix in PREFIXES:
            match = re.search(re.escape(prefix) + r"[^.]*\.", text)
            if match:
                found += 1
                print(f"  − {path.relative_to(ROOT)}: {match.group(0)[:70]}")
                text = text.replace(match.group(0) + " ", "").replace(match.group(0), "")

        if text != original:
            touched += 1
            if apply:
                path.write_text(text, encoding="utf-8")

print()
print(f"файлов затронуто: {touched}, предложений найдено: {found}")
if not apply:
    print("(показ) ничего не записано. --apply — удалить.")
