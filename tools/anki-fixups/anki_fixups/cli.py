"""Inspect Russian Anki notes and preview one-time collection changes."""

import argparse
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .aspect import AspectDictionary
from .contracts import Configuration, Template
from .fixups import CORE_COLUMNS, MIGRATE_COLUMNS, apply_plan, plan_core, plan_migration
from .inspection import inspect_collection, write_csv
from .safety import FixupError, collection_snapshot, create_backup, require_version


FULL_SYNC = """This note-type migration requires a one-way FULL UPLOAD from desktop.
1. Before running: sync AnkiDroid, then desktop, so desktop has every review.
2. After running: open Anki, Tools → Check Database, sync, choose Upload to AnkiWeb.
3. On AnkiDroid: sync and choose Download.
Reviews made on the phone between steps 1 and 3 will be lost. Keep it closed.
"""


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    subcommands = result.add_subparsers(dest="command", required=True)
    for command in ("inspect", "core5000", "migrate-genanki"):
        subcommand = subcommands.add_parser(command)
        subcommand.add_argument("--collection", type=Path, required=True)
        subcommand.add_argument("--anki-version", required=True, help="Exact desktop version from Help → About")
        subcommand.add_argument("--report-dir", type=Path, help="Private output directory; defaults under _artifacts/anki-fixups")
        if command == "inspect":
            continue
        subcommand.add_argument("--config", type=Path, default=Path("tools/anki-fixups/config.toml"),
                                help="Note-type mappings and inspection report (default: tools/anki-fixups/config.toml)")
        subcommand.add_argument("--dictionary", type=Path, default=Path("data/ru-aspect.tsv"),
                                help="Aspect dictionary TSV (default: data/ru-aspect.tsv)")
        subcommand.add_argument("--apply", action="store_true",
                                help="Apply this invocation's planned changes after creating a backup")
        if command == "migrate-genanki":
            subcommand.add_argument("--template", type=Path, default=Path("templates/russian-vocabulary/template.toml"),
                                    help="Pack manifest defining the target v4 note type")
            subcommand.add_argument("--prefer", choices=("dictionary", "category"), default="dictionary",
                                    help="Aspect source to keep on a conflict (default: dictionary)")
            subcommand.add_argument("--no-notetype-change", action="store_true",
                                    help="Abbreviate parsed Categories and add tags while keeping existing note types")
    return result


def main(argv=None) -> int:
    """Write reports for every valid invocation and change the source only on apply."""
    args = parser().parse_args(argv)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    directory = args.report_dir or Path("_artifacts/anki-fixups") / stamp
    directory.mkdir(parents=True, exist_ok=True)
    filename = {"inspect": "inspect.csv", "core5000": "core5000-report.csv", "migrate-genanki": "migrate-report.csv"}[args.command]
    columns = {"inspect": ["note_type", "model_id", "status", "value"], "core5000": CORE_COLUMNS, "migrate-genanki": MIGRATE_COLUMNS}[args.command]
    report = directory / filename
    write_csv(report, columns, [])
    try:
        require_version(args.anki_version)
        original = args.collection.expanduser().resolve(strict=True)
        with collection_snapshot(original) as (collection, pristine):
            if args.command == "inspect":
                rows = inspect_collection(collection, original, directory)
                plan = None
            else:
                config = Configuration(args.config, original)
                dictionary = AspectDictionary(args.dictionary)
                if args.command == "core5000":
                    plan = plan_core(collection, config, dictionary)
                else:
                    plan = plan_migration(collection, config, dictionary, Template.load(args.template),
                                          args.prefer, args.no_notetype_change)
                rows = plan.rows
            write_csv(report, columns, rows)
            mode = "Read-only" if plan is None else "Preview"
            print(f"{mode}: " + ", ".join(f"{status}={count}" for status, count in sorted(Counter(row["status"] for row in rows).items())))
            print(f"Reports: {directory.resolve()}")
            if plan is None or not args.apply or not plan.mutations:
                if plan is not None:
                    print(f"Planned edits: {len(plan.mutations)}. " + ("Use --apply to write." if plan.mutations else "Nothing to write."))
                return 0
            print("Also make an Anki backup first: File → Create Backup, then close Anki again.")
            if plan.target_id is not None:
                print(FULL_SYNC)
                if input('Type "yes" to apply this migration: ').strip() != "yes":
                    raise FixupError("Migration cancelled; the collection is unchanged.")
            create_backup(pristine, original)
        # The backend now acquires its own exclusive lock. It refuses if Anki
        # opened the collection after the snapshot lock was released.
        from anki.collection import Collection

        live = Collection(str(original))
        try:
            apply_plan(live, plan)
        finally:
            live.close()
        print(f"Applied {len(plan.mutations)} note edits.")
        if plan.target_id is None:
            print("Field contents updated; sync normally.")
        else:
            print("Next: Check Database, desktop full Upload, then AnkiDroid Download.")
        return 0
    except (Exception, KeyboardInterrupt) as error:
        message = str(error) or type(error).__name__
        write_csv(directory / "errors.csv", ["status", "error"], [{"status": "error", "error": message}])
        print(f"error=1: {message}\nReports: {directory.resolve()}", file=sys.stderr)
        return 1
