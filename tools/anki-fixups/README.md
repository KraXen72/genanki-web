# One-time Anki fixups

`anki-fixups` inspects a desktop collection, adds aspect badges to Russian Core 5000 verbs, and migrates older genanki vocabulary notes to the pack's v4 note type.

Run commands without `--apply` to preview changes. Review the CSV report, create an Anki backup, and close Anki before applying edits.

## Install

Use Python 3.11+ on the same operating system as desktop Anki. Read the Anki version in **Help → About**. `requirements-desktop.txt` pins **26.9.4**; update that pin when your desktop version changes.

Pass the desktop version with `--anki-version`. The CLI compares that supplied value with the installed Python `anki` package before opening a collection.

From the repository root, in PowerShell:

```powershell
function fixanki {
    uv run --project tools/anki-fixups --python 3.13 --with-requirements tools/anki-fixups/requirements-desktop.txt anki-fixups @args
}
$collection = "$env:APPDATA/Anki2/User 1/collection.anki2"
```

uv installs the requested Python and the pinned Anki dependency. Linux users can use the same `uv run` prefix with a Linux collection path.

Use a Linux-local collection copy for WSL tests. The CLI rejects standard Windows drive paths under `/mnt/<drive>/`. Run against live Windows collections with native Windows Python so Anki and the CLI use compatible file locking.

VS Code recommends Python and Pylance. Select the interpreter in `tools/anki-fixups/.venv`.

| Command | Action |
| --- | --- |
| `python -m pip wheel --no-deps tools/anki-fixups -w _artifacts/anki-fixups/wheels` | Build the CLI wheel |
| `python -m anki_fixups --help` | List commands |
| `python -m pytest tools/anki-fixups/tests` | Run parser, lookup, formatting, and Anki collection tests |
| `python -m coverage run --branch --source=anki_fixups -m pytest tools/anki-fixups/tests` | Measure branch coverage; view it with `python -m coverage report -m` |

Use the virtual environment's Python in these commands. Install `requirements-desktop.txt` before using a built wheel; it supplies the pinned Anki library.

## 1. Inspect and configure

Sync AnkiDroid, then desktop. Create an Anki backup with **File → Create Backup**, and close desktop Anki.

```powershell
fixanki inspect --collection $collection --anki-version 26.9.4 --report-dir _artifacts/anki-fixups/inspect
```

Review `inspect.md`. It lists:

- Note types, ordered fields, card names, and fields displayed on card fronts.
- Counts of `russiancore5000::` tags and legacy `Category` values.
- Up to three sample notes for each relevant type.

`inspect.json` records model identities, field order, card names, and front templates. `category-fixtures.json` records distinct legacy Categories and their counts. Reports contain private note text; keep them under the ignored `_artifacts/` folder.

Copy `config.example.toml` to `config.toml` beside it. Confirm each configured model ID, name, and field against the report. Set `[inspection].report` to the generated `inspect.json`; relative paths start from the config file's directory.

The CLI binds the inspection to the collection path and compares configured models with the recorded identities, field order, card names, and front templates. After changing these, run `inspect` again and update the report path in `config.toml`.

The example configuration covers six legacy vocabulary types inspected on 2026-11-27. Same-named fields map automatically. Explicit `[genanki.fields]` entries use `v4 field = old field`. Combined `SlovakMeanings` and `EnglishGlosses` values move unchanged into `SlovakMeaning1` and `EnglishGloss1`.

`[category_aliases]` maps individual tokens. `[category_values]` maps entire Category values, including English values with commas inside parentheses. Unrecognized tokens become `Usage` text with their original case. Existing tags stay attached.

The committed fixtures contain 97 model/Category combinations from that inspection. The parser leaves incomplete or conflicting Categories as `unparsed` or `needs-review`. `reviewed_notes_file` selects `reviewed-notes.toml`, which records explicit resolutions for the twelve affected notes. Each entry matches the source model, ID, original Word, and original Category. Migration aborts if a reviewed note has changed.

