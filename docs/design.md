# Browser-based Anki package builder

Proposed architecture, researched on 2026-10-26. This is a specification, not an implementation.

The app is a static SolidJS site deployed to GitHub Pages. All user-data processing runs locally in JavaScript or Python through Pyodide/WASM. There is no backend, server-side Python, hosted database, AI API integration, or server upload. GitHub Actions builds and deploys static files only.

**Product boundary**

The LLM produces linguistic or subject-specific content as TOML. The app validates that content, maps it into Anki fields, applies reusable card templates, and produces a downloadable `.apkg`.

The app is generic. Russian vocabulary is the first bundled template pack, not a special case in the exporter. Each pack describes one Anki note type, which may generate multiple cards per note. Additional packs can be committed to the repo or imported locally as ZIP files. Routine use of a bundled pack requires only the LLM's TOML.

Built-in and imported packs use the same format and loading pipeline. Importing a pack reads a local file into memory; it does not publish it or modify the repository. The app is stateless across reloads: no IndexedDB, localStorage, accounts, or saved input history. A bundled pack plus the supplied TOML is sufficient for routine use; a manually imported pack must be selected again after reloading.

**Research and feasibility**

- Installed upstream `genanki==0.13.1` successfully in an isolated native Python environment.
- Executed the same smoke test in Pyodide `314.0.7`, running Python 3.14.2/WASM under Node.js.
- Both generated one note and two cards with the specified 11-field order, Russian stress marks, optional empty sentence pairs, and TTS expressions in the templates.
- Both passed ZIP integrity and SQLite `PRAGMA integrity_check`, and database checks for field order, note/card counts, and the stored GUID.
- A content edit preserved the explicitly derived GUID. This checks identity generation, not Anki's reimport behavior.
- In this Pyodide release, `sqlite3` is already importable. Explicitly loading a package named `sqlite3` fails because that name is absent from its package index. Load `micropip` and `pyyaml`; check SQLite availability as part of the runtime smoke test.
- These tests do not establish browser CORS/worker behavior, visual accuracy, or actual AnkiDroid import/update behavior. Those are milestone-one acceptance tests.

