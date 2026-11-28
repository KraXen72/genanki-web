"""Plan field edits and apply reviewed note-type migrations through Anki's API."""

import re
from dataclasses import dataclass, field

from .aspect import AspectDictionary, aspect_key, motion_for
from .categories import abbreviated_category, parse_category
from .contracts import Configuration, Template, model_shape
from .inspection import CORE_TAG, has_tag
from .safety import FixupError, undo_operation


CORE_COLUMNS = ["note_id", "word", "status", "aspect", "partners", "old_gloss", "new_gloss", "old_tags", "new_tags"]
MIGRATE_COLUMNS = ["note_id", "note_type", "id_field", "word", "old_category", "kind", "aspect", "partner", "motion", "usage", "status", "reviewed_category"]
BADGE_PREFIXES = ("russiancore5000::aspect::", "russiancore5000::motion::")
ASPECT_BADGES = {"impf": "impf.", "pf": "pf.", "both": "impf./pf."}


def core_badges(word: str, tags: list[str], lookup) -> tuple[str, list[str]]:
    """Replace managed badges after a successful lookup, preserving other tags."""
    if lookup.status != "found":
        return lookup.status, list(tags)
    updated = [
        tag for tag in tags
        if not tag.casefold().startswith(BADGE_PREFIXES)
    ]
    updated.append(BADGE_PREFIXES[0] + ASPECT_BADGES[lookup.aspect])
    motion, _ = motion_for(word)
    if motion:
        updated.append(BADGE_PREFIXES[1] + motion + ".")
    unchanged = {tag.casefold() for tag in updated} == {tag.casefold() for tag in tags}
    return ("skipped-existing" if unchanged else "added"), updated


@dataclass
class Mutation:
    note_id: int
    model_id: int
    guid: str
    original_fields: tuple[str, ...]
    original_tags: tuple[str, ...]
    values: dict[str, str]
    tags: tuple[str, ...]

    @classmethod
    def for_note(cls, note, values: dict[str, str], tags=None):
        return cls(note.id, note.mid, note.guid, tuple(note.fields), tuple(note.tags), values, tuple(note.tags if tags is None else tags))


@dataclass
class Plan:
    rows: list[dict] = field(default_factory=list)
    mutations: list[Mutation] = field(default_factory=list)
    models: dict[int, dict] = field(default_factory=dict)
    mappings: dict[int, list[int]] = field(default_factory=dict)
    target_id: int | None = None


def plan_core(collection, config: Configuration, dictionary: AspectDictionary) -> Plan:
    """Add aspect/motion badges to tagged Core verbs while keeping every field."""
    model, mapping = config.core(collection)
    plan = Plan(models={model["id"]: model_shape(model)})
    selected = set(collection.find_notes(f"tag:{CORE_TAG}"))
    for note_id in selected:
        if collection.get_note(note_id).mid != model["id"]:
            raise FixupError("The Core verb tag appears on another note type. Correct the tags or configured Core model.")
    for note_id in collection.find_notes(f"mid:{model['id']}"):
        note = collection.get_note(note_id)
        word, gloss = note[mapping["word"]], note[mapping["gloss"]]
        lookup = dictionary.lookup(word)
        if note_id in selected:
            status, new_tags = core_badges(word, note.tags, lookup)
            if status == "added":
                plan.mutations.append(Mutation.for_note(note, {}, new_tags))
        else:
            key = aspect_key(word)
            if not has_tag(note, "russiancore5000") or not re.search(r"(?:ть|ти|чь|ться|тись|чься)$", key) or key not in dictionary.entries:
                continue
            status, new_tags = "possible-untagged-verb", note.tags
        plan.rows.append({
            "note_id": note_id, "word": word, "status": status, "aspect": lookup.aspect,
            "partners": ", ".join(lookup.partners), "old_gloss": gloss, "new_gloss": gloss,
            "old_tags": " ".join(note.tags), "new_tags": " ".join(new_tags),
        })
    return plan


def field_mapping(model: dict, mapping: dict, template: Template) -> list[int]:
    """Map every v4 field to its same-named or explicitly configured source."""
    old_fields = [field["name"] for field in model["flds"]]
    aliases = mapping.get("fields", {})
    indices = []
    for name in template.fields:
        source = aliases.get(name, name)
        indices.append(old_fields.index(source) if source in old_fields else -1)
    mapped = {old_fields[index] for index in indices if index >= 0}
    unmapped = set(old_fields) - mapped - {mapping["category"]}
    if unmapped:
        raise FixupError(f"Map source fields in [genanki.fields] in config.toml before migrating {model['name']}: {sorted(unmapped)}")
    if len([index for index in indices if index >= 0]) != len({index for index in indices if index >= 0}):
        raise FixupError(f"A source field maps to several v4 fields in {model['name']}.")
    return indices


def resolve_aspect(category_aspect: str, lookup, prefer: str) -> tuple[str, str]:
    if lookup.status != "found":
        if not category_aspect and lookup.status == "not-found":
            return "", "aspect-missing"
        return category_aspect, lookup.status
    if not category_aspect:
        return lookup.aspect, "aspect-filled"
    if category_aspect == lookup.aspect:
        return category_aspect, "migrated"
    if prefer == "category":
        return category_aspect, "aspect-conflict"
    return lookup.aspect, "aspect-corrected"


