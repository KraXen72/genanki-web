"""Read-only inventory used to review and configure one-time fixups."""

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from .aspect import plain_text
from .contracts import front_fields, model_shape


ASPECT_LIKE = re.compile(r"\b(?:impf\b|pf\.|imperfective\b|perfective\b|nedokonav\w*|dokonav\w*|НСВ\b|СВ\b)", re.I)
CORE_TAG = "russiancore5000::slov"


def has_tag(note, tag: str) -> bool:
    """Match Anki's case-insensitive hierarchical tag search."""
    target = tag.casefold()
    return any(value.casefold() == target or value.casefold().startswith(target + "::") for value in note.tags)


def markdown(value) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ").replace("\r", " ")


def inspect_collection(collection, original: Path, directory: Path) -> list[dict]:
    """Write the Markdown report, JSON model shapes, and Category fixtures."""
    by_model = defaultdict(list)
    tags = Counter()
    for note_id in collection.find_notes(""):
        note = collection.get_note(note_id)
        by_model[note.mid].append(note)
        for tag in note.tags:
            if tag.casefold().startswith("russiancore5000::"):
                tags[tag] += 1

    lines = ["# Anki collection inspection", "", f"Collection: `{original}`", ""]
    rows, models, fixtures = [], [], []
    for model in sorted(collection.models.all(), key=lambda model: (model["name"], model["id"])):
        notes = by_model[model["id"]]
        fields = [field["name"] for field in model["flds"]]
        categories = Counter()
        if {"ID", "Word", "Category"} <= set(fields):
            categories.update(note["Category"] for note in notes)
        models.append({"id": model["id"], "shape": model_shape(model), "categories": dict(categories)})
        rows.append({"note_type": model["name"], "model_id": model["id"], "status": "note-type", "value": len(notes)})
        lines.extend([
            f"## {markdown(model['name'])} ({model['id']})", "",
            f"Notes: {len(notes)}", "", "| # | Field | Front templates displaying it |",
            "|---|---|---|",
        ])
        for index, field in enumerate(fields):
            fronts = [card["name"] for card in model["tmpls"] if field in front_fields(card)]
            lines.append(f"| {index} | {markdown(field)} | {markdown(', '.join(fronts))} |")
        lines.extend(["", "Card templates: " + ", ".join(markdown(card["name"]) for card in model["tmpls"]), ""])
        if categories:
            lines.extend(["### Category values", "", "| Category (HTML stripped) | Count |", "|---|---|"])
            for value, count in sorted(categories.items()):
                lines.append(f"| {markdown(plain_text(value))} | {count} |")
                fixtures.append({"model_id": model["id"], "category": value, "count": count})
        relevant = {"ID", "Word", "Category"} <= set(fields) or any(has_tag(note, "russiancore5000") for note in notes)
        if relevant:
            lines.extend(["", "### Sample notes", ""])
            for note in notes[:3]:
                lines.extend([f"Note {note.id}:", "", "| Field | Value |", "|---|---|"])
                lines.extend(f"| {markdown(name)} | {markdown(plain_text(note[name]))} |" for name in fields)
                lines.append("")

    verbs = [note for notes in by_model.values() for note in notes if has_tag(note, CORE_TAG)]
    existing = sum(any(ASPECT_LIKE.search(plain_text(value)) for value in note.fields) for note in verbs)
    lines.extend(["## Core 5000", "", f"Tagged verbs: {len(verbs)}; aspect-like text in any field: {existing}.", "",
                  "| Tag | Count |", "|---|---|"])
    for tag, count in sorted(tags.items()):
        lines.append(f"| {markdown(tag)} | {count} |")
        rows.append({"note_type": "", "model_id": "", "status": "tag", "value": f"{tag}: {count}"})
    rows.append({"note_type": "", "model_id": "", "status": "verbs-with-aspect-text", "value": existing})
    (directory / "inspect.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (directory / "inspect.json").write_text(json.dumps({"collection": str(original), "models": models}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (directory / "category-fixtures.json").write_text(json.dumps(fixtures, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return rows


def write_csv(path: Path, columns: list[str], rows: list[dict]):
    """Write UTF-8 CSV with stable columns and correctly quoted field HTML."""
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
