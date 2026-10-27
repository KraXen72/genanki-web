import { createSignal, For, type JSX } from 'solid-js';
import { ThemePicker } from '../components/ThemePicker';
import { starterFiles, starterZip } from './starter';

const sections = [
  ['quick-start', 'Quick start'],
  ['manifest', 'Manifest'],
  ['schema', 'Input schema'],
  ['fields', 'Field mappings'],
  ['cards', 'Cards & styling'],
  ['prompt', 'LLM instructions'],
  ['identity', 'IDs & versions'],
  ['limits', 'Limits'],
];

function Section(props: { id: string; title: string; children: JSX.Element }) {
  return (
    <section id={props.id} aria-labelledby={`${props.id}-title`}>
      <h2 id={`${props.id}-title`}>
        <a href={`#${props.id}`}>{props.title}</a>
      </h2>
      {props.children}
    </section>
  );
}

function Code(props: { name: string; children: string }) {
  const [status, setStatus] = createSignal('');
  let code!: HTMLElement;

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.children);
      setStatus('Copied');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setStatus('Select and copy the code');
    }
  }

  return (
    <figure class="docs-code">
      <figcaption>
        <span class="min-w-0 break-words font-mono text-sm">{props.name}</span>
        <button
          class="btn btn-ghost btn-sm shrink-0"
          onClick={copy}
          aria-label={`Copy ${props.name}`}
        >
          <span class="iconify lucide--copy size-4" aria-hidden="true" />
          Copy
        </button>
      </figcaption>
      <pre tabIndex={0} aria-label={props.name}>
        <code ref={code}>{props.children.trimEnd()}</code>
      </pre>
      <span class="sr-only" role="status">
        {status()}
      </span>
    </figure>
  );
}

