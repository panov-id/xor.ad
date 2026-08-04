"""Put a message back into its own alphabet before anything tries to read it.

People write Greek in Latin letters (greeklish) and Russian in Latin letters all
the time, and both wreck every layer downstream: the identifier guessed Albanian
at 0.36 confidence for one and Slovak at 0.40 for the other, and the translator
turned "you are an idiot, get out of here" into "Eisai is an elith, a phygga or a
hedgehog".

The tables here are not a scholarly transliteration and do not need to be. Their
only job is to give the language identifier enough of the right alphabet to lock
on. Whether a guess helped is decided by measurement, not by the table: each
candidate is scored by the identifier, and the original wins unless a candidate
beats it clearly.
"""

from __future__ import annotations

import re

# Longest sequences first — "ch" must be tried before "c", or it never matches.
GREEKLISH_TO_GREEK = [
    ("ps", "ψ"), ("th", "θ"), ("ch", "χ"), ("ks", "ξ"), ("ou", "ου"),
    ("ai", "αι"), ("ei", "ει"), ("oi", "οι"), ("mp", "μπ"), ("nt", "ντ"),
    ("gk", "γκ"), ("ts", "τσ"), ("tz", "τζ"),
    ("a", "α"), ("b", "β"), ("g", "γ"), ("d", "δ"), ("e", "ε"), ("z", "ζ"),
    ("i", "ι"), ("k", "κ"), ("l", "λ"), ("m", "μ"), ("n", "ν"), ("o", "ο"),
    ("p", "π"), ("r", "ρ"), ("s", "σ"), ("t", "τ"), ("y", "υ"), ("f", "φ"),
    ("h", "η"), ("w", "ω"), ("c", "κ"), ("u", "ου"), ("v", "β"), ("x", "χ"),
    ("j", "ζ"), ("q", "κ"),
]

LATIN_TO_CYRILLIC = [
    ("shch", "щ"), ("sch", "щ"), ("yo", "ё"), ("zh", "ж"), ("kh", "х"),
    ("ts", "ц"), ("ch", "ч"), ("sh", "ш"), ("yu", "ю"), ("ya", "я"),
    ("ye", "е"), ("yi", "ий"), ("ay", "ай"), ("ey", "ей"), ("oy", "ой"),
    ("a", "а"), ("b", "б"), ("v", "в"), ("g", "г"), ("d", "д"), ("e", "е"),
    ("z", "з"), ("i", "и"), ("y", "ы"), ("k", "к"), ("l", "л"), ("m", "м"),
    ("n", "н"), ("o", "о"), ("p", "п"), ("r", "р"), ("s", "с"), ("t", "т"),
    ("u", "у"), ("f", "ф"), ("h", "х"), ("c", "ц"), ("j", "й"), ("w", "в"),
    ("x", "кс"), ("q", "к"),
]

LATIN_LETTERS = re.compile(r"[A-Za-z]")


def looks_latin(text: str) -> bool:
    """True when the message is written mostly in Latin letters."""
    letters = [character for character in text if character.isalpha()]
    if not letters:
        return False
    latin = sum(1 for character in letters if LATIN_LETTERS.match(character))
    return latin / len(letters) > 0.8


def _apply(text: str, table: list[tuple[str, str]]) -> str:
    lowered = text.lower()
    result: list[str] = []
    position = 0
    while position < len(lowered):
        for source, target in table:
            if lowered.startswith(source, position):
                result.append(target)
                position += len(source)
                break
        else:
            result.append(lowered[position])
            position += 1
    return "".join(result)


def candidates(text: str) -> list[tuple[str, str]]:
    """Readings worth offering the identifier, named so a report can say which won."""
    if not looks_latin(text):
        return []
    return [
        ("greeklish", _apply(text, GREEKLISH_TO_GREEK)),
        ("latin-cyrillic", _apply(text, LATIN_TO_CYRILLIC)),
    ]
