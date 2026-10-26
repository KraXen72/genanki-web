# Template packs

A pack contains `template.toml`, the manifest's JSON input schema, prompt Markdown, card HTML, and CSS. Bundled and ZIP-imported packs use the same loader. A ZIP can contain these files directly or inside one directory; every member must stay inside that root. Imported packs exist only for the current tab session.

The two bundled directories demonstrate the format. Start with `templates/basic/`, choose a unique stable key and model ID, and define your own subject fields, mappings, prompts, cards, and destination. Ordinary new note types require pack files only. The manifest contract is documented precisely in `schemas/manifest.schema.json`.

## Input schemas

Use JSON Schema draft-07 with these supported keywords:

- Metadata: `$schema`, `title`, `description`, `examples`.
- Structure: `type`, `properties`, `required`, `additionalProperties`, `items`.
- Constraints: `const`, `enum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `minimum`, `maximum`, `dependencies`.
- `pattern` supports only the two audited expressions in `src/core/schema.ts`: safe sources without hierarchy separators, and Russian plain text without em dashes, HTML, Anki expressions, or audio references.

Supported types are object, array, string, integer, number, and boolean. Every object rejects unknown properties, arrays have a bounded `maxItems`, and strings have `maxLength ≤ 4000`. References, remote schemas, compositions, recursive schemas, custom formats, arbitrary regexes, and executable extensions are unsupported. `dependencies` pairs optional fields such as sentence/translation. The schema must require the exact batch header and an array of notes with explicit IDs. The shared envelope independently checks identity and source constraints for every pack.

Supply illustrative values in schema `examples`, not a separate example file. The loader checks that the schema-derived prompt example validates; add examples when a generic placeholder cannot satisfy a constraint. A copied prompt always starts with `prompts/queue.md`, followed by pack instructions, a structural reference, and the schema-generated TOML structure. Packs cannot replace the shared queue protocol.

For bundled packs, edit `note.schema.json` and run `pnpm schemas:generate` to compose the complete input schema from the shared envelope and manifest. ZIP users need only the generated `input.schema.json`, not `note.schema.json`.

## Field mappings

Each ordered `[[fields]]` definition has `name`, `path`, and `format`:

| Format | Behavior |
| --- | --- |
| `text` | Read an object/array path, HTML-escape a scalar, and use an empty string for a missing optional value. |
| `lines` | Apply text mapping and convert newlines to `<br>`. |
| `list` | Read an array and its `item_path`, creating escaped grid items with the field name as their CSS class and a one-based `grid-row`. |

Paths such as `meanings.0.sentence` support own object properties and array indices. Required content is enforced in the schema. Mappings do not evaluate Anki expressions; card HTML is passed unchanged as `qfmt`/`afmt`. No card templates or styles are rendered in the application DOM. A card front must reference populated fields; an export whose generated card count differs from the manifest is rejected.

## Identity and destination

The pack key and explicit note ID determine `genanki.guid_for(pack_key, note_id)`. Content, sources, versions, and deck changes do not enter identity. Exact duplicate IDs/content are removed; conflicting IDs block the batch. Identical content with different IDs produces a warning.

`destination.policy` is either `fixed` or `shared-source`. The latter appends the common nonempty source when all accepted notes share one; otherwise it appends `Mix`. Paths are trimmed and normalized to NFC. Deck IDs use the first 52 bits of SHA-256 over `anki-deck:v1:<normalized full path>` (zero is remapped to one), so IDs are positive and JavaScript-safe. V1 exports exactly one model into one deck; there are no within-package deck-ID collisions to resolve.

Keep model IDs stable for CSS/layout changes. Changing field or card names, order, or count requires an explicit migration decision; a new model must receive a distinct ID. The app rejects an imported pack that reuses an already loaded pack key or model ID. Input contract changes require a new `input_version`; old TOML gets a clear version error rather than being reinterpreted.

## Bounds

| Resource | Limit |
| --- | --- |
| TOML | 4 MiB UTF-8, 2,000 notes |
| Pack ZIP | 2 MiB compressed |
| Expanded pack | 8 MiB, 64 members, 512 KiB per file |
| Input schema | 64 KiB, 512 nodes, 12 levels, 64 enum values |
| Schema arrays/strings | 2,000 items / 4,000 characters |
| Compiled Anki field | 32 KiB UTF-8 |

These are conservative resource guards, not speed or mobile-memory promises. See `docs/verification.md` for the measured environment and the remaining device acceptance checks.
