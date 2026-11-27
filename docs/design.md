# Architecture

genanki web is a static SolidJS application. The user supplies TOML and selects a template pack. JavaScript validates the batch and maps its values into Anki fields. A Web Worker runs Python through Pyodide to create and verify an `.apkg` package.

GitHub Pages serves the site, template assets, dictionaries, and Python runtime files. User content is processed in the browser.

## Export flow

1. Load a bundled template or import a local template ZIP.
2. Parse the TOML and check its header, note identities, and pack-specific schema.
3. Remove identical duplicate notes and resolve the destination deck.
4. Run the pack's content validators and compile its ordered Anki fields and tags.
5. Show errors, warnings, notices, and note/card counts. Review warnings require **Export anyway**.
6. Send the compiled payload to the worker. Pyodide loads on the first export.
7. Build the package with `genanki`, verify its ZIP and SQLite contents, and return its bytes.
8. Offer the verified package through a browser download URL.

## Code ownership

| Area | Files | Responsibility |
| --- | --- | --- |
| UI | `src/App.tsx`, `src/components/` | Session state, editing, validation results, export progress, and downloads |
| Pack loading | `src/core/packs.ts`, `src/core/paths.ts` | Bundled/imported pack loading, file paths, schemas, and resource bounds |
| Input and compilation | `src/core/schema.ts`, `src/core/validation.ts`, `src/core/compiler.ts` | TOML validation, identities, duplicates, destinations, fields, labels, and tags |
| LLM instructions | `prompts/queue.md`, each pack's `prompt.md`, `src/core/prompt.ts` | Shared queue rules, subject instructions, and schema-derived references/examples |
| Content validation | `src/validators/` | Russian stress and verb checks |
| Worker client | `src/runtime/exporter.ts`, `src/runtime/protocol.ts` | Worker lifecycle, progress, cancellation, and transferred bytes |
| Python runtime | `src/runtime/export.worker.ts`, `bootstrap.py`, `adapter.py` | Runtime initialization, package construction, verification, and temporary-file cleanup |
| Template authoring guide | `src/docs/`, `examples/vocabulary-starter/` | Browser documentation and the downloadable starter pack |

## Templates and contracts

A pack describes one Anki note type and its cards. Bundled packs and imported ZIPs use the same loader. Each pack contains a manifest, complete input schema, LLM instructions, card HTML, and CSS. See [Template packs](packs.md) for the format, supported JSON Schema features, field mappings, and limits.

The repository keeps each bundled pack's note constraints in `note.schema.json`. The schema build combines them with the shared envelope and manifest to produce `input.schema.json`. Imported packs supply that complete schema directly.

`schemas/manifest.schema.json` and `schemas/export.schema.json` define the pack and worker-payload contracts. Generated TypeScript types follow these schemas. `src/runtime/protocol.ts` defines worker messages and stages.

The compiler HTML-escapes input values and expands label mappings. It passes card HTML and CSS through to `genanki`. Anki renders those templates after import.

## Russian vocabulary

`templates/russian-vocabulary/template.toml` defines **Russian vocabulary v4**, model ID `1401682072`, with 19 fields and two cards per note. Its TOML input version is **2**. Each note contains one to three meanings. Each meaning has Slovak and English text and an optional Russian sentence with its Slovak translation.

The pack maps kind, aspect, and motion slugs to Slovak display labels. Its `ru-stress` validator checks marked words, partners, and Russian examples. Its `ru-aspect` validator checks verb aspect, partners, and the 14 unprefixed motion pairs. See [Validators](packs.md#validators) for dictionary generation and caching. The desktop tools read the generated aspect TSV.

Card templates use Anki's native Russian TTS expressions. Playback requires a Russian voice and AnkiDroid 2.17+ on Android. Review the generated cards in Anki to check appearance and playback.

## Identity and updates

Note GUIDs use `genanki.guid_for(pack_key, note_id)`. Corrected content keeps its GUID when the pack key and explicit note ID stay the same. The compiler removes repeated identical IDs/content and rejects conflicting uses of an ID.

Each export contains one model and one destination deck. The Russian pack uses `Ruština::Vocabulary::<source>` for a shared nonempty source and `Ruština::Vocabulary::Mix` otherwise. Deck IDs derive from the normalized full deck path.

Keep model IDs stable for appearance changes. Field or card changes need a migration decision; the [desktop fixup CLI](../tools/anki-fixups/README.md) handles older Russian vocabulary note types.

Exports use current modification timestamps. Anki's [import settings](https://docs.ankiweb.net/importing/packaged-decks.html), local edits, and note-type compatibility determine how reimports update existing notes and cards.

## Runtime and cleanup

`runtime.lock.json` pins Pyodide, `genanki`, Python dependencies, and asset hashes. `scripts/prepare-runtime.mjs` prepares the same-origin files before development or builds. See [runtime notices](runtime-notices.md) for versions and licenses.

One worker handles one export at a time and reuses its initialized Python runtime after success. Cancellation or failure destroys the worker. A retry creates a fresh worker while keeping the TOML available.

The adapter builds `genanki.Model`, `Deck`, `Note`, and `Package` objects from ordered compiled values. It verifies the package before returning bytes and removes the job's temporary files, including `genanki`'s intermediate database. The worker releases Python proxy objects. The UI revokes download URLs when replacing results or closing.

## Storage and deployment

TOML, imported packs, and export results stay in the current tab's memory. Reloading clears them. An explicit light/dark preference is saved under `genanki-web:theme`; system mode removes that preference.

Production builds cache compressed dictionary assets by their content-hashed URLs. A changed URL downloads new data. Restricted storage falls back to ordinary downloads. A first visit requires the site and its runtime assets to be available.

GitHub Actions builds and tests the static site before deployment. `VITE_BASE` supplies the repository subpath for assets and workers. See [Development](development.md#deployment) for setup and [Verification](verification.md) for coverage and remaining device checks.
