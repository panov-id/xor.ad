#!/usr/bin/env python3
"""Онтология xor.ad: граф памяти проекта плюс реестры фактов.

    scripts/ontology.py              состояние, граф, дефекты, пробелы
    scripts/ontology.py --state      только «где мы»
    scripts/ontology.py --check      только проверка графа (код 1 при дефектах)
    scripts/ontology.py --graph      узлы и рёбра текстом
    scripts/ontology.py --brief      две-три строки для хука старта сессии

За основу взят ~/.claude/scripts/ontology.py — общий скрипт, который держит граф
памяти любого проекта: типизированные узлы, типизированные связи, сироты, ссылки
в никуда, рассинхрон с индексом. Он здесь не правится: его правят из других
проектов, и дописывать в общий файл пути xor.ad значило бы, что каждый новый
проект требует правки чужого скрипта.

Повторено с двумя добавлениями, которых у общего нет и быть не должно:

  1. Что смотреть в проекте — данные, а не код. docs/facts/ontology.json
     называет документы, ворота и реестры. Общий скрипт ищет здесь
     docs/FIX_CHECKLIST_RU.md, PATTERNS_RU.md и docs/DECISIONS_RU.md — в xor.ad
     нет ни одного из трёх, и его «что смотреть в этом проекте» тут пусто.

  2. Заметка памяти может опереться на факт реестра: [[fact:phrase.length]].
     Ссылка проверяется — id обязан найтись в одном из реестров docs/facts.
     Без этого утверждение «длина фразы 128 символов» живёт двумя независимыми
     записями, в памяти и в реестре, и расходятся они молча: реестр проверяется
     скриптом против документов, память — ничем.

Формат заметки — тот же, что понимает общий скрипт:

    ---
    name: no-auto-deploy
    description: Не катить, пока не сказали
    metadata:
      type: feedback
    ---

    Текст факта.

    - следует из: [[deploy-state]]
    - ограничивает: [[fact:open/G11]]

Связь — строка списка «- <вид>: [[имя]]». Голая ссылка [[имя]] в тексте тоже
ребро, но вида «упоминает»: она связывает слабо и от сиротства не спасает.
"""
import argparse
import datetime
import fnmatch
import json
import pathlib
import re
import subprocess
import sys
from collections import defaultdict

# ── Онтология ────────────────────────────────────────────────────────────────
#
# Типы узлов памяти заданы форматом самой памяти — это метки, по которым заметка
# попадает в контекст, и расширять их нельзя. Пятый тип, fact, живёт не в памяти,
# а в реестрах docs/facts: он лист графа, у него нет исходящих связей, и заметка
# на него опирается, а не наоборот.
NODE_TYPES = {
    'user': 'кто пользователь: роль, ожидания, привычки',
    'feedback': 'как работать: правки и подтверждённые подходы, с причиной',
    'project': 'решения, цели и ограничения, не выводимые из кода и истории',
    'reference': 'внешние ресурсы: адреса, дашборды, тикеты',
}
FACT_TYPE = 'fact'

# Виды связей. Каждый — глагол, отвечающий на вопрос «чем одно приходится другому».
# Пары типов ограничены осознанно: «проверяется» от reference к user означало бы,
# что автор запутался, а не что связь редкая.
EDGE_KINDS = {
    'следует из': {
        'note': 'решение, вытекающее из другого решения или ограничения',
        'from': {'project', 'feedback'},
        'to': {'project', 'feedback', FACT_TYPE},
    },
    'отменяет': {
        'note': 'новое решение вместо прежнего; прежнее остаётся ради причины отмены',
        'from': {'project', 'feedback'},
        'to': {'project', 'feedback', FACT_TYPE},
    },
    'проверяется': {
        'note': 'чем факт подтверждается машинно: скрипт, тест, замер, реестр',
        'from': {'project', 'feedback'},
        'to': {'project', 'reference', FACT_TYPE},
    },
    'описано в': {
        'note': 'где лежит подробность: документ, спецификация, адрес, строка реестра',
        'from': {'project', 'feedback', 'user'},
        'to': {'reference', 'project', FACT_TYPE},
    },
    'противоречит': {
        'note': 'известное расхождение, которое ещё не разрешено',
        'from': {'project', 'reference'},
        'to': {'project', 'reference', FACT_TYPE},
    },
    'ограничивает': {
        'note': 'ограничение, сужающее решение или работу',
        'from': {'project', 'user', 'feedback'},
        'to': {'project', 'feedback', FACT_TYPE},
    },
    'упоминает': {
        'note': 'голая ссылка в тексте; связывает слабо и от сиротства не спасает',
        'from': set(NODE_TYPES),
        'to': set(NODE_TYPES) | {FACT_TYPE},
    },
}
STRONG_KINDS = set(EDGE_KINDS) - {'упоминает'}

