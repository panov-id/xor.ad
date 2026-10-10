#!/usr/bin/env python3
"""One form of address per language (П29; decided 2026-10-10 by quorum on the principle
of the majority form of a language's keys; rejected: ty in the headers).

A dictionary key is T (informal) when it carries a marker of the informal second person
and none of the formal one, V (formal) in the opposite case. Markers are pronouns and
possessives, and the verb/imperative forms that exist in one register only. Keys with no
address at all count for neither side. The gate counts the keys of depth/ink/locales and
web/src/locales per language (the web reads both), takes the form with more keys as the
language's own, and goes red on every key of the other form (and on a key mixing both),
except the lines listed in scripts/check-address-form.allow (a line addressed to the two
people of one conversation at once is neither T nor V).

  scripts/check-address-form.py [--root DIR] [--table] [--list LANG T|V|BOTH]

Exit: 0 on one form per language, 1 on a key of the other form, 2 on a broken tree.
English has no such distinction and is not checked."""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def rx(words):
    return re.compile(r"(?<![\w])(?:%s)(?![\w])" % "|".join(words), re.I)


# Strong markers only: a pronoun, or a verb form that exists in that register only.
M = {
 "ru": (rx([r"ты", r"тебя", r"тебе", r"тобой", r"тво(?:й|я|ё|е|его|ей|ему|ю|и|их|им|ими)", r"\w+(?:ешь|ишь|ёшь)",
            r"расширь", r"загляни", r"выбери", r"запиши", r"открой", r"нажми", r"введи", r"напиши", r"проверь", r"повтори", r"подожди", r"попробуй", r"скажи", r"сверь", r"верни"]),
        rx([r"вы", r"вас", r"вам", r"вами", r"ваш\w*", r"\w+(?:ете|ите|ёте)", r"\w+(?:йте|ьте)"])),
 "uk": (rx([r"ти", r"тебе", r"тобі", r"тобою", r"тво(?:й|я|є|го|єї|їй|ю|ї|їх|їм)", r"\w+(?:єш|їш|еш|иш|аєш|ієш)",
            r"розшир", r"зазирни", r"вибери", r"запиши", r"відкрий", r"натисни", r"введи", r"напиши", r"перевір", r"повтори", r"зачекай", r"спробуй", r"скажи", r"звір", r"верни"]),
        rx([r"ви", r"вас", r"вам", r"вами", r"ваш\w*", r"\w+(?:єте|ете|ите|їте|іть)", r"\w+(?:йте|ьте)"])),
 "be": (rx([r"ты", r"цябе", r"табе", r"табой", r"тв(?:ой|ая|аё|айго|аёй|аю|ае|айму|аіх)", r"\w+(?:еш|іш|яш|аеш|ёш)",
            r"пашыр", r"зазірні", r"абяры", r"запішы", r"адкрый", r"націсні", r"праверы", r"паўтары", r"пачакай", r"паспрабуй", r"скажы", r"звер"]),
        rx([r"вы", r"вас", r"вам", r"вамі", r"ваш\w*", r"\w+(?:еце|іце|яце|аеце)", r"\w+(?:ыце|ойце|уйце|ійце|рце|ьце)"])),
 "kk": (rx([r"сен", r"сенің", r"саған", r"сені", r"сенімен", r"сенде", r"\w+(?:сың|сің)", r"кеңейт", r"кір", r"қайтала", r"тексер"]),
        rx([r"сіз", r"сіздің", r"сізге", r"сізді", r"сізбен", r"сізде", r"\w+(?:ыңыз|іңіз|ңыз|ңіз)", r"\w+(?:сыз|сіз)(?<!жоқсыз)"])),
 "ka": (rx([r"შენ(?:ი|ს|მა|ც|თან)?", r"\w*ხარ"]), rx([r"თქვენ\w*", r"\w+(?:ეთ|ათ|ოთ)"])),
 "pl": (rx([r"ty", r"ciebie", r"tobie", r"tobą", r"tw(?:ój|oja|oje|ojego|oją|ojej|oich|oim|oimi)", r"\w+(?:esz|isz|asz|ysz)", r"\w+(?:łeś|łaś)",
            r"sprawdź", r"zajrzyj", r"wybierz", r"zapisz", r"otwórz", r"naciśnij", r"wpisz", r"napisz", r"powtórz", r"poczekaj", r"spróbuj", r"zgłoś", r"poszerz"]),
        rx([r"pan", r"pani", r"państw\w*", r"proszę"])),
 "fr": (rx([r"tu", r"toi", r"ton", r"ta", r"tes", r"te", r"t'\w+"]),
        rx([r"vous", r"votre", r"vos", r"(?!chez|assez|nez|rez)\w+ez"])),
 "de": (rx([r"du", r"dich", r"dir", r"dein\w*", r"kannst", r"bist", r"hast", r"willst", r"musst", r"siehst", r"weißt"]), None),
 "es": (rx([r"tú", r"ti", r"te", r"tu", r"tus", r"contigo", r"revisa", r"comprueba", r"elige", r"escribe", r"abre", r"pulsa", r"introduce", r"repite", r"espera", r"inténtalo", r"vuelve", r"pide", r"envía", r"mira", r"amplía", r"querías", r"estás", r"tienes", r"puedes", r"quieres"]),
        rx([r"usted", r"ustedes", r"revise", r"compruebe", r"elija", r"escriba", r"abra", r"pulse", r"introduzca", r"repita", r"espere", r"inténtelo", r"vuelva", r"pida", r"mire", r"amplíe"])),
 "el": (rx([r"εσύ", r"σου", r"θέλεις", r"έχεις", r"μπορείς", r"βγεις", r"ξέρεις", r"πρέπει\s+να\s+σου", r"πέρνα", r"έλεγξε", r"δοκίμασε", r"γράψε", r"πάτα", r"επανάλαβε", r"περίμενε", r"είσαι"]),
        rx([r"σας", r"εσείς", r"\w+(?:ετε|ατε|είτε|ήστε|ίστε)"])),
 "hy": (rx([r"դու", r"քո", r"քեզ", r"քեզնից", r"չես", r"\w+եցիր", r"նայիր", r"մեծացրու", r"փորձիր", r"գրիր", r"ստուգիր", r"խնդրիր", r"բացիր", r"համաձայնես", r"դուրս\s+գաս"]),
        rx([r"դուք", r"ձեր", r"ձեզ", r"\w+եք", r"ուղարկեք", r"ստուգեք", r"փորձեք", r"սպասեք", r"նայեք"])),
 "az": (rx([r"sən", r"sənin", r"səni", r"sənə", r"(?!insan)\w+(?:san|sən)", r"genişləndir", r"çıxsan", r"bloklayırsan"]),
        rx([r"siz", r"sizin", r"sizi", r"sizə", r"\w+(?:sınız|siniz|sunuz|sünüz)", r"\w+(?:yın|yin|edin|ədin|ərin|ayın|ərsiniz)", r"yoxlayın", r"göndərin", r"baxın", r"gözləyin", r"seçin", r"yazın"])),
 "uz": (rx([r"sen", r"sening", r"seni", r"senga", r"\w+(?:san|sang)", r"kengaytir", r"kir", r"qara", r"tekshir", r"yubor", r"kut", r"yoz", r"tanla"]),
        rx([r"siz", r"sizning", r"sizni", r"sizga", r"\w+(?:ingiz|ngiz)", r"tekshiring", r"yuboring", r"kuting", r"qarang", r"yuring", r"kiriting", r"yozing", r"tanlang", r"oching"])),
 "ky": (rx([r"сен", r"сенин", r"сени", r"сага", r"\w+(?:сың|сиң)", r"кеңейт", r"кир", r"текшер", r"жөнөт", r"күт"]),
        rx([r"сиз", r"сиздин", r"сизди", r"сизге", r"\w+(?:ыңыз|иңиз|ңыз|ңиз)", r"\w+(?:сыз|сиз)(?<!жок)"])),
 "tg": (rx([r"ту", r"туро", r"барои\s+ту", r"мешавӣ", r"бароӣ", r"нанавиштаӣ", r"васеъ\s+кун", r"даро", r"санҷ", r"фирист", r"интизор\s+шав"]),
        rx([r"шумо", r"шуморо", r"\w+(?:ед)", r"\w+тон\w*"])),
 "ro": (rx([r"tu", r"tău", r"ta", r"tale", r"tine", r"te", r"ți", r"ești", r"ai", r"mărește", r"revino", r"verifică", r"încearcă", r"trimite", r"alege", r"scrie", r"deschide", r"așteaptă"]),
        rx([r"dumneavoastră", r"dvs", r"vă", r"vostru", r"\w+(?:ați|iți|eți|uți)"])),
}
# German: "Sie"/"Ihr…" are formal only when capitalised in the middle of a sentence.
DE_V = re.compile(r"(?<=[a-zäöüß,;:–—\)] )(?:Sie|Ihnen|Ihr\w*)(?![\w])|(?:^|[.!?] )(?:Prüfen|Warten|Senden|Geben|Wählen|Erweitern|Versuchen|Schreiben|Öffnen|Sehen)\s+Sie(?![\w])")


