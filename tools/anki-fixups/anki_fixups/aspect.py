"""Russian aspect lookup using the web validator's TSV and motion pairs."""

import csv
import re
import unicodedata
from dataclasses import dataclass
from html import unescape
from pathlib import Path


# Stressed spellings supply the partner labels even when the TSV omits a pair.
MOTION_PAIRS = (
    ("идти́", "ходи́ть"),
    ("е́хать", "е́здить"),
    ("бежа́ть", "бе́гать"),
    ("лете́ть", "лета́ть"),
    ("плы́ть", "пла́вать"),
    ("нести́", "носи́ть"),
    ("вести́", "води́ть"),
    ("везти́", "вози́ть"),
    ("тащи́ть", "таска́ть"),
    ("кати́ть", "ката́ть"),
    ("гна́ть", "гоня́ть"),
    ("ползти́", "по́лзать"),
    ("ле́зть", "ла́зить"),
    ("брести́", "броди́ть"),
)


def plain_text(value: str) -> str:
    """Strip field HTML and decode entities while keeping word boundaries."""
    value = re.sub(r"<(?:br\b[^>]*|/p|/div)\s*>", " ", value, flags=re.I)
    return unescape(re.sub(r"<[^>]*>", "", value)).replace("\xa0", " ").strip()


def normalized(value: str) -> str:
    return unicodedata.normalize("NFC", plain_text(value)).lower().strip()


def aspect_key(value: str) -> str:
    """Remove acute/grave stress while preserving letters such as ё."""
    decomposed = unicodedata.normalize("NFD", normalized(value))
    return unicodedata.normalize("NFC", decomposed.translate({0x301: None, 0x300: None}))


MOTION = {}
for unidir, multidir in MOTION_PAIRS:
    MOTION[aspect_key(unidir)] = ("unidir", multidir)
    MOTION[aspect_key(multidir)] = ("multidir", unidir)


def motion_for(word: str) -> tuple[str, str]:
    """Return direction and stressed counterpart for an unprefixed motion verb."""
    return MOTION.get(aspect_key(word), ("", ""))


@dataclass(frozen=True)
class Entry:
    stressed: str
    aspect: str
    partners: tuple[str, ...]


@dataclass(frozen=True)
class Lookup:
    status: str
    aspect: str = ""
    partners: tuple[str, ...] = ()
    stressed: str = ""


class AspectDictionary:
    """Validate and index the same sorted dictionary consumed by TypeScript."""

    def __init__(self, path: Path):
        self.entries: dict[str, list[Entry]] = {}
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.reader(handle, delimiter="\t")
            if next(reader, []) != ["key", "stressed", "aspect", "partners", "sources"]:
                raise ValueError("Invalid Russian aspect dictionary header")
            previous = ""
            for number, row in enumerate(reader, 2):
                if len(row) != 5:
                    raise ValueError(f"Invalid aspect dictionary row {number}")
                key, stressed, aspect, partners, sources = row
                if (
                    not key or key != aspect_key(key) or key < previous
                    or aspect not in {"impf", "pf", "both"}
                    or sources not in {"wikt", "or", "wikt,or"}
                ):
                    raise ValueError(f"Invalid aspect dictionary row {number}")
                partner_list = tuple(part.strip() for part in partners.split(",") if part.strip())
                self.entries.setdefault(key, []).append(Entry(stressed, aspect, partner_list))
                previous = key

    def lookup(self, word: str) -> Lookup:
        """Use written stress to resolve homographs; phrases use their first token."""
        tokens = normalized(word).split()
        if not tokens:
            return Lookup("not-found")
        headword = tokens[0]
        entries = self.entries.get(aspect_key(headword), [])
        exact = [entry for entry in entries if entry.stressed == headword]
        matched = exact or entries
        if not matched:
            return Lookup("not-found")
        aspects = {entry.aspect for entry in matched}
        if len(aspects) != 1:
            return Lookup("ambiguous")
        partners = tuple(dict.fromkeys(partner for entry in matched for partner in entry.partners))
        return Lookup("found", matched[0].aspect, partners, matched[0].stressed)