# Вид связи живёт в одной строке и короток. Без запрета на перевод строки регулярка
# съедает абзацы до ближайшей ссылки и объявляет вид связи длиной в три предложения.
EDGE_LINE = re.compile(r'^\s*[-*]\s*([^:\[\]\n]{2,40}?)\s*:\s*\[\[([^\]]+)\]\]', re.M)
BARE_LINK = re.compile(r'\[\[([^\]]+)\]\]')
FRONT_MATTER = re.compile(r'^---\n(.*?)\n---\n', re.S)
FACT_PREFIX = 'fact:'

# Число с единицей в теле заметки — это утверждение о платформе, и у него есть
# место, где оно живёт по-настоящему: строка реестра. Расхождение 146 против 128
# я заметил руками, читая заметку про терминальный клиент; машинно оно всплывает
# только если требовать опоры. Проценты и годы отсечены: первых слишком много и
# они почти всегда про доли, вторые — даты.
# Единицы — только те, которыми меряются обязательства платформы. Сроки работы
# сюда не входят: «пишу пост раз в 12 дней» — это порядок работы, а не предел, и
# первая версия этого списка нашла ровно его, объявив пробелом заметку о блоге.
UNIT_NUMBER = re.compile(
    r'\b(\d[\d\s]*(?:[.,]\d+)?)\s*(символ\w*|байт\w*|метр\w*|км\b|графем\w*|КБ|МБ|'
    r'characters?|bytes?|metres?|km\b|graphemes?|KB|MB)\b', re.I)

DEFAULT_CONFIG = {'documents': [], 'gates': [], 'registries': [], 'open_items': {}}


def plural(count, one, few, many):
    """«24 узлов» в строке, которую читают каждый старт сессии, — мелочь, но она
    сообщает, что строку никто не читал. Русское число: 1 узел, 2 узла, 5 узлов,
    и отдельно 11–14, которые ведут себя как «много» вопреки последней цифре."""
    tail, hundred = count % 10, count % 100
    if 11 <= hundred <= 14:
        return f'{count} {many}'
    if tail == 1:
        return f'{count} {one}'
    if 2 <= tail <= 4:
        return f'{count} {few}'
    return f'{count} {many}'


def memory_directory(project: pathlib.Path) -> pathlib.Path:
    """Каталог памяти вычисляется из пути тем же правилом, что и у харнесса: всё,
    что не буква и не цифра, становится дефисом. Не только разделитель — точка в
    xor.ad тоже, иначе скрипт ищет память в несуществующем каталоге и бодро
    отчитывается о её отсутствии при полной."""
    slug = re.sub(r'[^A-Za-z0-9]', '-', str(project.resolve()))
    return pathlib.Path.home() / '.claude' / 'projects' / slug / 'memory'


def run(command, cwd=None):
    """Команда, чей провал — ответ «нечего показать», а не авария скрипта."""
    try:
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=20)
        # rstrip, а не strip: в `git status --short` первый символ строки значащий.
        return result.stdout.rstrip()
    except (subprocess.SubprocessError, OSError):
        return ''


def load_config(project: pathlib.Path):
    path = project / 'docs' / 'facts' / 'ontology.json'
    if not path.is_file():
        return dict(DEFAULT_CONFIG), None
    try:
        raw = json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as error:
        return dict(DEFAULT_CONFIG), f'ontology.json не разбирается: {error}'
    config = dict(DEFAULT_CONFIG)
    config.update({key: value for key, value in raw.items() if not key.startswith('_')})
    return config, None