Pyodide documents both [static deployment, including GitHub Pages](https://pyodide.org/en/stable/usage/downloading-and-deploying.html) and [module workers](https://pyodide.org/en/stable/usage/webworker.html). Upstream [genanki](https://github.com/kerrickstaley/genanki) already supplies the package writer; we do not need to implement the Anki database schema.

The prior discussion in `_artifacts/ChatGPT-Install_Genanki_Status.md` motivates the split between LLM content and deterministic packaging. Its repeated references to 12 Russian fields are a counting error: the requested list has 11 fields.

**Stack**

| Concern | Proposed choice |
| --- | --- |
| UI | Existing SolidJS, TypeScript, Vite, pnpm setup |
| Styling | Existing Tailwind/DaisyUI setup and Flexoki palette |
| TOML | `smol-toml` |
| Data contracts | JSON Schema draft-07, validated with Ajv |
| TypeScript types | Generated from the authoritative schemas, not separately maintained |
| Field mapping | Input paths and small declarative formatting operations |
| Pack ZIP import | `fflate` |
| Export runtime | Pyodide in a dedicated module Web Worker |
| Package writer | Upstream Python `genanki`, initially 0.13.1 |
| Checks | Vitest for compiler logic; Python stdlib checks for package contents; Playwright for browser flow |
| Hosting | GitHub Pages, deployed by GitHub Actions |

[smol-toml](https://github.com/squirrelchat/smol-toml) parses TOML into ordinary JavaScript data. [Ajv](https://ajv.js.org/json-schema.html) validates those values against portable schemas that can also be distributed with template packs.

Prefer this stack to introducing SolidStart, routing, a state framework, or a second database library. Keep the current project's dependencies unless implementation identifies a concrete reason to change them.

**Processing pipeline**

```text
Bundled pack / locally imported pack
                  +
           LLM-generated TOML
                  ↓
JavaScript: parse → validate → resolve IDs/deck → compile Anki fields
                  ↓
        Module Web Worker
        Pyodide → genanki
                  ↓
        Validate ZIP/SQLite
                  ↓
        .apkg ArrayBuffer
                  ↓
          Local download
```

The JavaScript compiler owns pack resolution, validation, field formatting, and deck selection. The Python adapter only constructs `genanki.Model`, `Deck`, `Note`, and `Package` objects from a small validated export payload. Field order comes from the pack's ordered field definitions.

Keep a single export operation boundary so changing the package writer later is possible. Do not implement or load a second writer yet.

**Template pack format**

A pack is a directory in the repo, or a ZIP containing that same directory's contents:

```text
prompts/queue.md                 # shared by every template; outside the packs
templates/russian-vocabulary/
  template.toml
  input.schema.json
  cards/
    forward.html
    reverse.html
    answer.html
  style.css
  prompt.md
```

The manifest specifies:

- Pack format version, stable pack key, input schema version, and display name.
- Stable numeric Anki model ID and note-type name.
- An ordered list of Anki fields, with input paths and any formatting operations needed to populate them.
- Ordered card definitions with names and front/back template files. Both Russian backs reference the same answer file.
- Shared CSS. Multiple card definitions may reference the same answer file.
- A destination policy, initially either a fixed deck or a base deck with the shared-source/`Mix` rule.
- Paths to the input schema and template-specific LLM instructions.

The files in `cards/` are the actual Anki card templates, written in HTML with Anki's native field replacements, conditionals, and filters. They are not generated card instances or a second set of layouts. The `.html` extension describes their contents; the app passes their text to genanki as `qfmt` and `afmt`. Anki renders them after import. Use `.css` for shared styling. Do not introduce `.mustache` files or a Mustache rendering dependency. See [Anki's template documentation](https://docs.ankiweb.net/templates/intro.html).

Input paths support object keys and array indices, such as `meanings.0.sentence`. Missing optional paths produce empty fields; required values are enforced by the schema. Simple declarative mapping operations escape text, convert newlines to `<br>`, and format lists into indexed HTML elements for paired meanings. These populate note fields; they do not render Anki card templates. Keep this mapping vocabulary small and define its concrete shape during implementation, rather than adding a second template language. Do not double-escape compiled fields in Python.

The app does not interpret Anki expressions such as `{{Word}}`, `{{#Sentence1}}`, or `{{tts ru_RU:Word}}`. It packages them unchanged. There is no custom Anki renderer or partial syntax.

For v1, uploaded packs are declarative: no Python modules, JavaScript execution, remote schema references, or downloaded plugins. Use a documented JSON Schema subset and bounds on pack size, expanded ZIP size, schema complexity, note count, and field sizes. Resolve ZIP members within the pack root.

Adding a normal note type should require pack files only. Unusual behaviors outside the supported mapping and Anki template syntax may require an explicit engine enhancement; avoid inventing a general-purpose programming language for packs.

**TOML input contract**

Use one pack per batch initially. Pack selection can be automatic from the header, with a template picker for discovering packs and obtaining instructions.

```toml
format_version = 1
template = "russian-vocabulary"
template_version = 1

[[notes]]
id = "ru:книга:general"
source = "Lesson 1"

category = "podstatné meno; ženský rod"
word = "кни́га"

[[notes.meanings]]
sk = "kniha"
en = "book"
sentence = "Э́то моя́ кни́га."
translation = "Toto je moja kniha."
```

The generic header identifies the batch format and exact template input version. Each pack supplies the schema for its complete TOML document, reusing the shared header and note-identity definitions. Subject-specific fields live directly on each note: Russian vocabulary uses `word`, `category`, and `meanings`; another pack might use `question` and `answer`. There is no generic Anki-field dump or unnecessary `data` wrapper. Reject unknown properties, wrong types, unsupported versions, and missing templates with useful error paths. Do not silently coerce types or discard invalid notes.

`template_version` identifies an input contract, not a transient pack release. The copy button always uses the selected pack's current contract. Styling changes need not change it. An older version must either remain explicitly supported or produce a clear version error; do not reinterpret old input as the newest schema.

Each Russian meaning contains its Slovak meaning, English gloss, Russian sentence, and Slovak translation together. Require one to three meaning objects. This makes their correspondence structural, instead of depending on parallel lists and numbered fields in LLM output.

Category text is Slovak so it can appear on the reverse question without revealing Russian or English. The prompt explains the expected grammatical information. Input strings contain content only: no Anki template syntax, HTML formatting, or audio references for this pack.

**Copyable LLM instructions**

The template picker has a **Copy LLM prompt** button. It concatenates one self-contained text chunk in this order:

1. Shared instructions from `prompts/queue.md`, bundled in the repo and deployed site. This document owns the queue protocol, source/context retention, flush commands, retry behavior, immutable-ID handling, and output instructions for all templates.
2. The selected pack's `prompt.md`, containing only template-specific content rules, such as the Russian linguistic requirements and identity conventions for homographs.
3. The selected template key/version and schema-derived field reference, including required/optional fields, types, enums, cardinality, and TOML formatting guidance.
4. A TOML skeleton generated from the selected pack's current input schema, appended at the very end as a TOML code block. Include the exact header, fields, and comments explaining required values and how to repeat notes or nested arrays. There is no separately maintained `example.toml` file.

Queue rules are maintained once in the shared Markdown document. Packs do not duplicate or override them, including manually imported packs. The shared flush instructions require the full pending batch in one TOML code block, without HTML, CSS, Anki syntax, or dependency-installation steps. The appended TOML structure is specific to the selected template.

The chunk must be usable by an ordinary text-only LLM. It cannot depend on browsing a link, fetching a schema, accessing the repo, running a shell, installing packages, checking a clock, or creating an attachment. The human copies the emitted TOML into the site or saves it as a local file to import. A single outer TOML code fence can be unwrapped on paste; file inputs contain plain TOML.

The schema is the authority for the input shape. Generate both the structural reference and appended TOML skeleton from it. Any illustrative values belong in the schema's `examples` annotations. Verify that generated TOML parses and that any populated example satisfies the schema; placeholder skeletons are instructions, not real notes. Do not maintain a second handwritten field specification or example file. The shared `prompts/queue.md` supplies queue behavior, the pack's `prompt.md` supplies subject-specific instructions, and the assembler appends the current TOML structure last.

Queue ownership stays with the LLM conversation. After flush, the emitted batch remains pending until the user confirms successful export/import; a failed conversion must not lose queued entries. Retrying emits the same IDs. The website does not synchronize or manage the conversation's queue.

The LLM never needs to produce field arrays, model/deck IDs, templates, SQL, Python, or an APKG. The app starts with completed TOML.

**Choice of input format**

Keep TOML for v1. Its named fields and arrays of tables fit small batches of human-readable text, and it avoids JSON's punctuation noise and escaping of ordinary quotation marks when literal strings are appropriate. Standardize skeleton formatting and explain string quoting in the copied prompt. TOML is not inherently more reliable for an LLM than JSON: nested table ownership and string escaping still require care. Validation errors should identify the affected note and field so the user can repair the text or ask the same LLM to correct it.

Prefer JSON if deeply nested structures become common or machine-to-machine structured output becomes the main workflow. Neither assumption applies to the initial text-only LLM workflow. Supporting multiple import formats is unnecessary for v1.

**Russian pack behavior**

Preserve this exact field order:

```text
ID, Category, Word, SlovakMeaning1, EnglishGloss1,
SlovakMeaning2, EnglishGloss2, SlovakMeaning3, EnglishGloss3,
Sentence1, Translation1, Sentence2, Translation2,
Sentence3, Translation3
```

- Generate one note and exactly two cards per accepted entry.
- Russian → Slovak question: category, Russian dictionary form, divider, Russian examples. Include native Russian TTS beside each displayed Russian word/example.
- Slovak → Russian question: category, Slovak meanings, divider, Slovak example translations. Include no Russian, English glosses, or TTS.
- Both answers: category, Russian dictionary form and TTS, paired Slovak/English meanings in a left-aligned CSS Grid, then matched Russian/Slovak example blocks with TTS on Russian sentences.
- Both backs use the complete answer template directly, without `{{FrontSide}}`.
- Meaning fields use plain text mappings; all layout HTML lives in the card templates. Each conditional Slovak/English pair occupies one grid row. The reverse question displays only the Slovak fields. No card JavaScript is necessary for alignment.
- The output uses the new `Russian vocabulary v3` model (ID `1759797713`), leaving existing v1 and v2 note types unchanged. The TOML input contract remains version 1; no existing-note migration is included.
- Empty optional sentence pairs remain empty. Each optional example's entire divider/content/translation block is inside its `SentenceN` conditional.
- Escape Russian input as text; preserve combining stress marks and ё. Use upright, ordinary print fonts, no italics or transliteration.
- The card stylesheet does not set primary foreground/background colors on `.card` or `body`. Secondary text may use `#777`. The web application's own Flexoki theme is separate from exported card CSS.
- Use `{{tts ru_RU:Word}}` and matching sentence expressions without device-specific voice names. Do not synthesize or embed audio.

The documented native TTS syntax requires [AnkiDroid 2.17+](https://docs.ankiweb.net/templates/fields.html#text-to-speech-for-individual-fields) and an available Russian TTS voice. The web app cannot bundle or inspect the user's Android voice installation. Actual playback is tested in AnkiDroid.

Validate structural requirements and explicit formatting constraints, such as the maximum number of meanings and the absence of em dashes. Trust the LLM for translation, grammar, natural examples, dictionary forms, and stress placement. Do not add linguistic scoring, heuristic stress warnings, or a review workflow.

**Identity, deduplication, and deck selection**

- Preserve an explicit note ID across content corrections. Do not hash translations, examples, spelling with stress marks, or source names to determine note identity.
- Derive GUIDs with `genanki.guid_for(stable_pack_key, note_id)`. Pack releases and source/deck changes do not enter that calculation.
- Use IDs identifying a word/expression entry; ordinary multiple meanings stay in its one note. Separate homographs or deliberately separate entries need explicit disambiguating IDs. The LLM prompt documents this convention, but an app cannot guarantee the LLM will reuse an earlier ID it has never seen.
- Deduplicate repeated identical IDs/content within a batch. Block conflicting entries with the same ID; report the conflict instead of picking one silently. Suspected duplicates with different IDs can be warnings, not automatic linguistic merges.
- Generate the pack's model ID once and commit it. CSS or layout changes retain the model ID. Changing field or card names/order/count requires a migration decision and must not silently pretend to be a compatible update.
- Resolve the Russian destination to `Ruština::Vocabulary::<source>` only when every accepted note has the same nonempty source; otherwise use `Ruština::Vocabulary::Mix`. Missing source counts as unknown. Reject source names that accidentally create extra `::` hierarchy levels.
- Derive a positive, JavaScript-safe numeric deck ID from a versioned hash of the exact normalized full deck path. Use the same rule in every export, and reject collisions detected within a package. Explicit IDs can be supported for adopting existing decks.
- Give notes an export-time modification timestamp so later exports can be recognized as updates. Field content, layout, identities, and destination are deterministic for a given pack and TOML. Output bytes can differ because export/ZIP timestamps are metadata. Byte-for-byte reproducibility would require an explicit timestamp policy and is not a v1 requirement.

[Anki package updates depend on modification times and import options](https://docs.ankiweb.net/importing/packaged-decks.html). [Field and card-template compatibility also matters](https://faqs.ankiweb.net/some-updates-were-ignored-because-the-note-type-has-changed.html). Stable IDs enable repeated imports, but do not guarantee overwriting local edits or moving existing cards to a newly selected deck.

To update notes created by an earlier LLM-generated package, we would need its original model ID, GUID convention, field layout, and deck IDs. New stable IDs cannot retroactively match arbitrary earlier ones. Adopting an existing package is separate from ordinary TOML conversion.

**Runtime and deployment**

Load Pyodide lazily when a batch is ready, keeping the initial UI lightweight. Run one export at a time in a module worker. Show initialization, compilation, packaging, and verification states. Cancel by terminating/recreating the worker; do not require shared memory or special cross-origin-isolation headers.

Pin the tested Pyodide release and the complete Python dependency set, including wheel hashes. Keep the runtime asset manifest/lock and build scripts in the repo. At build time, assemble only the required Pyodide core files and pinned compatible wheels into `dist/runtime/`; serve all of them from GitHub Pages. Python package resolution must not depend on PyPI or a CDN at application runtime. Dependencies are installed from those local static assets. Include license notices.

Template directories and their supporting assets live in the repo. A normal export needs no external template, stylesheet, script, schema, or audio download. This does not imply a first-ever offline visit works; offline site caching is a later feature.

The worker writes into Pyodide's virtual filesystem, exports the package, verifies it, and transfers a byte buffer to the UI. The UI downloads it through a Blob URL. Clean virtual files after every job, including genanki's intermediate SQLite files, and release proxy objects/buffers to avoid accumulating memory over repeated exports.

Use Vite's configured base URL for workers, template assets, Python modules, and runtime files. Test under a repository subpath, not only `/`. Follow [Vite's GitHub Pages deployment guidance](https://vite.dev/guide/static-deploy). No server rewrites or application routes are needed for the initial single-page workflow.

**UI**

Keep two short flows:

1. Choose a bundled template or import a template ZIP → click **Copy LLM prompt** → paste the one text chunk into the LLM conversation.
2. Paste/upload the returned TOML → validate and generate → download `.apkg`.

Display validation errors, resolved destination, and note/card counts. Keep input in memory during the current page session so errors can be corrected and downloads retried. A reload starts fresh. Do not store input or imported packs persistently.

There is no card preview, HTML renderer, iframe, browser TTS, linguistic review screen, or template editor. HTML/CSS files are compiled and packaged without rendering them in the app DOM. The user checks the resulting cards in AnkiDroid.

**Implementation milestones and acceptance**

1. Prove the static browser export path with a minimal custom note type, two cards, and pinned self-hosted runtime assets. Test in Chromium and Firefox. Import into AnkiDroid, edit content without changing identity, export again, and verify that reimport updates the same notes while preserving review progress. Check native TTS and theme inheritance on-device.
2. Add the generic pack manifest, schema validation, TOML envelope, field compiler, and Russian pack. Check one/two/three meanings, missing optional examples, escaped text, Unicode, shared/mixed/unknown sources, duplicate IDs, conflicting IDs, and exact field/card order. Inspect generated ZIP/SQLite independently of the UI.
3. Add the Solid template picker, one-click prompt assembly/copy, TOML paste/upload, download, and ZIP pack import. Add a second simple pack to prove each has its own content instructions/schema and requires no exporter changes. Check every copied prompt uses the same shared queue document, matches the selected schema version, is self-contained, and ends with that template's TOML structure. Never render pack HTML/CSS in the app DOM.
4. Deploy through GitHub Actions. Test actual repository-subpath asset loading, repeated exports and cleanup, recoverable failures, download handling, and absence of user-content requests to external services. Measure cold-start transfer size and memory before setting batch limits or making performance promises.

Exclude persistent storage, card previews, and linguistic review from v1. Defer a visual template editor, AI calls, accounts/sync, arbitrary uploaded executable code, a second APKG writer, app-side raw-vocabulary queueing, media upload, cloze, TSV export, and APKG import/migration until there is a concrete need. Neither a handcrafted SQLite fallback nor an automatic switch to genanki-js is needed for v1; a runtime failure should preserve input and show a useful retryable error.