def plan_migration(collection, config: Configuration, dictionary: AspectDictionary, template: Template,
                   prefer="dictionary", no_notetype_change=False) -> Plan:
    """Build a complete migration preview without mutating the collection."""
    plan = Plan()
    if not no_notetype_change:
        target = template.validate(collection)
        plan.target_id = target["id"]
        plan.models[target["id"]] = model_shape(target)
    for model, mapping in config.sources(collection, template):
        plan.models[model["id"]] = model_shape(model)
        if not no_notetype_change:
            if model["type"] != 0 or tuple(card["name"] for card in model["tmpls"]) != template.cards:
                raise FixupError(f"Card names and order in {model['name']} must match v4 to preserve existing card scheduling.")
            indices = field_mapping(model, mapping, template)
            plan.mappings[model["id"]] = indices
        aliases = mapping.get("fields", {})
        for note_id in collection.find_notes(f"mid:{model['id']}"):
            note = collection.get_note(note_id)
            word = note[aliases.get("Word", "Word")]
            category_value = note[mapping["category"]]
            reviewed_category = config.category_for(
                model["id"], note[aliases.get("ID", "ID")], word, category_value,
            )
            category = parse_category(reviewed_category, config.aliases, config.category_values)
            if reviewed_category != category_value and category.status:
                raise FixupError(f"Reviewed Category for note {note_id} still needs review.")
            row = {
                "note_id": note_id, "note_type": model["name"],
                "id_field": note[aliases.get("ID", "ID")], "word": word,
                "old_category": category_value, "kind": category.kind, "aspect": category.aspect,
                "partner": "", "motion": "", "usage": category.usage,
                "status": category.status or "migrated",
                "reviewed_category": reviewed_category if reviewed_category != category_value else "",
            }
            plan.rows.append(row)
            if category.status:
                continue
            if category.kind not in template.labels["Kind"]:
                row["status"] = "unparsed"
                continue
            tags = list(note.tags)
            tag = f"genanki::{category.kind}"
            if tag.casefold() not in {existing.casefold() for existing in tags}:
                tags.append(tag)
            if no_notetype_change:
                rewritten = abbreviated_category(category_value)
                if rewritten != category_value or tags != note.tags:
                    plan.mutations.append(Mutation.for_note(note, {mapping["category"]: rewritten}, tags))
                continue

            aspect, partner, motion = "", "", ""
            if category.kind == "slov":
                lookup = dictionary.lookup(word)
                aspect, row["status"] = resolve_aspect(category.aspect, lookup, prefer)
                if lookup.status == "found" and 1 <= len(lookup.partners) <= 2:
                    partner = ", ".join(lookup.partners)
                motion, _ = motion_for(word)
            values = {
                name: note.fields[index] if index >= 0 else ""
                for name, index in zip(template.fields, indices)
            }
            usage = "; ".join(value for value in (values["Usage"], category.usage) if value)
            # Preserve any existing grammar field that would otherwise be discarded.
            for name in ("Kind", "Aspect", "Partner", "Motion"):
                if values[name]:
                    raise FixupError(f"Note {note_id} already has {name}. Correct its mapping before migrating to preserve that value.")
            values.update({
                "Kind": template.labels["Kind"][category.kind],
                "Aspect": template.labels["Aspect"].get(aspect, ""), "Partner": partner,
                "Motion": template.labels["Motion"].get(motion, ""), "Usage": usage,
            })
            row.update(aspect=aspect, partner=partner, motion=motion, usage=usage)
            plan.mutations.append(Mutation.for_note(note, values, tags))
    return plan


def apply_plan(collection, plan: Plan):
    """Validate the preview against live notes, then apply one grouped operation."""
    for model_id, shape in plan.models.items():
        model = collection.models.get(model_id)
        if model is None or model_shape(model) != shape:
            raise FixupError("A note type changed after the preview; run the command again.")
    for mutation in plan.mutations:
        note = collection.get_note(mutation.note_id)
        if (note.mid, note.guid, tuple(note.fields), tuple(note.tags)) != (
            mutation.model_id, mutation.guid, mutation.original_fields, mutation.original_tags,
        ):
            raise FixupError(f"Note {note.id} changed after the preview; run the command again.")
    if not plan.mutations:
        return
    with undo_operation(collection, "One-time Russian vocabulary fixups") as undo_target:
        if plan.target_id is not None:
            for source_id, indices in plan.mappings.items():
                note_ids = [mutation.note_id for mutation in plan.mutations if mutation.model_id == source_id]
                if not note_ids:
                    continue
                request = collection.models.change_notetype_info(
                    old_notetype_id=source_id, new_notetype_id=plan.target_id,
                ).input
                del request.note_ids[:]
                request.note_ids.extend(note_ids)
                del request.new_fields[:]
                request.new_fields.extend(indices)
                del request.new_templates[:]
                request.new_templates.extend([0, 1])
                collection.models.change_notetype_of_notes(request)
                # Merging after each operation keeps the target within Anki's undo limit.
                collection.merge_undo_entries(undo_target)
        notes = []
        for mutation in plan.mutations:
            note = collection.get_note(mutation.note_id)
            for name, value in mutation.values.items():
                note[name] = value
            note.tags = list(mutation.tags)
            notes.append(note)
        collection.update_notes(notes)