def load_registries(project: pathlib.Path, config):
    """Реестры фактов: id → (реестр, строка словарём). Ключом идёт и голый id, и
    квалифицированный «реестр/id»: имена в разных реестрах могут совпасть, и тогда
    голый id перестаёт быть адресом — ссылка на него обязана уточниться."""
    facts, ambiguous, problems = {}, set(), []
    for entry in config.get('registries', []):
        path = project / entry['file']
        if not path.is_file():
            problems.append(f'реестр {entry["name"]}: файла нет — {entry["file"]}')
            continue
        rows, header = [], None
        for line in path.read_text(encoding='utf-8').splitlines():
            if not line.strip() or line.startswith('#'):
                continue
            cells = line.split('\t')
            if header is None:
                header = cells
                continue
            rows.append(dict(zip(header, cells)))
        if header is None or entry['id'] not in header:
            problems.append(f'реестр {entry["name"]}: нет колонки «{entry["id"]}»')
            continue
        for row in rows:
            identifier = row[entry['id']].strip()
            if not identifier:
                continue
            qualified = f'{entry["name"]}/{identifier}'
            facts[qualified] = (entry, row)
            if identifier in facts:
                ambiguous.add(identifier)
            else:
                facts[identifier] = (entry, row)
    for identifier in ambiguous:
        facts.pop(identifier, None)
    return facts, ambiguous, problems


class Note:
    def __init__(self, path: pathlib.Path):
        self.path = path
        self.text = path.read_text(encoding='utf-8')
        self.problems = []

        header = FRONT_MATTER.match(self.text)
        block = header.group(1) if header else ''
        self.name = self._field(block, 'name') or path.stem
        self.description = self._field(block, 'description')
        self.type = self._field(block, 'type')
        self.body = self.text[header.end():] if header else self.text

        if not header:
            self.problems.append('нет фронтматтера')
        if not self.description:
            self.problems.append('нет description — по нему заметка находится при вспоминании')
        if self.type not in NODE_TYPES:
            self.problems.append(f'тип «{self.type or "не указан"}» вне онтологии')
        if self.name != path.stem:
            self.problems.append(f'name «{self.name}» не совпадает с именем файла «{path.stem}»')

        typed = {(kind.strip().lower(), target.strip())
                 for kind, target in EDGE_LINE.findall(self.body)}
        named = {target for _, target in typed}
        self.edges = sorted(typed)
        # Голая ссылка — ребро вида «упоминает», но только если этой же связи нет
        # с настоящим видом: иначе одна связь удваивалась бы.
        self.edges += sorted(('упоминает', target) for target in BARE_LINK.findall(self.body)
                             if target.strip() not in named)

    @staticmethod
    def _field(block: str, key: str):
        found = re.search(rf'^\s*{key}:\s*(.+?)\s*$', block, re.M)
        if not found:
            return None
        # Значение может прийти в кавычках: description с двоеточием внутри YAML
        # обязан быть закавычен, и кавычки не часть значения.
        return found.group(1).strip().strip('"\'')


def load(memory: pathlib.Path):
    if not memory.is_dir():
        return {}, None
    notes = {}
    for path in sorted(memory.glob('*.md')):
        if path.name == 'MEMORY.md':
            continue
        note = Note(path)
        notes[note.name] = note
    index = memory / 'MEMORY.md'
    return notes, index.read_text(encoding='utf-8') if index.exists() else None


