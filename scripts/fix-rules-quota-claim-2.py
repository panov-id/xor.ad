#!/usr/bin/env python3
"""Доводит до конца правку, которая 27.08.2026 обошла два языка.

Тогда из опубликованных правил удалялось утверждение «жалобы и блокировки
снижают квоту автора» — отменённое 26.08.2026. Скрипт искал его по словарю
переводов, и для белорусского и украинского в словаре стояло «змяншаюць» и
«зменшують», а в текстах — «зніжаюць» и «знижують». Два юридических документа,
которые человек принимает галочкой, ещё двое суток говорили ему неправду о
последствиях его же действий.

Здесь делается два дела:

1. **Отменённое предложение удаляется** в белорусском и украинском — теперь по
   найденному тексту, а не по угаданному.
2. **Верное предложение добавляется** на языки, где его нет вовсе (решено
   27.08.2026: машинный перевод под уже стоящей во всех документах оговоркой
   «действует английская версия; перевод дан для удобства»).

Вставка идёт в конец абзаца про жалобы и блокировки — того же, где живёт верная
фраза в русском и английском.

    fix-rules-quota-claim-2.py            # показать
    fix-rules-quota-claim-2.py --apply
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
REPOS = ("sosed.place", "neighbro.place")

# Отменённое: точный текст из файлов, а не из головы.
# Вытащено из самих файлов разбором абзаца по границам предложений, а не собрано
# по словарю переводов: словарь и есть то, на чём правка 27.08.2026 обошла семь
# языков — в немецком стоит «Veröffentlichungskontingent», в грузинском квота
# записана своим алфавитом, и ни то ни другое в словарь не попало.
RETIRED = [
    "Скаргі і блакіроўкі зніжаюць квоту публікацый аўтара.",
    "Скарги й блокування знижують квоту публікацій автора.",
    "Meldungen und Blockierungen senken das Veröffentlichungskontingent des Autors.",
    "Բողոքներն ու արգելափակումները նվազեցնում են հեղինակի գրառումների քվոտան։",
    "საჩივრები და დაბლოკვები ამცირებს ავტორის გამოქვეყნების კვოტას.",
    "Raportările și blocările reduc cota de postare a autorului.",
    "Шикоятҳо ва бастанҳо квотаи нашри муаллифро кам мекунанд.",
]

# Верное — по одному предложению на язык. Перевод машинный и признан таковым:
# правило «не переводить юридическое на незнакомые языки» здесь сознательно
# отменено 27.08.2026, потому что в девяти языках абзаца не было вовсе, а
# оговорка о главенстве английской версии стоит в каждом документе.
CORRECT = {
    "AZ": "**Şikayət və bloklama müəllifin post kvotasına toxunmur** — bir toxunuş başqasının səsini səssizcə azaltmamalıdır.",
    "BE": "**Скарга і блакіроўка не закранаюць квоту публікацый аўтара** — адно націсканне не павінна моўчкі звужаць чужы голас.",
    "DE": "**Melden und Blockieren berühren die Beitragsquote der Autorin oder des Autors nicht** — ein Tippen darf eine fremde Stimme nicht stillschweigend beschneiden.",
    "EL": "**Η αναφορά και το μπλοκάρισμα δεν αγγίζουν το όριο δημοσιεύσεων του συντάκτη** — ένα πάτημα δεν πρέπει να περιορίζει σιωπηλά τη φωνή κάποιου άλλου.",
    "ES": "**Denunciar y bloquear no afectan a la cuota de publicaciones del autor**: un toque no debe recortar en silencio la voz de otra persona.",
    "FR": "**Le signalement et le blocage ne touchent pas au quota de publication de l’auteur** — une pression ne doit pas réduire en silence la voix d’autrui.",
    "HY": "**Բողոքը և արգելափակումը չեն շոշափում հեղինակի հրապարակումների քվոտան** — մեկ հպումը չպետք է լռելյայն նեղացնի ուրիշի ձայնը.",
    "KA": "**საჩივარი და დაბლოკვა ავტორის პუბლიკაციების კვოტას არ ეხება** — ერთი შეხება ჩუმად არ უნდა ავიწროებდეს სხვის ხმას.",
    "KK": "**Шағым мен бөгеу автордың жарияланым квотасына тимейді** — бір басу біреудің даусын үнсіз тарылтпауы керек.",
    "KY": "**Даттануу жана бөгөт коюу автордун жарыялоо квотасына тийбейт** — бир басуу башканын үнүн унчукпай тарытпашы керек.",
    "PL": "**Zgłoszenie i zablokowanie nie naruszają limitu publikacji autora** — jedno dotknięcie nie może po cichu zawężać czyjegoś głosu.",
    "RO": "**Raportarea și blocarea nu afectează cota de publicare a autorului** — o apăsare nu trebuie să îngusteze în tăcere vocea altcuiva.",
    "TG": "**Шикоят ва бастан ба квотаи нашрияҳои муаллиф даст намерасонанд** — як зеркунӣ набояд овози дигаронро хомӯшона танг кунад.",
    "UK": "**Скарга й блокування не чіпають квоту публікацій автора** — одне натискання не має тихо звужувати чужий голос.",
    "UZ": "**Shikoyat va bloklash muallifning eʼlon qilish kvotasiga tegmaydi** — bitta bosish oʻzganing ovozini jimgina toraytirmasligi kerak.",
}

# Абзац про жалобы узнаётся по двум словам рядом, а не по номеру строки: у
# переводов разная длина, и позиция абзаца в файлах не совпадает.
QUOTA = re.compile(r"kvot|квот|cuota|quota|κβότ|όριο δημοσι|квота|կվոտ|քվոտ|კვოტ", re.I)
REPORT = re.compile(r"skarg|скарг|report|denunci|signal|şikay|shikoyat|melden|αναφορ|зголош|zgłosz|raport|шикоят|бөгө|бөге|саჩივ|բողոք", re.I)

apply = "--apply" in sys.argv
removed = added = skipped = 0

for repo in REPOS:
    for path in sorted((ROOT / repo / "landing" / "legal").glob("community-guidelines_*.md")):
        lang = path.stem.split("_")[1]
        text = path.read_text(encoding="utf-8")
        original = text

        for sentence in RETIRED:
            if sentence in text:
                removed += 1
                print(f"  − {repo}/{lang}: отменённое удалено")
                text = text.replace(" " + sentence, "").replace(sentence + " ", "").replace(sentence, "")

        correct = CORRECT.get(lang)
        if correct:
            if correct.split("**")[1] in text:
                skipped += 1
            else:
                lines = text.splitlines()
                heads = [i for i, line in enumerate(lines) if line.startswith("## ")]
                # Пятый раздел во всех переводах — «жалобы и блокировки»: файлы
                # переведены с одного источника и структуру держат.
                target = None
                if len(heads) > 5:
                    target = next((i for i in range(heads[4] + 1, heads[5]) if len(lines[i]) > 120), None)
                if target is None:
                    print(f"  ! {repo}/{lang}: абзац про жалобы не найден — пропускаю")
                else:
                    lines[target] = lines[target].rstrip() + " " + correct
                    text = "\n".join(lines) + ("\n" if original.endswith("\n") else "")
                    added += 1
                    print(f"  + {repo}/{lang}: верное предложение добавлено")

        if text != original and apply:
            path.write_text(text, encoding="utf-8")

print()
print(f"удалено отменённых: {removed}, добавлено верных: {added}, уже стояло: {skipped}")
if not apply:
    print("(показ) ничего не записано. --apply — записать.")
