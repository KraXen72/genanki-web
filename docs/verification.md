# Verification

The automated suite exercises both bundled packs, complete TOML validation, generated prompts, exact Russian field/card order, 1–3 meanings, optional pairs, Unicode, escaping, source selection, duplicate IDs/content, and imported ZIP/schema bounds. Runtime tests execute the real pinned Pyodide/genanki adapter, including a maximum-size note batch, repeated exports, verification failure, and temporary-file cleanup.

Browser tests run Chromium and Firefox against the production site under `/genanki-web/`, including actual APKG downloads and independent Python stdlib ZIP/SQLite inspection. The same-ID correction changes stored fields while preserving the GUID. Covered UI flows include clipboard success/failure, plain file input, pasted fences, ZIP pack import, no card rendering, cancellation/retry, missing runtime assets, appearance persistence, reload reset, build metadata, narrow layouts, input/footer alignment, and the shared queue dialog. Request monitoring includes worker requests and rejects any external request during export.

## Initial measurements

Measured locally on 2026-10-26 with Node 24 and Pyodide 314.0.7:

| Measurement | Result |
| --- | --- |
| Runtime core + pinned wheels, uncompressed | 13,811,058 bytes (13.17 MiB) |
| Same files individually gzip-compressed | 6,661,194 bytes (6.35 MiB) |
| Representative maximum batch | 2,000 Russian notes / 4,000 cards |
| Resulting APKG | 1,183,962 bytes |
| Warm packaging + SQLite/ZIP verification | 159 ms |
| Whole Node test-process resident memory | 242,155,520 bytes (231 MiB) |

The gzip total is an asset-size calculation, not a promise about a host's transfer encoding. Node RSS includes JavaScript, WASM, and test overhead; it is not an isolated browser or mobile-memory measurement. Browser cold export tests typically completed within a few seconds over localhost; network speed and device capability vary. No application runtime requests go to a CDN or PyPI.

Reproduce the batch measurement with `MEASURE_RUNTIME=1 pnpm exec vitest run tests/runtime.test.ts`; results are written to `/tmp/genanki-runtime-metrics.json`. The 2,000-note, 4-MiB-input, and 32-KiB-field bounds protect memory without claiming support for arbitrary maximum-length content on every device.

## Outstanding external acceptance

No AnkiDroid device was available in this environment. Import/update behavior and preservation of review progress, actual native Russian TTS playback, and card theme inheritance require on-device testing. The automated suite verifies the structures and stable identities that support those features, without claiming that package inspection proves Anki's import decisions.

The GitHub Actions workflow is configured for static Pages deployment; a live deployment requires repository Pages settings and a successful remote workflow run.
