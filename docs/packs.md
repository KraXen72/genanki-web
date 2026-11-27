# Template packs

For a worked authoring guide and an importable starter ZIP, open **Template docs** in the application footer. The guide and ZIP share their source files in `examples/vocabulary-starter/`.

A pack contains `template.toml`, the manifest's JSON input schema, prompt Markdown, card HTML, and CSS. Bundled and ZIP-imported packs use the same loader.

Start with `templates/basic/` or the downloadable starter. Choose a unique stable key and model ID, then define your fields, mappings, instructions, cards, and destination. The [manifest schema](../schemas/manifest.schema.json) defines the available settings.

A ZIP can contain the pack files directly or inside one directory. Every member must stay inside that root. Imported packs remain available until the tab reloads.

## Input schemas

Use JSON Schema draft-07 with these supported keywords:

- Metadata: `$schema`, `title`, `description`, `examples`.
- Structure: `type`, `properties`, `required`, `additionalProperties`, `items`.
- Constraints: `const`, `enum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `minimum`, `maximum`, `dependencies`.
- `pattern` supports only the two expressions in `src/core/banned-text.ts`: safe sources without hierarchy separators, and plain text without em dashes, HTML, Anki expressions, or audio references.

Supported types are object, array, string, integer, number, and boolean. Each object requires `additionalProperties: false`. Arrays require `maxItems ≤ 2000`, and strings require `maxLength ≤ 4000`.

The schema must require the exact batch header and an array of notes with explicit IDs. The shared envelope checks identity and source constraints for every pack. Use `dependencies` to require related optional fields together, such as sentence/translation.

The loader rejects references, remote schemas, compositions, recursive schemas, custom formats, and arbitrary regexes.

Put illustrative values in schema `examples`. The loader checks that the schema-generated example validates; add examples when a generic placeholder cannot satisfy a constraint.

A copied prompt starts with `prompts/queue.md`, followed by pack instructions, a field reference, and schema-generated TOML. Every pack shares the queue protocol.

For bundled packs, edit `note.schema.json` and run `pnpm schemas:generate` to build the complete input schema from the shared envelope and manifest. Imported ZIPs supply the generated `input.schema.json`.

## Validators

A pack can opt into bundled content checks. Packs that declare none skip this step entirely. Each entry names a validator and the mapped fields it reads; list fields are not supported.

```toml
[[validators]]
name = "ru-stress"
fields = ["Word", "Sentence1"]
```

Validators read the raw input values of their declared Anki fields together for each note. Errors block export, and the error panel lets you copy them for correction in the LLM chat.

Review warnings require **Export anyway** before packaging. Notices report unchecked content and allow export immediately.

`ru-stress` compares stress-marked Russian words with a dictionary of about 540,000 word forms. It skips words without a mark and words with ё. Unexpected stress produces a review warning with accepted spellings. Words missing from the dictionary produce a notice. A spelling with several valid stresses, such as `за́мок` and `замо́к`, accepts all of them.

`ru-aspect` reads `Word`, `Kind`, `Aspect`, `Partner`, and `Motion`. It blocks dictionary aspect conflicts, missing verb aspects, verb-only fields on other kinds, and invalid directions for the 14 unprefixed motion pairs.

It resolves homographs by stress and checks verb-headed phrases through their first token. Either aspect of a biaspectual verb is accepted with a notice. Unknown verbs produce notices. Partner disagreements and verb-like nonverb kinds request review.

```toml
[[validators]]
name = "ru-aspect"
fields = ["Word", "Kind", "Aspect", "Partner", "Motion"]
```

These names refer to Anki mappings whose raw input paths supply the values. Include `Partner` in `ru-stress` to check its stress too. Aspect conflicts and invalid field combinations block export. Stress mismatches, partner disagreements, and heuristic findings request review.

Production builds keep compressed dictionaries in the browser's Cache Storage, keyed by each asset's complete content-hashed URL. Repeat visits reuse those bytes. A changed URL downloads a new asset. Development builds fetch directly because their asset URLs stay constant.

Storage restrictions or quota failures fall back to normal downloads. Clearing site data or browser eviction removes cached assets. The cache contains dictionary assets; note input stays in memory.

Rebuild aspect data with `pnpm ru-aspect:generate`, or both dictionaries with `pnpm ru-data:generate` in one Wiktionary pass. Pass an existing gzip dump path to reuse a download. `src/validators/ru-aspect/supplement.tsv` overrides matching stressed headwords last. `data/ru-aspect.tsv` is the uncompressed dictionary for the separate Anki fixup scripts. Source dates and extraction counts are recorded in `data/ru-aspect.sources.json`.

To add a word or a valid variant, edit `src/validators/ru-stress/supplement.txt` and run `pnpm ru-stress:generate`. To add a validator, add a module in `src/validators/`, register it in `src/validators/index.ts`, and add its name to `schemas/manifest.schema.json`.

## Field mappings

Each ordered `[[fields]]` definition has `name`, `path`, and `format`:

| Format | Behavior |
| --- | --- |
| `text` | Read an object/array path, HTML-escape a scalar, and use an empty string for a missing optional value. |
| `lines` | Apply text mapping and convert newlines to `<br>`. |
| `list` | Read an array and its `item_path`, creating escaped grid items with the field name as their CSS class and a one-based `grid-row`. |
| `label` | Map a string enum through `[fields.labels]`, then HTML-escape the display label. Missing optional values leave the field empty. |

Paths such as `meanings.0.sentence` support own object properties and array indices. The schema enforces required content. Card HTML passes unchanged to Anki as `qfmt`/`afmt`; the application keeps card templates and styles outside its DOM. A card front must reference populated fields. An export whose generated card count differs from the manifest is rejected.

A `label` mapping requires a `labels` table with exactly one entry per value in the input property's string enum, up to 64 values. The pack author defines this table in `template.toml`. The LLM writes enum slugs, and the compiler expands them into display labels. Other formats reject a `labels` table.

```toml
[[fields]]
name = "Kind"
path = "kind"
format = "label"
[fields.labels]
slov = "sloveso"
"pod.m:ž" = "podst. meno, ženský rod"
```

## Tags

Each `[[tags]]` maps a raw input string into `<prefix>::<value>`:

```toml
[[tags]]
prefix = "genanki"
path = "kind"
```

For `kind = "pod.m:ž"`, the stored tag is `genanki::pod.m:ž`. Missing optional values produce no tag. Prefixes and values must contain no whitespace; values must be nonempty strings. Anki reimports can replace existing tags, including tags added by hand. Review tags after updating notes.

## Identity and destination

The pack key and explicit note ID determine `genanki.guid_for(pack_key, note_id)`. Keep those values stable across corrections, source changes, and deck changes.

The compiler removes repeated notes with identical IDs, sources, and content. Conflicting source or content under the same ID blocks the batch. Identical content with different IDs produces a warning.

`destination.policy` is either `fixed` or `shared-source`. The latter appends the common nonempty source when all accepted notes share one; otherwise it appends `Mix`. Paths are trimmed and normalized to NFC. Each export contains one model and one deck.

Deck IDs use the first 52 bits of SHA-256 over `anki-deck:v1:<normalized full path>`. Zero is remapped to one, giving a positive JavaScript-safe ID.

Keep model IDs stable for CSS/layout changes. Changing field or card names, order, or count requires a migration decision; a new model must receive a distinct ID. The app rejects an imported pack that reuses an already loaded pack key or model ID.

Input contract changes require a new `input_version`. TOML must use that exact `template_version`; other versions receive a version error.

## Bounds

| Resource | Limit |
| --- | --- |
| TOML | 4 MiB UTF-8, 2,000 notes |
| Pack ZIP | 2 MiB compressed |
| Expanded pack | 8 MiB, 64 members, 512 KiB per file |
| Input schema | 64 KiB, 512 nodes, 12 levels, 64 enum values |
| Schema arrays/strings | 2,000 items / 4,000 characters |
| Compiled Anki field | 32 KiB UTF-8 |

These limits bound input and output sizes. See [Verification](verification.md) for recorded measurements and AnkiDroid device checks.
