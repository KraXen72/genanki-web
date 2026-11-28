import csv
import hashlib
import json
import sqlite3
import subprocess
import sys
from contextlib import closing
from importlib.metadata import version
from pathlib import Path

import pytest
from anki.collection import Collection

from anki_fixups.cli import main
from anki_fixups.contracts import Configuration
from anki_fixups.fixups import apply_plan, plan_core, plan_migration
from anki_fixups.safety import FixupError, collection_snapshot, undo_operation

from conftest import PACK, ROOT, add_model, add_note, configure


CARD_COLUMNS = "id,nid,did,ord,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data"


def card_state(collection):
    return collection.db.all(f"select {CARD_COLUMNS} from cards order by id")


def note_state(collection):
    return collection.db.all("select id,guid,mid,flds,tags from notes order by id")


def run_cli(path, directory, command, *extra, input_text=None):
    return subprocess.run(
        [sys.executable, "-m", "anki_fixups", command, "--collection", str(path),
         "--anki-version", version("anki"), "--report-dir", str(directory), *map(str, extra)],
        input=input_text, text=True, capture_output=True, cwd=ROOT, timeout=15,
    )


def test_migration_preserves_identity_fields_and_review_history_when_reviewed_card_exists(collection, source, target, dictionary, template, tmp_path):
    note = add_note(collection, source, {"ID": "ru:делать:general", "Word": "де́лать", "Category": "sloveso; dokonavý vid; Slang", "SlovakMeaning1": "<b>robiť</b>", "EnglishGloss1": "do", "Sentence1": "Я де́лаю.", "Translation1": "Robím."}, ["existing::tag"])
    noun = add_note(collection, source, {"ID": "ru:книга:general", "Word": "кни́га", "Category": "podstatné meno; ženský rod", "SlovakMeaning1": "kniha"})
    review = add_note(collection, source, {"ID": "ru:род:general", "Word": "род", "Category": "podstatné meno", "SlovakMeaning1": "rod"})
    unknown = add_note(collection, source, {"ID": "ru:unknown:general", "Word": "unknown", "Category": "mystery", "SlovakMeaning1": "unknown"})
    collection.decks.select(1)
    card = collection.sched.getCard()
    assert card.nid == note.id
    collection.sched.answerCard(card, 3)
    before_cards = card_state(collection)
    before_notes = note_state(collection)
    before_revlog = collection.db.all("select * from revlog order by id")
    before_types = {model["id"] for model in collection.models.all()}
    config, _ = configure(collection, tmp_path, source)

    plan = plan_migration(collection, config, dictionary, template)
    apply_plan(collection, plan)

    migrated = collection.get_note(note.id)
    assert migrated.mid == template.model_id
    assert migrated.guid == note.guid
    assert migrated["ID"] == note["ID"]
    assert migrated["Word"] == "де́лать"
    assert migrated["SlovakMeaning1"] == "<b>robiť</b>"
    assert migrated["EnglishGloss1"] == "do"
    assert migrated["Sentence1"] == "Я де́лаю."
    assert migrated["Translation1"] == "Robím."
    assert (migrated["Kind"], migrated["Aspect"], migrated["Partner"], migrated["Usage"]) == ("sloveso", "impf.", "сде́лать", "Slang")
    assert set(migrated.tags) == {"existing::tag", "genanki::slov"}
    assert collection.get_note(noun.id)["Kind"] == "podst. meno, ženský rod"
    assert collection.get_note(review.id).mid == source["id"]
    assert collection.get_note(unknown.id).mid == source["id"]
    assert card_state(collection) == before_cards
    assert collection.db.all("select * from revlog order by id") == before_revlog
    assert {model["id"] for model in collection.models.all()} == before_types
    assert {row["status"] for row in plan.rows} == {"aspect-corrected", "migrated", "needs-review", "unparsed"}
    assert before_revlog

    collection.undo()

    assert note_state(collection) == before_notes
    assert card_state(collection) == before_cards
    assert collection.db.all("select * from revlog order by id") == before_revlog


def test_migration_preserves_combined_meanings_when_old_field_names_differ(collection, target, template, dictionary, tmp_path):
    source = add_model(collection, "Russian vocabulary v1", ["ID", "Category", "Word", "SlovakMeanings", "EnglishGlosses"], [(template.cards[0], "{{Word}}"), (template.cards[1], "{{SlovakMeanings}}")])
    note = add_note(collection, source, {"ID": "old-id", "Category": "sloveso", "Word": "ходи́ть", "SlovakMeanings": "ísť<br>chodiť", "EnglishGlosses": "go<br>walk"})
    config, _ = configure(collection, tmp_path, source, field_aliases={"SlovakMeaning1": "SlovakMeanings", "EnglishGloss1": "EnglishGlosses"})

    plan = plan_migration(collection, config, dictionary, template)
    apply_plan(collection, plan)

    migrated = collection.get_note(note.id)
    assert migrated["SlovakMeaning1"] == "ísť<br>chodiť"
    assert migrated["EnglishGloss1"] == "go<br>walk"
    assert (migrated["Aspect"], migrated["Motion"]) == ("impf.", "multidir.")
    assert plan.rows[0]["status"] == "aspect-filled"


