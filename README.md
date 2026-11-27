# genanki web

Create Anki packages (`.apkg`) in your browser. An LLM writes the note content as TOML; genanki web validates it and builds the package locally.

![genanki web on desktop at 1920×1080](docs/screenshot.png)

## Usage

1. Choose a template and click **Copy LLM prompt**.
2. Paste the prompt into your LLM conversation.
3. Send vocabulary, screenshots, or other material to the LLM.
4. Ask it to `flush` or `export` the queued notes as TOML.
5. Paste the TOML into genanki web, or load it with **Open TOML**.
6. Click **Validate**. Correct any errors and review warnings.
7. Click **Generate .apkg**, confirm any review warnings with **Export anyway**, then click **Download .apkg**. Import the package into Anki or AnkiDroid.

Keep each note's ID when correcting its content so later exports can update the same note. Anki's import settings and local edits affect how it applies updates.

## Templates and validation

The bundled templates are **Question & answer** and **Russian vocabulary**. To create your own, open [Template docs](https://kraxen72.github.io/genanki-web/docs.html) and download the starter ZIP. Import a pack from your device with **Import template ZIP**, or contribute its files through a pull request.

Every pack supplies a JSON Schema, field mappings, card HTML, CSS, and LLM instructions. Validation checks the TOML structure, removes identical duplicates, and rejects conflicting note IDs.

The Russian vocabulary pack also checks stress marks, verb aspect, aspect partners, and paired motion direction using Wiktionary and OpenRussian data. Errors block export. Review warnings require **Export anyway**; notices allow export immediately.

Russian notes go to `Ruština::Vocabulary::<source>` when every note shares a nonempty source, or `Ruština::Vocabulary::Mix` otherwise. The pack uses Anki note type **Russian vocabulary v4** and TOML input version **2**. See the [pack reference](docs/packs.md) for validation and versioning details.

## How it works

![Browser compilation, Russian validation, worker packaging, and local download](docs/architecture.png)

The browser maps validated content into Anki fields. A Web Worker runs the pinned Python `genanki` library through Pyodide, then verifies the package's ZIP, SQLite data, identities, fields, tags, and card counts before offering a download.

TOML and imported templates stay in memory until the tab reloads. The browser saves theme preferences and caches dictionary assets. Runtime files come from the same site. See [Architecture](docs/design.md) and [third-party notices](docs/third-party-notices.md).

## Development

Use Node 24 and pnpm 10.34.9. Run `pnpm install --frozen-lockfile` first. VS Code includes TypeScript support. The workspace recommends Python and Pylance for the desktop tools and the MDX extension for the template-authoring guide.

| Command | Description |
| --- | --- |
| `pnpm dev` / `pnpm start` | Run the app at `http://localhost:3000` with live reload |
| `pnpm build` | Generate schemas, prepare runtime assets, check types, and build `dist/` |
| `pnpm serve` | Preview the built site |
| `pnpm test` | Run unit and Pyodide runtime tests |
| `pnpm typecheck` | Check UI and worker types |
| `pnpm test:e2e` | Run Chromium and Firefox tests against the running dev server |
| `pnpm format` / `pnpm format:check` | Format or check source, tests, scripts, and template HTML/CSS |
| `pnpm schemas:generate` | Regenerate bundled input schemas and TypeScript contracts |
| `pnpm ru-stress:generate [dump.jsonl.gz]` | Rebuild the Russian stress dictionary |
| `pnpm ru-aspect:generate [dump.jsonl.gz]` | Rebuild the aspect dictionary, TSV, and source metadata |
| `pnpm ru-data:generate [dump.jsonl.gz]` | Rebuild both dictionaries in one Wiktionary pass |
| `python -m pytest tools/anki-fixups/tests` | Test the desktop Anki tools after [Python setup](tools/anki-fixups/README.md#install) |

Dictionary commands stream the full Wiktionary dump from kaikki.org unless you pass a local gzip file. They also fetch OpenRussian data. Record the printed source versions in the commit message when updating dictionaries.

See [Development](docs/development.md) for browser setup and deployment, and [Verification](docs/verification.md) for test coverage, recorded measurements, and AnkiDroid device checks.

## Credits

Simon Willison's writing introduced me to using Pyodide to run Python in the browser.