def check(notes, index_text, memory, facts, ambiguous, registry_problems):
    """Дефекты графа. Пустой список — граф цел."""
    defects = list(registry_problems)

    if not notes:
        return defects + [f'памяти нет вовсе: в {memory} ни одной заметки']

    for name, note in sorted(notes.items()):
        for problem in note.problems:
            defects.append(f'{name}: {problem}')

    incoming = defaultdict(set)
    for name, note in sorted(notes.items()):
        for kind, target in note.edges:
            rule = EDGE_KINDS.get(kind)
            if target.startswith(FACT_PREFIX):
                identifier = target[len(FACT_PREFIX):].strip()
                if identifier in ambiguous:
                    defects.append(f'{name}: [[{target}]] неоднозначен — такой id есть '
                                   f'в нескольких реестрах, уточните «реестр/id»')
                    continue
                if identifier not in facts:
                    defects.append(f'{name}: ссылка на несуществующий факт — [[{target}]]')
                    continue
                target_type = FACT_TYPE
            elif target not in notes:
                defects.append(f'{name}: ссылка в никуда — [[{target}]] ({kind})')
                continue
            else:
                incoming[target].add(name)
                target_type = notes[target].type
            if rule is None:
                defects.append(f'{name}: вид связи «{kind}» вне онтологии '
                               f'(есть: {", ".join(sorted(EDGE_KINDS))})')
                continue
            source_type = note.type
            if source_type in NODE_TYPES and target_type in (set(NODE_TYPES) | {FACT_TYPE}):
                if source_type not in rule['from'] or target_type not in rule['to']:
                    defects.append(f'{name}: связь «{kind}» недопустима от {source_type} '
                                   f'к {target_type} ([[{target}]])')

    # Сирота — заметка, которую ни одна другая не держит и которая сама никого не
    # держит сильной связью. Такой факт повис в воздухе: к нему нет дороги ни от чего,
    # и он не всплывёт, когда понадобится.
    for name, note in sorted(notes.items()):
        strong_out = any(kind in STRONG_KINDS for kind, _ in note.edges)
        if not incoming[name] and not strong_out:
            defects.append(f'{name}: сирота — ничего на неё не ссылается и сама '
                           f'сильных связей не имеет')

    if index_text is None:
        defects.append('нет MEMORY.md — индекс это то, что попадает в контекст при старте')
    else:
        listed = set(re.findall(r'\]\(([^)]+)\.md\)', index_text))
        for name in sorted(notes):
            if name not in listed:
                defects.append(f'{name}: файл есть, строки в MEMORY.md нет')
        for name in sorted(listed - set(notes)):
            defects.append(f'MEMORY.md ссылается на {name}.md, которого нет')

    return defects


def overdue(config, facts):
    """Открытые пункты, у которых срок в прошлом. Дата берётся у системы, а не из
    головы: в длинной сессии сегодняшнее число уже другое."""
    settings = config.get('open_items') or {}
    registry = settings.get('registry')
    if not registry:
        return []
    today = datetime.date.today().isoformat()
    late = []
    for key, (entry, row) in facts.items():
        if entry['name'] != registry or '/' in key:
            continue
        due = (row.get(settings.get('due', 'due')) or '-').strip()
        if due in ('', '-') or due >= today:
            continue
        late.append((due, key, (row.get(settings.get('what', 'what')) or '').strip(),
                     (row.get(settings.get('blocks', 'blocks')) or '').strip()))
    return sorted(late)


def state(project, config, facts, config_error):
    """Где мы. Только измеренное: всё, что печатается, добыто у самой вещи."""
    print('=' * 72)
    print('ГДЕ МЫ')
    print('=' * 72)
    if config_error:
        print(f'!! {config_error}')

    age = run([str(pathlib.Path.home() / '.claude' / 'scripts' / 'session-age.sh')])
    print(age or 'session-age.sh не ответил')

    branch = run(['git', 'branch', '--show-current'], cwd=project)
    changed = [line for line in run(['git', 'status', '--short'], cwd=project).split('\n')
               if line.strip()]
    print(f'\nветка: {branch or "не репозиторий"}')
    print(f'незакоммичено: {len(changed)} файлов')
    # Незакоммиченное — обычно своя же работа прошлой сессии; закрывать её, не
    # прочитав, значит переписывать сделанное. Поэтому список печатается целиком.
    for line in changed:
        print(f'  {line}')

    log = run(['git', 'log', '--oneline', '-5'], cwd=project)
    if log:
        print('\nпоследние коммиты:')
        for line in log.split('\n'):
            print(f'  {line}')

    documents = [(name, why) for name, why in config.get('documents', [])
                 if (project / name).exists()]
    if documents:
        print('\nчто смотреть в этом проекте:')
        for name, why in documents:
            print(f'  {name:32} — {why}')

    registries = config.get('registries', [])
    if registries:
        print('\nреестры фактов:')
        for entry in registries:
            rows = sum(1 for key, (owner, _) in facts.items()
                       if owner is entry and '/' not in key)
            print(f'  {entry["name"]:10} {rows:4} — {entry["what"]}')
            print(f'  {"":10} {"":4}   проверяется: {entry["checked_by"]}')

    late = overdue(config, facts)
    if late:
        print(f'\nпросрочено открытых пунктов: {len(late)}')
        for due, key, what, blocks in late:
            print(f'  {key:6} срок {due} — {what[:70]}')
            if blocks:
                print(f'  {"":6} держит: {blocks}')

    gates = []
    for pattern in config.get('gates', []):
        gates += sorted(path.name for path in project.glob(pattern))
    if gates:
        print(f'\nворота проекта ({len(gates)}) — прогонять, а не вспоминать:')
        for name in gates:
            print(f'  ./scripts/{name}')


