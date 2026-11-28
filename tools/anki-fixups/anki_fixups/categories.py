"""Parse legacy Slovak Category values into v4 grammatical fields."""

import re
from dataclasses import dataclass

from .aspect import normalized, plain_text


KINDS = {
    "sloveso": "slov", "prídavné meno": "príd.m", "príslovka": "prís",
    "zámeno": "zám", "číslovka": "čísl", "spojka": "spoj", "predložka": "pred",
    "častica": "čast", "citoslovce": "cito", "fráza": "fráza",
    "ustálené spojenie": "fráza", "výraz": "fráza",
}
GENDERS = {
    "mužský rod": "pod.m:m", "ženský rod": "pod.m:ž", "stredný rod": "pod.m:s",
    "obojrodé": "pod.m:oboj", "spoločný rod": "pod.m:oboj",
    "pomnožné": "pod.m:pomn", "len množné číslo": "pod.m:pomn",
}
ASPECTS = {
    "nedokonavý vid": "impf", "nedokonavé": "impf",
    "dokonavý vid": "pf", "dokonavé": "pf",
    "obojvidový": "both", "obojvidové": "both",
    "impf.": "impf", "pf.": "pf", "impf./pf.": "both",
}


@dataclass(frozen=True)
class Category:
    kind: str
    aspect: str
    usage: str
    status: str = ""


def parse_category(value: str, aliases: dict[str, str] | None = None,
                   category_values: dict[str, str] | None = None) -> Category:
    """Keep unrecognized tokens as Usage, preserving their original case.

    Configured full-Category mappings handle English values with commas inside
    parentheses. Some older exports use middle dots as token separators.
    """
    text = plain_text(value)
    text = (category_values or {}).get(normalized(text), text)
    tokens = []
    for original in re.split(r"[;,·]", text):
        original = original.strip()
        if original:
            token = normalized(original)
            tokens.append((original, (aliases or {}).get(token, token)))

    noun = any(token == "podstatné meno" for _, token in tokens)
    kinds, genders, aspects, usage = set(), set(), set(), []
    for original, token in tokens:
        if token == "podstatné meno":
            continue
        if token in KINDS:
            kinds.add(KINDS[token])
        elif token in GENDERS and noun:
            genders.add(GENDERS[token])
        elif token in ASPECTS:
            aspects.add(ASPECTS[token])
        else:
            usage.append(original)

    if noun:
        if len(genders) != 1:
            return Category("", "", "; ".join(usage), "needs-review")
        kinds.update(genders)
    if not kinds:
        return Category("", "", "; ".join(usage), "unparsed")
    if len(kinds) > 1:
        return Category("", "", "; ".join(usage), "needs-review")
    kind = next(iter(kinds))
    if len(aspects) > 1 or (aspects and kind != "slov"):
        return Category(kind, "", "; ".join(usage), "needs-review")
    return Category(kind, next(iter(aspects), ""), "; ".join(usage))


def abbreviated_category(value: str) -> str:
    """Replace whole aspect phrases in place, including inside HTML wrappers."""
    pattern = r"(?<!\w)(?:nedokonavý vid|nedokonavé|dokonavý vid|dokonavé|obojvidový|obojvidové)(?!\w)"
    labels = {"impf": "impf.", "pf": "pf.", "both": "impf./pf."}
    return re.sub(pattern, lambda match: labels[ASPECTS[match[0].lower()]], value, flags=re.I)