def test_category_only_option_keeps_note_type_when_v4_is_absent(collection, source, dictionary, template, tmp_path):
    note = add_note(collection, source, {"ID": "old-id", "Word": "делать", "Category": "sloveso; <b>nedokonavý vid</b>; Slang", "SlovakMeaning1": "robiť"}, ["keep"])
    config, _ = configure(collection, tmp_path, source)
    before_cards = card_state(collection)

    plan = plan_migration(collection, config, dictionary, template, no_notetype_change=True)
    apply_plan(collection, plan)
    second = plan_migration(collection, config, dictionary, template, no_notetype_change=True)

    updated = collection.get_note(note.id)
    assert (updated.mid, updated.guid) == (note.mid, note.guid)
    assert updated["Category"] == "sloveso; <b>impf.</b>; Slang"
    assert set(updated.tags) == {"keep", "genanki::slov"}
    assert card_state(collection) == before_cards
    assert second.mutations == []


def test_core_only_edits_tagged_verbs_when_untagged_infinitives_exist(collection, source, core, dictionary, tmp_path):
    verb = add_note(collection, core, {"Word": "делать", "Translation": "do (slang)"}, ["russiancore5000::slov"])
    untagged = add_note(collection, core, {"Word": "сделать", "Translation": "finish"}, ["russiancore5000::pod.m:m"])
    existing = add_note(collection, core, {"Word": "делать", "Translation": "do (pf. custom text)"}, ["russiancore5000::slov"])
    other = add_note(collection, source, {"Word": "делать", "ID": "other", "Category": "sloveso", "SlovakMeaning1": "robiť"})
    config, _ = configure(collection, tmp_path, source, core)
    before_cards = card_state(collection)

    plan = plan_core(collection, config, dictionary)
    apply_plan(collection, plan)
    again = plan_core(collection, config, dictionary)

    assert collection.get_note(verb.id).fields == verb.fields
    assert set(collection.get_note(verb.id).tags) == {"russiancore5000::slov", "russiancore5000::aspect::impf."}
    assert collection.get_note(untagged.id)["Translation"] == "finish"
    assert collection.get_note(existing.id)["Translation"] == "do (pf. custom text)"
    assert collection.get_note(other.id).fields == other.fields
    assert {row["status"] for row in plan.rows} == {"added", "possible-untagged-verb"}
    assert "russiancore5000::aspect::impf." in collection.get_note(existing.id).tags
    assert again.mutations == []
    assert card_state(collection) == before_cards


def test_core_refuses_gloss_when_only_front_condition_references_it(collection, source, core, dictionary, tmp_path):
    core["tmpls"][1]["qfmt"] = "{{#Translation}}{{Word}}{{/Translation}}"
    collection.models.update_dict(core)
    config, _ = configure(collection, tmp_path, source, core)

    with pytest.raises(FixupError, match="front"):
        plan_core(collection, config, dictionary)


def test_core_refuses_badges_when_front_does_not_display_tags(collection, source, core, dictionary, tmp_path):
    core["tmpls"][1]["qfmt"] = "{{Translation}}"
    collection.models.update_dict(core)
    config, _ = configure(collection, tmp_path, source, core)

    with pytest.raises(FixupError, match="Tags"):
        plan_core(collection, config, dictionary)


def test_migration_refuses_missing_v4_when_type_change_requested(collection, source, dictionary, template, tmp_path):
    config, _ = configure(collection, tmp_path, source)

    with pytest.raises(FixupError):
        plan_migration(collection, config, dictionary, template)


@pytest.mark.parametrize("mismatch", ["field", "source-card", "target-card"])
def test_migration_refuses_layout_when_field_or_card_contract_differs(collection, source, target, dictionary, template, tmp_path, mismatch):
    if mismatch == "field":
        target["flds"][0]["name"] = "WrongID"
        collection.models.update_dict(target)
    elif mismatch == "source-card":
        source["tmpls"][0]["name"] = "Wrong direction"
        collection.models.update_dict(source)
    else:
        target["tmpls"][0]["name"] = "Wrong direction"
        collection.models.update_dict(target)
    config, _ = configure(collection, tmp_path, source)

    with pytest.raises(FixupError):
        plan_migration(collection, config, dictionary, template)


