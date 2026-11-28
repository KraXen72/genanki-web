# Development

Use Node 24, pnpm 10.34.9, and Python 3.11+ for package inspection in browser tests. VS Code includes TypeScript language support. The workspace recommends Python and Pylance for Python files.

```sh
pnpm install --frozen-lockfile
pnpm dev                         # http://localhost:3000
pnpm test                        # compiler, pack import, and real Pyodide exports
pnpm typecheck
pnpm exec playwright install chromium firefox
pnpm test:e2e                    # uses the running server on port 3000
```

For the production acceptance suite:

```sh
VITE_BASE=/genanki-web/ pnpm build
E2E_PRODUCTION=1 E2E_BASE_URL=http://127.0.0.1:4173/genanki-web/ pnpm test:e2e
```

Playwright starts the static preview server in production mode. It downloads actual APKGs and invokes `tests/inspect_package.py` to inspect their ZIP and SQLite data independently. Chromium and Firefox run the same flows. `UPDATE_SCREENSHOT=1` refreshes the README's 1920×1080 screenshot during the first Chromium export test.

## Contracts

- `schemas/manifest.schema.json` and `schemas/export.schema.json` are authoritative; `pnpm schemas:generate` regenerates their TypeScript types.
- `schemas/envelope.schema.json` owns the shared header, identity, source, and batch constraints.
- Each bundled `note.schema.json` owns subject-specific constraints and illustrative values; its identity examples can override shared example annotations.
- The schema build combines those definitions with the manifest's key/version into a portable, committed `input.schema.json`.
- The compiler, prompt reference, and TOML skeleton all consume that complete input schema.
- Imported packs supply the complete input schema directly and need no source schema or build step.
- `src/core/banned-text.ts` owns the supported text patterns; the authoring guide displays those same values. Portable JSON schemas repeat the patterns and are checked against this allowlist when loaded.
- `src/runtime/protocol.ts` owns worker requests, stages, and the verified export result shared by the worker and client.

The build regenerates contracts, prepares the runtime, type-checks the UI and worker separately, and bundles the site. Generated files must be committed; CI checks them for drift. Run `pnpm format` / `pnpm format:check` for TypeScript, JSX, styles, scripts, tests, and template/starter HTML and CSS.

Duplicate detection ignores object-property order and preserves array order, including the order of meanings. Tests should check compiled fields, rendered layout, package contents, and user-visible transitions.

## Template authoring page

Edit the guide's prose and tables in `src/docs/template-guide.mdx`. `src/docs/TemplateDocs.tsx` supplies the page layout and navigation. `src/docs/components.tsx` provides copyable code blocks, scrollable tables, section anchors, and the starter ZIP download.

Vite compiles the repository-authored MDX with `@mdx-js/rollup`; `remark-gfm` handles Markdown tables. The plugin is restricted to `src/docs/*.mdx`. The guide reads examples from `examples/vocabulary-starter/` and supported patterns from `src/core/banned-text.ts`.

Install the recommended MDX extension in VS Code for syntax highlighting and language support.

## Russian dictionary data

| Command | Output |
|---|---|
| `pnpm ru-stress:generate [dump.jsonl.gz]` | Compressed stress forms |
| `pnpm ru-aspect:generate [dump.jsonl.gz]` | Compressed aspect rows, `data/ru-aspect.tsv`, and source metadata |
| `pnpm ru-data:generate [dump.jsonl.gz]` | Both dictionaries from one streamed dump pass |

Without a local path, the commands stream the full kaikki.org gzip dump. OpenRussian supplies fallback headwords through its public `words` and `verbs` exports. Wiktionary wins per stressed headword; the generator prints disagreement counts and the first 20 conflicts. Unknown aspect values are counted in the build log and source metadata. Manual rows in `src/validators/ru-aspect/supplement.tsv` override the same stressed headword last.

The complete verb example is a note-level schema `examples` annotation, so its optional fields form a valid combination. The schema composer carries it into `input.schema.json`; the copied prompt still lists every optional field and enum in its field reference.

## Runtime

`runtime.lock.json` pins Pyodide 314.0.7, genanki 0.13.1, every Python dependency, and SHA-256 hashes for the delivered core files and wheels. `scripts/prepare-runtime.mjs` verifies cached assets or downloads the exact missing assets at build time into the ignored `public/runtime/` directory. Vite copies them into `dist/runtime/`.

Browser exports load runtime files from the same site. After Pyodide loads its local micropip and PyYAML wheels, `micropip.install(..., deps=False)` installs the explicit wheel list. Bootstrap checks SQLite availability before loading the adapter. Runtime licenses are included in the deployed assets.

The worker is created only after successful compilation. One worker handles one job at a time, reusing its initialized Python runtime after success. Cancellation or failure destroys the worker; retry initializes a fresh one. Upstream initialization can reject an internal promise without settling the loader, so the worker forwards unhandled rejections to the client as recoverable errors.

Python receives compiled field strings and card templates. Each job creates a temporary directory and temporarily points Python's `tempfile` there because genanki leaves its intermediate SQLite database behind. The adapter verifies the package and cleans temporary files before returning the byte buffer. The worker releases PyProxy objects, and the UI revokes replaced Blob URLs.

## Privacy and appearance

TOML and imported packs stay in memory and disappear on reload. An explicit light/dark preference is stored under `genanki-web:theme`; system mode removes that key. Production builds cache dictionary assets as described in [Template packs](packs.md#validators). Conversion and theme selection remain available when browser storage is restricted.

## Deployment

`.github/workflows/pages.yml` checks generated contracts, types, unit/runtime tests, and production browser flows under the repository subpath before deploying the default branch. In repository **Settings → Pages**, select **GitHub Actions** as the build source. GitHub serves the static files; the browser processes note content.

`VITE_BASE` controls all worker, Python, runtime, and bundled asset URLs. Build metadata is evaluated by Vite once: short Git commit (with `-dirty` for modified local builds), genanki version from the runtime lock, and UTC timestamp. GitHub Actions supplies the actual build commit through `GITHUB_SHA`.

## Device acceptance

Automated checks cover package structure, identity stability, timestamps, and browser behavior. Use an AnkiDroid device to check import/reimport behavior, review-progress preservation, Russian voice playback, and theme inheritance. Anki's import settings, local edits, and note-type compatibility affect updates.

## Desktop Anki fixups

`tools/anki-fixups/` is an independent Python 3.11+ CLI. Follow its [installation and collection workflow](../tools/anki-fixups/README.md) and install `requirements-desktop.txt` to match desktop Anki before opening a collection. Select that virtual environment in VS Code for Python language support.

| Command | Action |
|---|---|
| `python -m pip wheel --no-deps tools/anki-fixups -w _artifacts/anki-fixups/wheels` | Build the CLI |
| `python -m anki_fixups --help` | Run the CLI |
| `python -m pytest tools/anki-fixups/tests` | Test parser, dictionary lookup, label formatting, and migrations on disposable Anki collections |

Python and TypeScript aspect tests share `tests/fixtures/ru-aspect.json`. The Category fixtures contain all distinct values from the inspected desktop vocabulary types. Integration tests export the repository's v4 templates through `src/runtime/adapter.py`, import the APKG with the official Anki library, review a legacy card, and check identities, fields, tags, scheduling, revlog, and grouped undo after migration.

Collection reports and local configuration contain private information. Keep reports under `_artifacts/`; `tools/anki-fixups/config.toml` is ignored. WSL tests use Linux-local copies; live Windows collections require native Windows Python for compatible file locking.
