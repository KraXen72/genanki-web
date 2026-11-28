import importlib.util
import json
import sys
import tomllib
from pathlib import Path

import pytest
from anki.collection import Collection, ImportAnkiPackageRequest

from anki_fixups.aspect import AspectDictionary
from anki_fixups.contracts import Configuration, Template
from anki_fixups.inspection import inspect_collection


ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "templates/russian-vocabulary/template.toml"


def create_v4_package(destination: Path):
    """Export the real pack through the application's Python package builder."""
    with PACK.open("rb") as handle:
        pack = tomllib.load(handle)
    fields = [field["name"] for field in pack["fields"]]
    values = {"ID": "ru:фикстура:general", "Word": "фи́кстура", "Kind": "podst. meno, ženský rod", "SlovakMeaning1": "testovacia vzorka"}
    payload = {
        "packKey": pack["key"], "model": {
            "id": pack["model"]["id"], "name": pack["model"]["name"], "fields": fields,
            "css": (PACK.parent / pack["css"]).read_text(),
            "cards": [
                {"name": card["name"], "qfmt": (PACK.parent / card["front"]).read_text(), "afmt": (PACK.parent / card["back"]).read_text()}
                for card in pack["cards"]
            ],
        },
        "deck": {"id": 837122731, "name": "Fixup integration seed"},
        "notes": [{"id": values["ID"], "fields": [values.get(name, "") for name in fields], "tags": ["genanki::pod.m:ž"]}],
    }
    spec = importlib.util.spec_from_file_location("genanki_adapter", ROOT / "src/runtime/adapter.py")
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    destination.write_bytes(adapter.build_package(json.dumps(payload)))


def add_model(collection, name, fields, cards):
    model = collection.models.new(name)
    for field in fields:
        collection.models.add_field(model, collection.models.new_field(field))
    for name, question in cards:
        card = collection.models.new_template(name)
        card.update(qfmt=question, afmt="{{FrontSide}}")
        collection.models.add_template(model, card)
    collection.models.add(model)
    return model


def add_note(collection, model, fields, tags=()):
    note = collection.new_note(model)
    for name, value in fields.items():
        note[name] = value
    note.tags = list(tags)
    collection.add_note(note, 1)
    return note


def configure(collection, directory: Path, source, core=None, field_aliases=None):
    inspection = directory / "inspection"
    inspection.mkdir(exist_ok=True)
    inspect_collection(collection, Path(collection.path), inspection)
    lines = ["[inspection]", f"report = {json.dumps(str(inspection / 'inspect.json'))}"]
    if core is not None:
        lines.extend(["[core5000]", f"model_id = {core['id']}", f"name = {json.dumps(core['name'])}",
                      'word = "Word"', 'gloss = "Translation"', 'reverse_template = "Card 2"'])
    lines.extend(["[[genanki]]", f"model_id = {source['id']}", f"name = {json.dumps(source['name'])}", 'category = "Category"'])
    if field_aliases:
        lines.append("[genanki.fields]")
        lines.extend(f"{key} = {json.dumps(value)}" for key, value in field_aliases.items())
    path = directory / "config.toml"
    path.write_text("\n".join(lines) + "\n")
    return Configuration(path, Path(collection.path)), path


@pytest.fixture
def template():
    return Template.load(PACK)


@pytest.fixture
def dictionary(tmp_path):
    rows = json.loads((ROOT / "tests/fixtures/ru-aspect.json").read_text())
    path = tmp_path / "aspect.tsv"
    path.write_text("key\tstressed\taspect\tpartners\tsources\n" + "\n".join("\t".join(row) for row in rows) + "\n")
    return AspectDictionary(path)


@pytest.fixture
def collection(tmp_path):
    result = Collection(str(tmp_path / "collection.anki2"))
    try:
        yield result
    finally:
        result.close()


@pytest.fixture
def source(collection, template):
    fields = [name for name in template.fields if name not in {"Kind", "Aspect", "Motion", "Partner", "Usage"}]
    fields.insert(1, "Category")
    return add_model(collection, "Russian vocabulary v3", fields,
                     [(template.cards[0], "{{Word}}"), (template.cards[1], "{{SlovakMeaning1}}")])


@pytest.fixture
def target(collection, tmp_path, template):
    package = tmp_path / "v4.apkg"
    create_v4_package(package)
    collection.import_anki_package(ImportAnkiPackageRequest(package_path=str(package)))
    return collection.models.get(template.model_id)


@pytest.fixture
def core(collection):
    return add_model(collection, "Russian Core 5000", ["Word", "Translation"],
                     [("Card 1", "{{Tags}} {{Word}}"), ("Card 2", "{{Tags}} {{text:Translation}}")])
