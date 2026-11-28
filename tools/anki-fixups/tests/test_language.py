import json
import tomllib
import unicodedata
from pathlib import Path

import pytest

from anki_fixups.aspect import AspectDictionary, Lookup, MOTION_PAIRS, aspect_key, motion_for
from anki_fixups.categories import ASPECTS, GENDERS, KINDS, Category, abbreviated_category, parse_category
from anki_fixups.fixups import core_badges, resolve_aspect

from conftest import ROOT


FIXTURES = json.loads((Path(__file__).parent / "fixtures/categories.json").read_text())
with (ROOT / "tools/anki-fixups/config.example.toml").open("rb") as handle:
    EXAMPLE = tomllib.load(handle)


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda row: f"{row['model_id']}: {row['category']}")
def test_category_matches_expected_fields_when_found_in_actual_collection(fixture):
    expected = Category(fixture["kind"], fixture["aspect"], fixture["usage"], fixture["status"])

    result = parse_category(fixture["category"], EXAMPLE["category_aliases"], EXAMPLE["category_values"])

    assert result == expected


@pytest.mark.parametrize("text, kind", list(KINDS.items()))
def test_category_recognizes_kind_when_given_canonical_token(text, kind):
    value = f"<b>{text.upper()}</b>; Slang"

    result = parse_category(value)

    assert result == Category(kind, "", "Slang")


@pytest.mark.parametrize("text, kind", list(GENDERS.items()))
def test_category_recognizes_noun_gender_when_present(text, kind):
    value = f"podstatné meno, {text}"

    result = parse_category(value)

    assert result == Category(kind, "", "")


@pytest.mark.parametrize("text, aspect", list(ASPECTS.items()))
def test_category_recognizes_aspect_when_given_whole_token(text, aspect):
    value = f"sloveso; {text}; Hovorové"

    result = parse_category(value)

    assert result == Category("slov", aspect, "Hovorové")


@pytest.mark.parametrize("word, status, aspect", [
    ("<b>ДЕ́ЛАТЬ</b>&nbsp;", "found", "impf"), ("сделать", "found", "pf"),
    ("испо́льзовать", "found", "both"), ("засы́пать", "found", "pf"),
    ("засыпа́ть", "found", "impf"), ("за́сыпать", "ambiguous", ""),
    ("засыпать", "ambiguous", ""), ("ИМЕ́ТЬ в виду́", "found", "impf"),
    ("ходить", "found", "impf"), ("прийти", "found", "pf"),
    ("блабла́ть", "not-found", ""), ("", "not-found", ""),
])
def test_lookup_resolves_aspect_when_using_shared_ts_vectors(dictionary, word, status, aspect):
    decomposed = unicodedata.normalize("NFD", word)

    result = dictionary.lookup(decomposed)

    assert (result.status, result.aspect) == (status, aspect)
    if word == "сделать":
        assert (result.stressed, result.partners) == ("сде́лать", ("де́лать",))


def test_key_preserves_yo_when_removing_acute_and_grave():
    word = unicodedata.normalize("NFD", "Ё́ЖИТЬСЯ ѝ ѐ")

    result = aspect_key(word)

    assert result == "ёжиться и е"


@pytest.mark.parametrize("word, expected", [("ходить", ("multidir", "идти́")), ("идти́", ("unidir", "ходи́ть")), ("прийти́", ("", "")), ("идти́ домой", ("", ""))])
def test_motion_is_assigned_when_word_is_an_unprefixed_motion_verb(word, expected):
    result = motion_for(word)

    assert result == expected


@pytest.mark.parametrize("pair", MOTION_PAIRS)
def test_motion_pairs_are_bidirectional_when_stress_is_removed(pair):
    unidir, multidir = pair

    forward, backward = motion_for(aspect_key(unidir)), motion_for(aspect_key(multidir))

    assert forward == ("unidir", multidir)
    assert backward == ("multidir", unidir)


@pytest.mark.parametrize("content", ["wrong\n", "key\tstressed\taspect\tpartners\tsources\nделать\tде́лать\tbad\t\twikt\n", "key\tstressed\taspect\tpartners\tsources\nсделать\tсде́лать\tpf\t\twikt\nделать\tде́лать\timpf\t\twikt\n"])
def test_lookup_rejects_dictionary_when_content_is_corrupt(tmp_path, content):
    path = tmp_path / "corrupt.tsv"
    path.write_text(content)

    with pytest.raises(ValueError, match="header|row"):
        AspectDictionary(path)


@pytest.mark.parametrize("word, aspect, labels", [
    ("делать", "impf", ["aspect::impf."]),
    ("сделать", "pf", ["aspect::pf."]),
    ("использовать", "both", ["aspect::impf./pf."]),
    ("идти", "impf", ["aspect::impf.", "motion::unidir."]),
    ("ходить", "impf", ["aspect::impf.", "motion::multidir."]),
])
def test_badges_preserve_other_tags_when_dictionary_matches(word, aspect, labels):
    original = ["russiancore5000::slov", "my::tag"]
    expected = original + ["russiancore5000::" + label for label in labels]

    status, updated = core_badges(word, original, Lookup("found", aspect))
    second = core_badges(word, updated, Lookup("found", aspect))

    assert (status, updated) == ("added", expected)
    assert original == ["russiancore5000::slov", "my::tag"]
    assert second[0] == "skipped-existing"
    assert set(second[1]) == set(expected)


def test_badges_replace_managed_tags_when_aspect_changes():
    original = ["keep", "russiancore5000::aspect::pf.", "russiancore5000::motion::unidir."]

    status, updated = core_badges("делать", original, Lookup("found", "impf"))

    assert (status, updated) == ("added", ["keep", "russiancore5000::aspect::impf."])


@pytest.mark.parametrize("status", ["ambiguous", "not-found"])
def test_badges_preserve_existing_tags_when_lookup_is_unresolved(status):
    original = ["keep", "russiancore5000::aspect::pf."]

    result = core_badges("unknown", original, Lookup(status))

    assert result == (status, original)


@pytest.mark.parametrize("category_aspect, lookup, prefer, expected", [
    ("impf", Lookup("found", "pf"), "dictionary", ("pf", "aspect-corrected")),
    ("impf", Lookup("found", "pf"), "category", ("impf", "aspect-conflict")),
    ("impf", Lookup("found", "both"), "dictionary", ("both", "aspect-corrected")),
    ("impf", Lookup("found", "impf"), "dictionary", ("impf", "migrated")),
    ("", Lookup("found", "pf"), "dictionary", ("pf", "aspect-filled")),
    ("", Lookup("not-found"), "dictionary", ("", "aspect-missing")),
    ("pf", Lookup("not-found"), "dictionary", ("pf", "not-found")),
    ("pf", Lookup("ambiguous"), "dictionary", ("pf", "ambiguous")),
    ("", Lookup("ambiguous"), "dictionary", ("", "ambiguous")),
])
def test_migration_uses_expected_aspect_when_category_and_dictionary_differ(category_aspect, lookup, prefer, expected):
    result = resolve_aspect(category_aspect, lookup, prefer)

    assert result == expected


def test_fallback_rewrites_whole_phrases_when_category_contains_html():
    original = "sloveso; <b>Nedokonavý vid</b>; Hovorové; dokonavé; obojvidové"

    result = abbreviated_category(original)

    assert result == "sloveso; <b>impf.</b>; Hovorové; pf.; impf./pf."
