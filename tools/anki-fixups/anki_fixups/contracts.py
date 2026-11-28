"""Validate inspected field layouts and the pack-authored v4 contract."""

import json
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path

from .aspect import normalized
from .safety import FixupError


def front_fields(template: dict) -> set[str]:
    """Find displayed field references, including Anki filters such as text:."""
    references = set()
    question = re.sub(r"<!--.*?-->", "", template["qfmt"], flags=re.S)
    for match in re.finditer(r"{{\s*([^{}]+?)\s*}}", question):
        expression = match[1].strip()
        if expression and expression[0] not in "#^/!":
            references.add(expression.split(":")[-1].strip())
    return references


def model_shape(model: dict) -> dict:
    return {
        "id": model["id"], "name": model["name"], "type": model["type"],
        "fields": [field["name"] for field in model["flds"]],
        "templates": [
            {"name": template["name"], "qfmt": template["qfmt"]}
            for template in model["tmpls"]
        ],
    }


@dataclass(frozen=True)
class Template:
    model_id: int
    name: str
    fields: tuple[str, ...]
    cards: tuple[str, ...]
    labels: dict[str, dict[str, str]]

    @classmethod
    def load(cls, path: Path):
        """Read model identity, field order, card order, and labels from the pack."""
        with path.open("rb") as handle:
            pack = tomllib.load(handle)
        labels = {field["name"]: field["labels"] for field in pack["fields"] if "labels" in field}
        return cls(
            pack["model"]["id"], pack["model"]["name"],
            tuple(field["name"] for field in pack["fields"]),
            tuple(card["name"] for card in pack["cards"]), labels,
        )

    def validate(self, collection) -> dict:
        model = collection.models.get(self.model_id)
        if model is None:
            raise FixupError(f"Missing {self.name} (ID {self.model_id}). Import a v4 package before migrating.")
        if model["name"] != self.name or tuple(field["name"] for field in model["flds"]) != self.fields:
            raise FixupError("The v4 note type name or field order differs from template.toml.")
        if model["type"] != 0 or tuple(card["name"] for card in model["tmpls"]) != self.cards:
            raise FixupError("The v4 card names or order differ from template.toml.")
        return model


class Configuration:
    """Load note-type mappings and compare them with this collection's inspection."""

    def __init__(self, path: Path, collection_path: Path):
        with path.open("rb") as handle:
            self.data = tomllib.load(handle)
        inspection_path = path.parent / self.data["inspection"]["report"]
        self.inspection = json.loads(inspection_path.read_text(encoding="utf-8"))
        if Path(self.inspection["collection"]).resolve() != collection_path.resolve():
            raise FixupError("This inspection belongs to another collection. Run inspect again.")
        self.models = {model["id"]: model for model in self.inspection["models"]}
        self.aliases = {
            normalized(key): normalized(value)
            for key, value in self.data.get("category_aliases", {}).items()
        }
        self.category_values = {
            normalized(key): value
            for key, value in self.data.get("category_values", {}).items()
        }
        reviews = []
        if filename := self.data.get("reviewed_notes_file"):
            with (path.parent / filename).open("rb") as handle:
                reviews = tomllib.load(handle)["reviewed_notes"]
        self.reviewed_notes = {}
        for review in reviews:
            key = (review["model_id"], review["id"])
            if key in self.reviewed_notes:
                raise FixupError(f"Duplicate reviewed note: {key}")
            self.reviewed_notes[key] = review

    def category_for(self, model_id: int, id_field: str, word: str, category: str) -> str:
        """Use a reviewed classification only while its original note data matches."""
        review = self.reviewed_notes.get((model_id, id_field))
        if review is None:
            return category
        if word != review["word"] or category != review["old_category"]:
            raise FixupError(f"Reviewed note {id_field} changed. Review its Word and Category again.")
        return review["category"]

    def model(self, collection, mapping: dict) -> dict:
        model_id = mapping["model_id"]
        model = collection.models.get(model_id)
        if model is None or model["name"] != mapping["name"]:
            raise FixupError(f"Configured note type {model_id} / {mapping['name']} is missing.")
        inspected = self.models.get(model_id)
        if inspected is None or model_shape(model) != inspected["shape"]:
            raise FixupError(f"Note type {model_id} changed since inspection. Run inspect again and update config.toml.")
        return model

    def core(self, collection) -> tuple[dict, dict]:
        mapping = self.data["core5000"]
        model = self.model(collection, mapping)
        fields = {field["name"] for field in model["flds"]}
        if not {mapping["word"], mapping["gloss"]} <= fields:
            raise FixupError("Configured Core 5000 headword/gloss fields are missing.")
        cards = [card for card in model["tmpls"] if card["name"] == mapping["reverse_template"]]
        if len(cards) != 1 or mapping["gloss"] not in front_fields(cards[0]):
            raise FixupError("The gloss field must appear on the front of the configured English → Russian card.")
        if any("Tags" not in front_fields(card) for card in model["tmpls"]):
            raise FixupError("Core card fronts must display Tags for the aspect badges.")
        return model, mapping

    def sources(self, collection, template: Template) -> list[tuple[dict, dict]]:
        mappings = self.data.get("genanki", [])
        configured = [mapping["model_id"] for mapping in mappings]
        if len(set(configured)) != len(configured):
            raise FixupError("Each source note type must be configured once.")
        supported_names = {"Russian vocabulary", "Russian vocabulary v1", "Russian vocabulary v2", "Russian vocabulary v3"}
        # Earlier exports used these names and IDs in the inspected collection.
        supported_ids = {
            1730000000001, 1455129969, 1759797711, 1759797712, 1759797713,
            6887797364293765650,
        }
        legacy = {
            model["id"] for model in collection.models.all()
            if (model["name"] in supported_names or model["id"] in supported_ids)
            and model["id"] != template.model_id
        }
        populated = {
            model_id for model_id in legacy if collection.find_notes(f"mid:{model_id}")
        }
        if not populated <= set(configured) or not set(configured) <= legacy:
            raise FixupError(f"Configure every legacy Russian vocabulary type. Found {sorted(populated)}, configured {configured}.")
        sources = []
        for mapping in mappings:
            model = self.model(collection, mapping)
            names = {field["name"] for field in model["flds"]}
            if mapping["category"] not in names:
                raise FixupError(f"Category field missing in {model['name']}.")
            aliases = mapping.get("fields", {})
            if set(aliases) - set(template.fields) or set(aliases.values()) - names:
                raise FixupError(f"Invalid v4 → old field mapping for {model['name']}.")
            for required in ("ID", "Word"):
                if aliases.get(required, required) not in names:
                    raise FixupError(f"Map {required} for {model['name']}.")
            sources.append((model, mapping))
        return sources