def graph(notes, facts):
    print('=' * 72)
    print('ОНТОЛОГИЯ')
    print('=' * 72)
    if not notes:
        print('узлов нет')
        return

    by_type = defaultdict(list)
    for _, note in sorted(notes.items()):
        by_type[note.type].append(note)

    for node_type, meaning in NODE_TYPES.items():
        group = by_type.get(node_type, [])
        print(f'\n{node_type} ({len(group)}) — {meaning}')
        for note in group:
            print(f'  {note.name}')
            print(f'    {note.description or "(без описания)"}')
            for kind, target in note.edges:
                arrow = '→' if kind in STRONG_KINDS else '·'
                print(f'    {arrow} {kind}: {target}')

    for node_type, group in by_type.items():
        if node_type in NODE_TYPES:
            continue
        print(f'\n{node_type or "(без типа)"} ({len(group)}) — вне онтологии')
        for note in group:
            print(f'  {note.name}')

    unqualified = sum(1 for key in facts if '/' not in key)
    print(f'\n{FACT_TYPE} ({unqualified}) — строки реестров docs/facts: лист графа, '
          f'на него опираются')

    kinds = defaultdict(int)
    for note in notes.values():
        for kind, _ in note.edges:
            kinds[kind] += 1
    print('\nрёбра по видам:')
    for kind in EDGE_KINDS:
        print(f'  {kind:14} {kinds.get(kind, 0):3}  — {EDGE_KINDS[kind]["note"]}')


def gaps(notes, config, facts):
    """Что записать. Не догадки: скрипт берёт места, где проект сам объявил
    решение или срок, и смотрит, держит ли его хоть одна заметка."""
    print()
    print('=' * 72)
    print('ПРОБЕЛЫ')
    print('=' * 72)
    corpus = '\n'.join(note.text for note in notes.values())
    found = 0

    for due, key, what, _blocks in overdue(config, facts):
        if key not in corpus:
            found += 1
            print(f'  просроченный пункт {key} (срок {due}) не держит ни одна заметка: '
                  f'{what[:70]}')

    # Заметка, называющая число платформы, обязана опираться на строку реестра —
    # иначе память и реестр расходятся молча, и узнаёшь об этом, читая обе.
    for name, note in sorted(notes.items()):
        if any(target.startswith(FACT_PREFIX) for _, target in note.edges):
            continue
        numbers = {f'{value.strip()} {unit.lower()}'
                   for value, unit in UNIT_NUMBER.findall(note.body)}
        if not numbers:
            continue
        found += 1
        sample = ', '.join(sorted(numbers)[:3])
        print(f'  {name}: называет число платформы ({sample}) и не опирается '
              f'ни на один факт реестра')

    if not notes:
        print('  начать не с чего: ни одной заметки')
        return

    # reference не обязан ссылаться никуда: справочник — лист графа, за адресом
    # приходят к нему, а не от него. Требовать исходящую связь значило бы заставлять
    # адрес объяснять себя через решение, которое на него сослалось.
    #
    # Корень — тоже не пробел. Верхнее правило вроде «не гадать» ни из чего не
    # следует, оно само основание; на него опираются другие, и этим оно опёрто.
    # Первая версия этой проверки требовала исходящую связь от каждого и объявляла
    # пробелом ровно те две заметки, которые держат половину графа.
    held = defaultdict(int)
    for note in notes.values():
        for kind, target in note.edges:
            if kind in STRONG_KINDS and not target.startswith(FACT_PREFIX):
                held[target] += 1

    for name, note in sorted(notes.items()):
        if note.type == 'reference' or held[name]:
            continue
        if not any(kind in STRONG_KINDS for kind, _ in note.edges):
            found += 1
            print(f'  {name}: ни одной сильной связи наружу — факт записан, но ни на что не опёрт')

    if not found:
        print('  нет: каждая заметка опёрта, каждый срок держится записью')