def test_apply_refuses_stale_preview_when_note_has_changed(collection, source, core, dictionary, tmp_path):
    note = add_note(collection, core, {"Word": "делать", "Translation": "do"}, ["russiancore5000::slov"])
    config, _ = configure(collection, tmp_path, source, core)
    plan = plan_core(collection, config, dictionary)
    note["Translation"] = "user edit"
    collection.update_note(note)

    with pytest.raises(FixupError, match="changed after the preview"):
        apply_plan(collection, plan)

    assert collection.get_note(note.id)["Translation"] == "user edit"


def test_undo_rolls_back_completed_operations_when_later_work_fails(collection, source):
    note = add_note(collection, source, {"ID": "id", "Word": "делать", "Category": "sloveso", "SlovakMeaning1": "robiť"})
    original = note_state(collection)

    with pytest.raises(ValueError, match="abort"):
        with undo_operation(collection, "rollback test"):
            note["Word"] = "changed"
            collection.update_note(note)
            raise ValueError("abort")

    assert note_state(collection) == original


def test_inspection_is_read_only_and_apply_backs_up_when_cli_runs(collection, source, core, tmp_path):
    note = add_note(collection, core, {"Word": "делать", "Translation": "do"}, ["russiancore5000::slov"])
    _, config_path = configure(collection, tmp_path, source, core)
    path = Path(collection.path)
    collection.close()
    before = hashlib.sha256(path.read_bytes()).hexdigest()

    inspected = run_cli(path, tmp_path / "cli-inspection", "inspect")
    preview = run_cli(path, tmp_path / "preview", "core5000", "--config", config_path)

    assert inspected.returncode == 0, inspected.stderr
    assert preview.returncode == 0, preview.stderr
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
    assert list(tmp_path.glob("collection.anki2.bak-*")) == []
    inventory = json.loads((tmp_path / "cli-inspection/inspect.json").read_text())
    assert any(model["id"] == core["id"] for model in inventory["models"])

    applied = run_cli(path, tmp_path / "apply", "core5000", "--config", config_path, "--apply")

    assert applied.returncode == 0, applied.stderr
    assert "sync normally" in applied.stdout
    backups = list(tmp_path.glob("collection.anki2.bak-*"))
    assert len(backups) == 1
    with closing(sqlite3.connect(backups[0])) as backup:
        assert backup.execute("select flds from notes where id=?", (note.id,)).fetchone()[0].endswith("\x1fdo")
    live = Collection(str(path))
    try:
        assert live.get_note(note.id).fields == note.fields
        assert "russiancore5000::aspect::impf." in live.get_note(note.id).tags
    finally:
        live.close()


def test_cli_requires_typed_confirmation_when_migrating_note_types(collection, source, target, tmp_path):
    note = add_note(collection, source, {"ID": "id", "Word": "делать", "Category": "sloveso", "SlovakMeaning1": "robiť"})
    _, config_path = configure(collection, tmp_path, source)
    path = Path(collection.path)
    collection.close()
    before = path.read_bytes()

    refused = run_cli(path, tmp_path / "refused", "migrate-genanki", "--config", config_path, "--apply", input_text="no\n")

    assert refused.returncode == 1
    assert "FULL UPLOAD" in refused.stdout
    assert path.read_bytes() == before
    assert list(tmp_path.glob("collection.anki2.bak-*")) == []

    accepted = run_cli(path, tmp_path / "accepted", "migrate-genanki", "--config", config_path, "--apply", input_text="yes\n")

    assert accepted.returncode == 0, accepted.stderr
    assert "AnkiDroid Download" in accepted.stdout
    live = Collection(str(path))
    try:
        assert live.get_note(note.id)["Aspect"] == "impf."
    finally:
        live.close()


def test_cli_refuses_open_collection_when_desktop_holds_lock(collection, source, tmp_path):
    add_note(collection, source, {"Word": "делать", "ID": "id", "Category": "sloveso", "SlovakMeaning1": "robiť"})
    report = tmp_path / "locked"

    result = run_cli(Path(collection.path), report, "inspect")

    assert result.returncode == 1
    assert "close desktop Anki" in result.stderr
    with (report / "errors.csv").open(newline="") as handle:
        assert next(csv.DictReader(handle))["status"] == "error"


def test_cli_refuses_version_mismatch_before_opening_source_when_version_differs(tmp_path):
    nonexistent = tmp_path / "missing.anki2"
    report = tmp_path / "wrong-version"

    result = main(["inspect", "--collection", str(nonexistent), "--anki-version", "0.0.1", "--report-dir", str(report)])

    assert result == 1
    assert not nonexistent.exists()
    assert "differs from library" in (report / "errors.csv").read_text()