function Reference(props: { label: string; rows: string[][] }) {
  return (
    <div class="docs-table" tabIndex={0} role="region" aria-label={props.label}>
      <table class="table">
        <thead>
          <tr>
            <th>Option</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {([option, meaning]) => (
              <tr>
                <td>
                  <code>{option}</code>
                </td>
                <td>{meaning}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

/** One-page authoring guide for the supported v1 pack contract. */
export function TemplateDocs() {
  const [downloadError, setDownloadError] = createSignal('');

  function downloadStarter() {
    try {
      const url = URL.createObjectURL(new Blob([starterZip()], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'vocabulary-starter.zip';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Allow the browser to begin reading the download before releasing its URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadError('');
    } catch {
      setDownloadError('Could not download the starter. Copy the files below instead.');
    }
  }

  return (
    <>
      <a class="docs-skip" href="#quick-start">
        Skip to documentation
      </a>
      <main class="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-14">
        <header class="mb-10">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <a
              class="text-2xl font-medium tracking-[-0.055em] sm:text-3xl"
              href={import.meta.env.BASE_URL}
            >
              <span class="text-primary">genanki</span> web
            </a>
            <ThemePicker />
          </div>
          <p class="mt-8 font-mono text-sm text-primary">Template pack format v1</p>
          <h1 class="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">
            Make your own template
          </h1>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-base-content/80">
            A template pack defines what an LLM writes and how that becomes Anki cards. It is a
            folder of TOML, JSON, Markdown, HTML, and CSS. No app code required.
          </p>
        </header>
        <div class="grid items-start gap-9 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12">
          <nav class="md:sticky md:top-6" aria-label="On this page">
            <p class="mb-3 text-sm font-medium text-base-content/65">On this page</p>
            <ul class="flex flex-wrap gap-x-5 gap-y-2 md:flex-col">
              <For each={sections}>
                {([id, title]) => (
                  <li>
                    <a class="link link-hover text-sm" href={`#${id}`}>
                      {title}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </nav>
          <article class="docs-content min-w-0">
            <Section id="quick-start" title="Start with a working pack">
              <p>
                Download this two-way vocabulary template. Unzip it, edit the files, then ZIP the
                folder again and choose <strong>Import template ZIP</strong> in the app. Files may
                sit at the ZIP root or inside one folder. Imports last until the tab is reloaded.
              </p>
              <button class="btn btn-primary my-4" onClick={downloadStarter}>
                <span class="iconify lucide--download size-5" aria-hidden="true" />
                Download starter ZIP
              </button>
              <p role="status" class="text-error">
                {downloadError()}
              </p>
              <p>
                Import the unchanged starter first and paste <code>sample.toml</code> to try it: two
                notes produce four cards in <code>Languages::Vocabulary::Lesson 1</code>. Before
                making your own template, give it a unique <code>key</code> and{' '}
                <code>model.id</code>. Update the schema header and sample to match the new key.
              </p>
              <Reference
                label="Pack files"
                rows={[
                  ['template.toml', 'Required. Names the pack and connects all its files.'],
                  [
                    'input.schema.json',
                    'Required. Describes the accepted TOML data and example values.',
                  ],
                  ['prompt.md', 'Required. Instructions for the LLM.'],
                  ['cards/*.html', 'Required. Front and back files named in the manifest.'],
                  ['style.css', 'Required. CSS for the exported Anki cards.'],
                  ['sample.toml', 'Optional. A completed batch to test your template.'],
                ]}
              />
              <Code name="sample.toml">{starterFiles['sample.toml']}</Code>
            </Section>

            <Section id="manifest" title="Connect the files">
              <p>
                All top-level options below are required. Paths are relative to{' '}
                <code>template.toml</code>.
              </p>
              <Code name="template.toml">{starterFiles['template.toml']}</Code>
              <Reference
                label="Manifest options"
                rows={[
                  ['format_version', 'Pack format version. Must be 1.'],
                  [
                    'key',
                    'Stable identifier: a lowercase letter, then lowercase letters, digits, or hyphens; at most 64 characters.',
                  ],
                  [
                    'input_version',
                    'Positive integer identifying your input contract. Start at 1.',
                  ],
                  ['name', 'Display name in the template picker.'],
                  [
                    'schema / prompt / css',
                    'Paths to the input schema, instructions, and card stylesheet.',
                  ],
                  [
                    'model.id',
                    'Unique positive integer, at most 9007199254740991. Identifies the Anki note type. Choose your own once.',
                  ],
                  ['model.name', 'Name of the note type in Anki.'],
                  [
                    'destination.policy',
                    'fixed: use deck as written. shared-source: append the common source, or Mix when sources are missing, empty, or different.',
                  ],
                  [
                    'destination.deck',
                    'Base deck path, such as Languages::Vocabulary. No empty path segments; at most 200 characters.',
                  ],
                  [
                    'fields',
                    '1–64 ordered field definitions. Each needs name, path, and format; list also needs item_path.',
                  ],
                  [
                    'cards',
                    '1–8 ordered card definitions. Each needs a unique name and front/back file paths.',
                  ],
                ]}
              />
              <p>
                With <code>shared-source</code>, two notes from “Lesson 1” go to{' '}
                <code>Languages::Vocabulary::Lesson 1</code>. Notes from different lessons go to{' '}
                <code>Languages::Vocabulary::Mix</code>. With <code>fixed</code>, both go directly
                to <code>Languages::Vocabulary</code>. Each export contains one note type and one
                deck.
              </p>
            </Section>

            <Section id="schema" title="Describe the input">
              <p>
                The input schema validates the whole TOML batch. Its header must require{' '}
                <code>format_version = 1</code>, your key as <code>template</code>, and your{' '}
                <code>input_version</code> as <code>template_version</code>. Each note needs a
                nonblank, stable <code>id</code>.
              </p>
              <p>
                List mandatory properties in <code>required</code>; the others are optional. Every
                object needs <code>additionalProperties: false</code>, every string a{' '}
                <code>maxLength ≤ 4000</code>, and every array a <code>maxItems ≤ 2000</code>. Add{' '}
                <code>examples</code> so the copied LLM prompt contains useful values.
              </p>
              <details class="my-5 rounded-box border border-base-content/15 bg-base-100">
                <summary class="cursor-pointer px-4 py-3 font-medium">
                  Complete input.schema.json
                </summary>
                <div class="px-3">
                  <Code name="input.schema.json">{starterFiles['input.schema.json']}</Code>
                </div>
              </details>
              <Reference
                label="Supported JSON Schema keywords"
                rows={[
                  [
                    '$schema, title, description, examples',
                    'Metadata and example values. Use JSON Schema draft-07.',
                  ],
                  [
                    'type',
                    'object, array, string, integer, number, or boolean. No null or union types.',
                  ],
                  [
                    'properties, required, additionalProperties, items',
                    'Object properties, required names, and array items.',
                  ],
                  ['const, enum', 'One exact scalar value, or a choice of up to 64 values.'],
                  ['minLength, maxLength, minItems, maxItems', 'String and array bounds.'],
                  ['minimum, maximum', 'Numeric bounds.'],
                  [
                    'dependencies',
                    'Require related properties together, e.g. a sentence and its translation.',
                  ],
                  [
                    'pattern',
                    'Only the two expressions below are supported. Arbitrary regexes are rejected.',
                  ],
                ]}
              />
              <Code name="Optional paired fields (inside a note schema)">{`"dependencies": {
  "sentence": ["translation"],
  "translation": ["sentence"]
}`}</Code>
              <details class="my-5 rounded-box border border-base-content/15 bg-base-100">
                <summary class="cursor-pointer px-4 py-3 font-medium">
                  Supported pattern values (JSON)
                </summary>
                <div class="px-3">
                  <p>
                    The first keeps sources free of control characters and deck separators. The
                    second rejects em dashes, HTML brackets, Anki expressions, and audio references.
                  </p>
                  <Code name="Source pattern">
                    {JSON.stringify({ pattern: '^(?!.*::)[^\\x00-\\x1f]*$' }, null, 2)}
                  </Code>
                  <Code name="Plain text pattern">
                    {JSON.stringify(
                      { pattern: '^(?![\\s\\S]*(?:—|<|>|\\{\\{|\\}\\}|\\[sound:))[\\s\\S]*$' },
                      null,
                      2,
                    )}
                  </Code>
                </div>
              </details>
              <p>
                Other keywords, including <code>$ref</code>, <code>oneOf</code>, <code>allOf</code>,
                and <code>format</code>, are unsupported. Keep schemas self-contained. The shared
                batch rules always limit IDs to 200 characters and sources to 100 characters;
                sources cannot contain <code>::</code> or control characters.
              </p>
              <p>
                For templates bundled in the repository, edit <code>note.schema.json</code> and run{' '}
                <code>pnpm schemas:generate</code> to build the full input schema. A standalone ZIP
                only needs <code>input.schema.json</code>.
              </p>
            </Section>

            <Section id="fields" title="Map data into Anki fields">
              <p>
                Each <code>[[fields]]</code> reads a path from one note. Names must be unique and
                begin with an ASCII letter, followed by letters or digits. Field order becomes Anki
                field order.
              </p>
              <Reference
                label="Field formats"
                rows={[
                  [
                    'text',
                    'HTML-escape a string, number, or boolean. Missing optional values become empty fields.',
                  ],
                  ['lines', 'Like text, with line breaks converted to <br>.'],
                  [
                    'list',
                    'Read an array of objects; item_path selects one property from each item. Produces HTML divs with the field name as their class and a one-based grid-row.',
                  ],
                ]}
              />
              <p>
                Paths use dots: <code>word</code>, <code>meanings.0.sk</code>, or{' '}
                <code>meanings.1.en</code>. Array indices start at zero. Required content belongs in
                the schema; a mapping does not make a field required.
              </p>
              <Code name="Nested text mapping (template.toml)">{`[[fields]]
name = "SlovakMeaning1"
path = "meanings.0.sk"
format = "text"`}</Code>
              <p>
                Prefer separate <code>text</code> fields for a small, bounded number of meanings, as
                the Russian template does. Put the grid HTML in card files to keep fields easy to
                edit in Anki.
              </p>
              <Code name="List mapping alternative (template.toml)">{`[[fields]]
name = "Meanings"
path = "meanings"
format = "list"
item_path = "en"`}</Code>
              <p>
                Given{' '}
                <code>meanings = [&#123; en = "book" &#125;, &#123; en = "volume" &#125;]</code>,
                this produces the field below. Use <code>list</code> only when generated HTML inside
                the editable field is acceptable. The array must exist; <code>item_path</code> is a
                single property name and is only allowed with <code>list</code>.
              </p>
              <Code name="Generated Meanings field">{`<div class="Meanings" style="grid-row: 1">book</div>
<div class="Meanings" style="grid-row: 2">volume</div>`}</Code>
            </Section>

            <Section id="cards" title="Write the cards and CSS">
              <p>
                Card files use Anki syntax, not SolidJS. <code>{'{{Word}}'}</code> inserts a field;{' '}
                <code>{'{{#Example}}…{{/Example}}'}</code> shows content only when the field is
                nonempty. Each card front should reference populated fields so Anki creates every
                expected card.
              </p>
              <For
                each={[
                  'cards/forward.html',
                  'cards/reverse.html',
                  'cards/answer.html',
                  'style.css',
                ]}
              >
                {(path) => <Code name={path}>{starterFiles[path]}</Code>}
              </For>
              <p>
                Card HTML and CSS are passed through to Anki; they are not previewed in the app.
                Write ordinary CSS for cards. DaisyUI and Tailwind style this website and are not
                included in exported decks. Input values are escaped, so put markup in card files,
                not in TOML values.
              </p>
              <p>
                Need more? See Anki’s{' '}
                <a class="link text-primary" href="https://docs.ankiweb.net/templates/intro.html">
                  card template reference
                </a>{' '}
                for field filters and TTS. Voice availability depends on the Anki client.
              </p>
            </Section>

            <Section id="prompt" title="Tell the LLM what to write">
              <Code name="prompt.md">{starterFiles['prompt.md']}</Code>
              <p>
                Explain subject-specific choices here: language, detail, examples, and stable IDs.
                The app prepends the shared queue instructions, then adds your prompt, a schema
                reference, and a TOML example generated from the schema. You do not need to repeat
                those rules.
              </p>
              <p>
                After importing, copy the LLM prompt and check its example. The loader rejects packs
                whose schema cannot generate a valid example; add valid <code>examples</code>{' '}
                annotations to fix it.
              </p>
            </Section>

            <Section id="identity" title="Keep IDs stable; version the contract">
              <p>
                A note’s identity comes from the pack <code>key</code> and note <code>id</code>.
                Keep both stable when correcting content. Changing the source or destination deck
                does not change that identity. Anki’s import settings and local edits affect how
                reimports apply.
              </p>
              <p>
                Exact duplicate IDs and content are removed. The same ID with different content
                blocks the batch. Identical content with different IDs produces a warning. The app
                also rejects imports that reuse an already loaded pack key or model ID.
              </p>
              <Reference
                label="Versioning"
                rows={[
                  ['format_version = 1', 'The supported pack and batch format documented here.'],
                  [
                    'input_version → template_version',
                    'Your input contract version. Increase it when changing the accepted input contract, and update the schema. Old versions are rejected, not converted.',
                  ],
                  [
                    'model.id',
                    'Anki note type identity. Keep it for CSS/layout changes. Field or card name, order, or count changes need a migration decision; a new note type needs a new ID.',
                  ],
                ]}
              />
              <p>
                The Russian note type’s “v2” name is not a pack-format version. This page documents
                the current format only; it does not keep older documentation editions.
              </p>
            </Section>

            <Section id="limits" title="Stay within the limits">
              <Reference
                label="Resource limits"
                rows={[
                  [
                    'Pack ZIP',
                    '2 MiB compressed; 8 MiB expanded; 64 members; 512 KiB per file. UTF-8 text only.',
                  ],
                  [
                    'Pack paths',
                    'Relative paths inside the pack. No absolute paths, backslashes, colons, empty segments, or dot/double-dot segments.',
                  ],
                  ['Input schema', '64 KiB; 512 nodes; 12 levels; up to 64 enum choices.'],
                  ['TOML batch', '4 MiB UTF-8; 1–2000 notes.'],
                  ['Compiled field', '32 KiB UTF-8 after escaping and formatting.'],
                ]}
              />
              <p>
                Test with the starter sample, then your own representative batch. Choose{' '}
                <strong>Validate</strong> before generating, and import the resulting{' '}
                <code>.apkg</code> into Anki to check both directions. Generation also verifies that
                the package has the expected number of cards.
              </p>
            </Section>
            <footer class="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-base-content/15 pt-6 text-sm text-base-content/65">
              <a
                class="btn btn-outline border-base-content/20 bg-base-100 text-base-content"
                href={import.meta.env.BASE_URL}
              >
                <span class="iconify lucide--arrow-left size-4" aria-hidden="true" />
                Back to generator
              </a>
              <span class="font-mono">format v1 · build {__BUILD_INFO__.commit}</span>
            </footer>
          </article>
        </div>
      </main>
    </>
  );
}