def main():
    parser = argparse.ArgumentParser(description='Онтология xor.ad: память и реестры фактов')
    parser.add_argument('--path', default=str(pathlib.Path(__file__).resolve().parent.parent),
                        help='каталог проекта (по умолчанию корень репозитория)')
    parser.add_argument('--memory', help='каталог памяти напрямую, в обход вычисления '
                                         'из пути проекта — нужен, чтобы проверять копию')
    parser.add_argument('--state', action='store_true', help='только «где мы»')
    parser.add_argument('--check', action='store_true', help='только проверка графа')
    parser.add_argument('--graph', action='store_true', help='только граф')
    parser.add_argument('--brief', action='store_true',
                        help='две-три строки для хука старта сессии')
    arguments = parser.parse_args()

    project = pathlib.Path(arguments.path).resolve()
    memory = (pathlib.Path(arguments.memory).resolve() if arguments.memory
              else memory_directory(project))
    config, config_error = load_config(project)
    facts, ambiguous, registry_problems = load_registries(project, config)
    notes, index_text = load(memory)

    if arguments.brief:
        # Режим хука: старт сессии и так печатает, где мы, — здесь только то, чего
        # не знает никто, кроме графа. Молчит при пустой памяти: строка о её
        # отсутствии повторялась бы каждый старт и ничего не меняла.
        if not notes:
            return 0
        defects = check(notes, index_text, memory, facts, ambiguous, registry_problems)
        edges = sum(len(note.edges) for note in notes.values())
        unqualified = sum(1 for key in facts if '/' not in key)
        if not defects:
            print(f"  граф памяти цел: {plural(len(notes), 'узел', 'узла', 'узлов')}, "
                  f"{plural(edges, 'ребро', 'ребра', 'рёбер')}, "
                  f"{plural(unqualified, 'факт', 'факта', 'фактов')} в реестрах")
            return 0
        print(f"  граф памяти: {plural(len(notes), 'узел', 'узла', 'узлов')}, "
              f"{plural(edges, 'ребро', 'ребра', 'рёбер')}, "
              f"{plural(len(defects), 'дефект', 'дефекта', 'дефектов')}")
        for defect in defects[:5]:
            print(f'    !! {defect}')
        if len(defects) > 5:
            print(f'    … ещё {len(defects) - 5}; целиком — scripts/ontology.py --check')
        return 1

    everything = not (arguments.state or arguments.check or arguments.graph)

    if arguments.state or everything:
        state(project, config, facts, config_error)
        print()

    if arguments.graph or everything:
        graph(notes, facts)

    defects = check(notes, index_text, memory, facts, ambiguous, registry_problems)

    if arguments.check or everything:
        print()
        print('=' * 72)
        print('ДЕФЕКТЫ ГРАФА')
        print('=' * 72)
        print(f'память: {memory}')
        if defects:
            for defect in defects:
                print(f'  !! {defect}')
        else:
            unqualified = sum(1 for key in facts if '/' not in key)
            print(f"  дефектов нет: {plural(len(notes), 'узел', 'узла', 'узлов')} "
                  f"связаны и в индексе, "
                  f"{plural(unqualified, 'факт', 'факта', 'фактов')} в реестрах")
        gaps(notes, config, facts)

    return 1 if defects and (arguments.check or everything) else 0


if __name__ == '__main__':
    sys.exit(main())
