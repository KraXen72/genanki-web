# Verification

## Automated coverage

The unit tests cover:

- Both bundled packs, TOML schemas, generated prompts, explicit IDs, duplicate handling, and destination selection.
- Russian v4 field/card order, kind labels, tags, one to three meanings, optional sentence/translation pairs, Unicode, and escaping.
- Stress checks and aspect cases: stressed homographs, biaspectual verbs, verb phrases, partner disagreements, unknown words, all 14 motion pairs, and multiple blocking errors.
- Dictionary extraction, source precedence, supplements, and matching TSV/zstd data.
- Imported ZIP paths, schema restrictions, resource limits, and the downloadable starter pack.
- Real Pyodide/`genanki` exports, stored tags, repeated exports, verification failures, and temporary-file cleanup.

Browser tests cover Chromium and Firefox, including production builds under `/genanki-web/`. They download APKGs and inspect ZIP/SQLite data through `tests/inspect_package.py`. A correction with the same note ID changes stored fields while preserving the GUID.

UI cases include clipboard fallbacks, file input, pasted fences, ZIP imports, cancellation/retry, missing runtime files, theme preferences, reload reset, build metadata, narrow layouts, footer alignment, and the shared queue dialog. Request monitoring includes worker requests and rejects external requests during export.

Desktop migration coverage is described in the [fixup CLI guide](../tools/anki-fixups/README.md).

## Initial measurements

The following results were recorded on 2026-10-26 with Node 24 and Pyodide 314.0.7:

| Measurement | Result |
| --- | --- |
| Runtime core + pinned wheels, uncompressed | 13,811,058 bytes (13.17 MiB) |
| Same files individually gzip-compressed | 6,661,194 bytes (6.35 MiB) |
| Representative maximum batch | 2,000 Russian notes / 4,000 cards |
| Resulting APKG | 1,183,962 bytes |
| Warm packaging + SQLite/ZIP verification | 159 ms |
| Whole Node test-process resident memory | 242,155,520 bytes (231 MiB) |

These measurements describe the initial implementation. Measure the current build and target device before using them to choose batch sizes.

The gzip total sums separately compressed assets. Actual transfer size depends on the host's compression settings. Process memory includes JavaScript, WASM, and test overhead.

Run `pnpm runtime:prepare`, then `MEASURE_RUNTIME=1 pnpm exec vitest run tests/runtime.test.ts` to measure the batch on current code. It writes `/tmp/genanki-runtime-metrics.json`.

## AnkiDroid and deployment checks

AnkiDroid device checks remain: import/reimport behavior, review-progress preservation, Russian TTS playback, and card theme inheritance. Import settings, local edits, and note-type compatibility affect updates.

The GitHub Actions workflow configures static Pages deployment. Publishing requires repository Pages settings and a successful remote workflow run.
