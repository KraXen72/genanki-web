"""Narrow genanki adapter. Templates and field strings arrive already compiled."""

from contextlib import closing
import json
import os
import sqlite3
import tempfile
import time
import zipfile

import genanki


def _extract_database(package_path):
    """Reject unexpected media or corrupt members before reading the Anki database."""
    with zipfile.ZipFile(package_path) as archive:
        if archive.testzip() is not None:
            raise ValueError("Package ZIP integrity check failed")
        if set(archive.namelist()) != {"collection.anki2", "media"}:
            raise ValueError("Unexpected package members")
        if json.loads(archive.read("media")) != {}:
            raise ValueError("Unexpected package media")

        directory = os.path.dirname(package_path)
        database_path = os.path.join(directory, "verify.sqlite")
        with open(database_path, "wb") as output:
            output.write(archive.read("collection.anki2"))

    return database_path


def _verify_model_and_deck(connection, payload):
    """Compare persisted templates and field order against the unmodified input payload."""
    models_json, decks_json = connection.execute("SELECT models, decks FROM col").fetchone()
    expected_model = payload["model"]
    model = json.loads(models_json)[str(expected_model["id"])]
    field_names = [field["name"] for field in model["flds"]]
    if field_names != expected_model["fields"]:
        raise ValueError("Stored field order mismatch")

    template_keys = ("name", "qfmt", "afmt")
    cards = [{key: card[key] for key in template_keys} for card in model["tmpls"]]
    if cards != expected_model["cards"] or model["css"] != expected_model["css"]:
        raise ValueError("Stored card templates or stylesheet mismatch")

    expected_deck = payload["deck"]
    deck = json.loads(decks_json)[str(expected_deck["id"])]
    if deck["name"] != expected_deck["name"]:
        raise ValueError("Stored deck mismatch")


def _verify_notes(connection, payload, timestamp):
    """Check every note's GUID, data, modification time, and exact card ordinals."""
    rows = connection.execute("SELECT id, guid, flds, mod, mid FROM notes ORDER BY id").fetchall()
    if len(rows) != len(payload["notes"]):
        raise ValueError("Stored note count mismatch")

    cards_per_note = len(payload["model"]["cards"])
    expected_cards = [(ordinal, payload["deck"]["id"]) for ordinal in range(cards_per_note)]
    for row, note in zip(rows, payload["notes"]):
        note_id, guid, fields, modified, model_id = row
        if guid != genanki.guid_for(payload["packKey"], note["id"]):
            raise ValueError("Stored GUID mismatch")

        correct_fields = fields.split("\x1f") == note["fields"]
        correct_timestamp = modified == int(timestamp)
        correct_model = model_id == payload["model"]["id"]
        if not (correct_fields and correct_timestamp and correct_model):
            raise ValueError("Stored note data mismatch")

        cards = connection.execute(
            "SELECT ord, did FROM cards WHERE nid=? ORDER BY ord", (note_id,)
        ).fetchall()
        if cards != expected_cards:
            raise ValueError(
                "A note did not generate the expected cards. Check the pack's question fields."
            )

    total_cards = connection.execute("SELECT count(*) FROM cards").fetchone()[0]
    if total_cards != len(rows) * cards_per_note:
        raise ValueError("Stored card count mismatch")


def verify_package(path, payload, timestamp):
    """Check ZIP/SQLite integrity and persisted model, identity, note, and card data."""
    database_path = _extract_database(path)
    with closing(sqlite3.connect(database_path)) as connection:
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("SQLite integrity check failed")
        _verify_model_and_deck(connection, payload)
        _verify_notes(connection, payload, timestamp)


def _create_deck(payload):
    """Build genanki objects without allowing the writer to mutate our expected templates."""
    model_data = payload["model"]
    # genanki adds metadata to its template dictionaries during serialization
    model = genanki.Model(
        model_data["id"],
        model_data["name"],
        fields=[{"name": name} for name in model_data["fields"]],
        templates=[dict(card) for card in model_data["cards"]],
        css=model_data["css"],
    )
    deck = genanki.Deck(payload["deck"]["id"], payload["deck"]["name"])
    for note_data in payload["notes"]:
        note = genanki.Note(
            model=model,
            fields=note_data["fields"],
            guid=genanki.guid_for(payload["packKey"], note_data["id"]),
        )
        deck.add_note(note)

    return deck


def build_package(payload_json, report=lambda status: None):
    """Build and verify one APKG, removing all intermediate files even after failure."""
    payload = json.loads(payload_json)
    report("packaging")
    deck = _create_deck(payload)
    timestamp = time.time()

    # genanki leaves its mkstemp database behind; keep it in our disposable job directory
    previous_tempdir = tempfile.tempdir
    try:
        with tempfile.TemporaryDirectory(prefix="anki-export-") as directory:
            tempfile.tempdir = directory
            path = os.path.join(directory, "deck.apkg")
            genanki.Package(deck).write_to_file(path, timestamp=timestamp)
            report("verifying")
            verify_package(path, payload, timestamp)
            with open(path, "rb") as package:
                return package.read()
    finally:
        tempfile.tempdir = previous_tempdir