The report keeps `old_category`, adds `reviewed_category`, and shows the resulting Kind and Usage. Reviews supply missing noun genders, retain plural headwords, and record secondary grammatical uses in Usage. Meanings, examples, Word, and ID stay unchanged.

## 2. Core 5000 aspect badges

```powershell
fixanki core5000 --collection $collection --anki-version 26.9.4
# Review core5000-report.csv, then:
fixanki core5000 --collection $collection --anki-version 26.9.4 --apply
```

The inspected Core model uses `Word`, `Translation`, and reverse template `Card 2`. The CLI checks that the reverse front displays `Translation`.

Notes matching `russiancore5000::slov` receive tags such as `russiancore5000::aspect::pf.` and `russiancore5000::motion::unidir.` when the lookup succeeds. The existing templates display the final segment as a small badge: `pf.` or `unidir.`. Both card fronts must reference `Tags`; the CLI stops if they do not.

Every field, including the English gloss and German translations, stays unchanged. Partners remain dictionary suggestions in the CSV report. Possible untagged verbs also appear for review. Ambiguous and missing lookups leave notes unchanged.

Successful lookups refresh only the managed aspect/motion tags. Other tags remain attached. Repeated runs make zero edits once badges match. The CSV includes old/new tags and unchanged old/new glosses.

Each invocation builds a fresh plan and writes a report. The apply invocation uses its own plan. Keep the preview report in a separate directory if you need to compare results.

These edits change tags. Templates and note types stay unchanged. Sync normally afterwards.

## 3. Migrate genanki notes to v4

Export a v4 APKG from genanki web and import it into desktop Anki. The CLI requires model **1401682072**, named `Russian vocabulary v4`, with the field and card order in `templates/russian-vocabulary/template.toml`. It checks this model before planning a migration.

After importing, sync and close desktop Anki. Run `inspect` again and update `[inspection].report` in `config.toml`.

```powershell
fixanki migrate-genanki --collection $collection --anki-version 26.9.4
# Review migrate-report.csv, especially corrections and skipped notes, then:
fixanki migrate-genanki --collection $collection --anki-version 26.9.4 --apply
```

Dictionary values resolve aspect conflicts by default. `--prefer category` keeps the Category value and reports `aspect-conflict`.

`not-found` and `ambiguous` keep the existing aspect. A missing aspect with a `not-found` lookup is reported as `aspect-missing`. An ambiguous lookup keeps the `ambiguous` status.

Each invocation recomputes the plan and writes its own report. A failed invocation writes `errors.csv`.

Applying a note-type migration prints the full-sync steps and requires the exact typed response `yes`:

1. Before migration, sync AnkiDroid and then desktop. Stop reviewing on the phone.
2. After migration, open desktop Anki, run **Tools → Check Database**, sync, and choose **Upload to AnkiWeb**.
3. On AnkiDroid, sync and choose **Download**. Reviews made there between steps 1 and 3 will be lost.

### Category-only option

Add `--no-notetype-change` to abbreviate aspect words and add a `genanki::` tag for each successfully parsed Category. Categories that need review remain unchanged. This mode keeps existing note types and uses normal sync.

Use the full migration to populate v4 fields and apply dictionary aspect corrections. Category-only mode leaves notes on older note types; check how later APKG imports handle them in Anki.

## Backups and recovery

Inspection and previews use disposable collection snapshots. Before applying planned edits, the CLI creates a WAL-consistent `collection.anki2.bak-<UTC timestamp>` beside the source. Create a separate Anki backup as well.

The CLI groups an apply into one undo operation and undoes completed operations if an error occurs. Anki's undo history ends when the CLI process closes. Use the adjacent backup for later recovery.

Close Anki before restoring a backup. Keep reports with it: reports identify affected notes and planned statuses, and the backup preserves the previous collection.
