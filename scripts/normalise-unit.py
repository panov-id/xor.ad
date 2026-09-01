#!/usr/bin/env python3
"""Единицы двух языков — к одной записи.

    ... | normalise-unit.py            строки «единица» → нормализованная
    ... | normalise-unit.py --pairs    строки «значение<TAB>единица» → пара

«128 символов» и «128 characters» — одно и то же обязательство, записанное в двух
половинах. Считать их порознь значит удваивать каждый предел и получать покрытие,
где половина пар — отражение другой половины.
"""
import sys

# Падежи перечислены полностью, а не «основными формами»: первая версия знала
# «символов» и не знала «символами», и покрытие честно объявляло их разными
# единицами — в списке непокрытого рядом стояли «символах 256» и «chars 256».
UNITS = {
    'chars': ('символ', 'символа', 'символов', 'символами', 'символах', 'символом',
              'символе', 'символы', 'character', 'characters'),
    'bytes': ('байт', 'байта', 'байтов', 'байтами', 'байтах', 'байты', 'byte', 'bytes'),
    'm': ('м', 'метр', 'метра', 'метров', 'метрах', 'метрами', 'метры',
          'm', 'metre', 'metres', 'meter', 'meters'),
    'km': ('км', 'km'),
    's': ('сек', 'секунд', 'секунда', 'секунды', 'секунду', 'секундами', 'секундах',
          'second', 'seconds'),
    'min': ('мин', 'минут', 'минута', 'минуты', 'минуту', 'минутами', 'минутах',
            'minute', 'minutes'),
    'h': ('час', 'часа', 'часов', 'часами', 'часах', 'часы', 'hour', 'hours'),
    'd': ('день', 'дня', 'дней', 'днями', 'днях', 'дни', 'суток', 'сутки', 'сутках',
          'day', 'days'),
    'KB': ('КБ', 'KB'),
    'MB': ('МБ', 'MB'),
    'graphemes': ('графем', 'графема', 'графемы', 'графемами', 'графемах',
                  'grapheme', 'graphemes'),
}
LOOKUP = {form.lower(): name for name, forms in UNITS.items() for form in forms}


def normalise(unit):
    return LOOKUP.get(unit.strip().lower(), unit.strip())


pairs = '--pairs' in sys.argv[1:]
with_place = '--pairs-with-place' in sys.argv[1:]
for line in sys.stdin:
    line = line.rstrip('\n')
    if not line:
        continue
    if with_place:
        value, unit, place = (line.split('\t') + ['', '', ''])[:3]
        print(f'{value.strip()}\t{normalise(unit)}\t{place}')
    elif pairs:
        value, _, unit = line.partition('\t')
        print(f'{value.strip()}\t{normalise(unit)}')
    else:
        print(normalise(line))
