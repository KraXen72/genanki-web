import json
import tomllib
from pathlib import Path

import pytest

from anki_fixups.contracts import Configuration
from anki_fixups.fixups import apply_plan, plan_migration
from anki_fixups.safety import FixupError
from conftest import ROOT, add_note, configure


with (ROOT / "tools/anki-fixups/reviewed-notes.toml").open("rb") as handle:
    REVIEWS = tomllib.load(handle)["reviewed_notes"]

EXPECTED_KINDS = {
    "ката́ние на са́нках": "pod.m:s", "нау́шники": "pod.m:m",
    "кроссо́вки": "pod.m:ž", "зало́жен": "príd.m", "молоде́ц": "pod.m:m",
    "ребя́та": "pod.m:pomn", "день рожде́ния": "pod.m:m",
    "то́чно": "prís", "возмо́жно": "prís", "кста́ти": "prís",
    "есте́ственно": "prís", "хва́тит": "čast",
    "обрыга́ться": "slov", "забу́дь": "slov", "вы́глядеть": "slov",
}
EXPECTED_ASPECTS = {"обрыга́ться": "pf.", "забу́дь": "pf.", "вы́глядеть": "impf."}


def reviewed_config(collection, source, tmp_path, review):
    _, config_path = configure(collection, tmp_path, source)
    review_file = tmp_path / "reviews.toml"
    values = dict(review, model_id=source["id"])
    review_file.write_text(
        "[[reviewed_notes]]\n" + "\n".join(
            f"{key} = {value if isinstance(value, int) else json.dumps(value)}"
            for key, value in values.items()
        ) + "\n"
    )
    config_path.write_text('reviewed_notes_file = "reviews.toml"\n' + config_path.read_text())
    return Configuration(config_path, Path(collection.path))


@pytest.mark.parametrize("review", REVIEWS, ids=lambda review: review["word"])
def test_reviewed_note_migrates_with_preserved_content_when_original_matches(collection, source, target, template, dictionary, tmp_path, review):
    note = add_note(collection, source, {
        "ID": review["id"], "Word": review["word"], "Category": review["old_category"],
        "SlovakMeaning1": "<b>original meaning</b>", "Sentence1": "Original example.",
        "Translation1": "Original translation.",
    }, ["keep"])
    config = reviewed_config(collection, source, tmp_path, review)
    cards = collection.db.all("select id,nid,ord,due from cards order by id")

    plan = plan_migration(collection, config, dictionary, template)
    apply_plan(collection, plan)

    result = collection.get_note(note.id)
    assert result.mid == template.model_id
    assert result.guid == note.guid
    for name, value in note.items():
        if name != "Category":
            assert result[name] == value
    assert result["Kind"] == template.labels["Kind"][EXPECTED_KINDS[review["word"]]]
    assert "keep" in result.tags
    assert collection.db.all("select id,nid,ord,due from cards order by id") == cards
    assert plan.rows[0]["old_category"] == review["old_category"]
    assert plan.rows[0]["reviewed_category"] == review["category"]
    if review["word"] in {"то́чно", "возмо́жно", "кста́ти", "есте́ственно"}:
        assert "aj častica" in result["Usage"]
    if review["word"] in {"зало́жен", "хва́тит"}:
        assert (result["Usage"], result["Aspect"]) == ("", "")
    if review["word"] in EXPECTED_ASPECTS:
        assert result["Aspect"] == EXPECTED_ASPECTS[review["word"]]


@pytest.mark.parametrize("field", ["Word", "Category"])
def test_review_refuses_changed_original_when_note_was_edited(collection, source, target, template, dictionary, tmp_path, field):
    review = REVIEWS[0]
    note = add_note(collection, source, {
        "ID": review["id"], "Word": review["word"], "Category": review["old_category"],
        "SlovakMeaning1": "meaning",
    })
    config = reviewed_config(collection, source, tmp_path, review)
    note[field] = "changed"
    collection.update_note(note)

    with pytest.raises(FixupError, match="changed"):
        plan_migration(collection, config, dictionary, template)

    assert collection.get_note(note.id).mid == source["id"]


def test_review_keeps_unrelated_note_unresolved_when_id_differs(collection, source, target, template, dictionary, tmp_path):
    review = REVIEWS[0]
    note = add_note(collection, source, {
        "ID": "different-id", "Word": review["word"], "Category": review["old_category"],
        "SlovakMeaning1": "meaning",
    })
    config = reviewed_config(collection, source, tmp_path, review)

    plan = plan_migration(collection, config, dictionary, template)

    assert plan.mutations == []
    assert plan.rows[0]["status"] == "needs-review"
    assert plan.rows[0]["note_id"] == note.id