def classify(lang, text):
    t, v = M[lang]
    return bool(t.search(text)), bool(DE_V.search(text)) if lang == "de" else bool(v.search(text))


def load(root, lang):
    depth = json.load(open(os.path.join(root, "depth/ink/locales", f"{lang}.json")))
    path = os.path.join(root, "web/src/locales", f"{lang}.json")
    return depth, (json.load(open(path)) if os.path.exists(path) else {})


def rows(root, lang):
    """(source, key, value, 'T'|'V'|'BOTH') for every key with an address in it."""
    out = []
    for src, dd in zip(("depth", "web"), load(root, lang)):
        for key, value in dd.items():
            t, v = classify(lang, str(value))
            if t or v:
                out.append((src, key, str(value), "BOTH" if t and v else "T" if t else "V"))
    return out


def allowed(root):
    path = os.path.join(root, "scripts/check-address-form.allow")
    if not os.path.exists(path):
        return set()
    return {tuple(l.rstrip("\n").split("\t")[:2]) for l in open(path, encoding="utf-8") if l.strip() and not l.startswith("#")}


def main(argv):
    root = os.path.abspath(os.path.join(HERE, ".."))
    args = list(argv)
    if "--root" in args:
        i = args.index("--root")
        root = os.path.abspath(args[i + 1])
        del args[i:i + 2]
    try:
        if args[:1] == ["--list"]:
            for src, key, value, kind in rows(root, args[1]):
                if kind == args[2]:
                    print(f"{src}\t{key}\t{value}")
            return 0
        free = allowed(root)
        bad = 0
        if args[:1] == ["--table"]:
            print(f"{'lang':5}{'T':>6}{'V':>6}{'both':>6}  own form")
        for lang in M:
            r = rows(root, lang)
            t = sum(1 for x in r if x[3] == "T")
            v = sum(1 for x in r if x[3] == "V")
            both = sum(1 for x in r if x[3] == "BOTH")
            own = "V" if v > t else "T"
            stray = [x for x in r if x[3] != own and (lang, x[1]) not in free]
            if args[:1] == ["--table"]:
                print(f"{lang:5}{t:>6}{v:>6}{both:>6}  {own}  (outside it: {len(stray)})")
            for src, key, value, kind in stray[:5]:
                print(f"  ✗ {lang}: {src} {key} is {kind}, the language's own form is {own}: {value[:90]}")
            if len(stray) > 5:
                print(f"  ✗ {lang}: and {len(stray) - 5} more")
            bad += len(stray)
        if bad:
            print(f"keys outside their language's own form of address: {bad}", file=sys.stderr)
            return 1
        print("one form of address per language: ok")
        return 0
    except (OSError, KeyError, ValueError) as e:
        print(f"broken tree: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
