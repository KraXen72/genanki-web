# Development

Use Node 24, pnpm 10.34.9, and Python 3.11+ (for independent package inspection in browser tests).

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

The build regenerates contracts, prepares the runtime, type-checks the UI and worker separately, and bundles the site. Generated files must be committed; CI checks them for drift. Run `pnpm format` / `pnpm format:check` for TypeScript, JSX, styles, scripts, and tests.

## Runtime

`runtime.lock.json` pins Pyodide 314.0.7, genanki 0.13.1, every Python dependency, and SHA-256 hashes for the delivered core files and wheels. `scripts/prepare-runtime.mjs` verifies cached assets or downloads the exact missing assets at build time into the ignored `public/runtime/` directory. Vite copies them into `dist/runtime/`.

Browser exports use only these same-origin files; neither PyPI nor a CDN resolves packages at runtime. `micropip.install(..., deps=False)` installs the explicit wheel list after Pyodide loads its local micropip and PyYAML wheels. SQLite availability is checked before the adapter loads. Runtime licenses are included in the deployed assets.

The worker is created only after successful compilation. One worker handles one job at a time, reusing its initialized Python runtime after success. Cancellation or failure destroys the worker; retry initializes a fresh one. Upstream initialization can reject an internal promise without settling the loader, so the worker forwards unhandled rejections to the client as recoverable errors.

Python receives ordered strings and upstream card templates; it does not format content or render HTML. Each job creates a temporary directory and temporarily points Python's `tempfile` there because genanki leaves its intermediate SQLite database behind. Verification and all cleanup happen before the byte buffer reaches the UI. PyProxy objects and replaced Blob URLs are explicitly released.

## Privacy and appearance

TOML and imported packs are held in memory and disappear on reload. Only an explicit light/dark preference is stored under `genanki-web:theme`; system mode removes that key. Browser storage failure does not prevent conversion or theme selection. Appearance persistence is an explicit UI addition to the original stateless design; user content is never stored.

## Deployment

`.github/workflows/pages.yml` verifies contracts, types, compiler/runtime tests, and production browser flows under the repository subpath before uploading static files and deploying the default branch. In repository Settings → Pages, select **GitHub Actions** as the build source. This repository does not configure a backend or send content to GitHub.

`VITE_BASE` controls all worker, Python, runtime, and bundled asset URLs. Build metadata is evaluated by Vite once: short Git commit (with `-dirty` for modified local builds), genanki version from the runtime lock, and UTC timestamp. GitHub Actions supplies the actual build commit through `GITHUB_SHA`.

## Device acceptance

Automated checks establish package structure, identity stability, timestamps, and browser behavior. An actual AnkiDroid device is still required to confirm import/update behavior, review-progress preservation, Russian voice playback, and theme inheritance. Stable GUIDs alone do not guarantee that import options overwrite local edits or move existing cards.
