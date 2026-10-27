import { createSignal, For, type JSX } from 'solid-js';
import { ThemePicker } from '../components/ThemePicker';
import { starterFiles, starterZip } from './starter';

const sections = [
  ['quick-start', 'Quick start'],
  ['manifest', 'Template settings'],
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
            A template pack tells the LLM what to write and Anki how to show it. Start with the
            example below.
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
                Download and unzip the starter. Edit its files, ZIP the folder again, then choose
                <strong>Import template ZIP</strong> in the app. Reloading the tab removes imported
                templates.
              </p>
              <button class="btn btn-primary my-4" onClick={downloadStarter}>
                <span class="iconify lucide--download size-5" aria-hidden="true" />
                Download starter ZIP
              </button>
              <p role="status" class="text-error">
                {downloadError()}
              </p>
              <p>
                To try it first, import the ZIP and paste <code>sample.toml</code>: two notes make
                four cards in <code>Languages::Vocabulary::Lesson 1</code>. For your own template,
                change <code>key</code> and <code>model.id</code> in <code>template.toml</code>. Use
                the new key for <code>template</code> in the JSON schema and sample too.
              </p>
              <Reference
                label="Pack files"
                rows={[
                  ['template.toml', 'Template name, settings, and file names.'],
                  ['input.schema.json', 'Allowed fields, rules, and example values.'],
                  ['prompt.md', 'Instructions for the LLM.'],
                  ['cards/*.html', 'Card fronts and backs.'],
                  ['style.css', 'Card appearance.'],
                  ['sample.toml', 'Optional test notes. All other files here are required.'],
                ]}
              />
              <Code name="sample.toml">{starterFiles['sample.toml']}</Code>
            </Section>

            <Section id="manifest" title="Connect the files">
              <p>
                These settings are required. File paths start from the folder containing{' '}
                <code>template.toml</code>.
              </p>
              <Code name="template.toml">{starterFiles['template.toml']}</Code>
              <Reference
                label="Manifest options"
                rows={[
                  ['format_version', 'Use 1.'],
                  [
                    'key',
                    'Your template’s unique key. Lowercase letters, digits, and hyphens; start with a letter. Maximum 64 characters.',
                  ],
                  ['input_version', 'Start at 1; see “IDs & versions”.'],
                  ['name', 'Name shown in the app.'],
                  ['schema / prompt / css', 'File names from the table above.'],
                  ['model.id', 'Your Anki note type’s unique number (1–9007199254740991).'],
                  ['model.name', 'Name shown for this note type in Anki.'],
                  ['destination.policy', 'fixed or shared-source; see below.'],
                  [
                    'destination.deck',
                    'Deck name, e.g. Languages::Vocabulary. Maximum 200 characters; no empty parts.',
                  ],
                  [
                    'fields',
                    '1–64 fields, each with name, path, and format. list also needs item_path.',
                  ],
                  ['cards', '1–8 cards, each with a unique name and front/back file names.'],
                ]}
              />
              <p>
                <code>shared-source</code> adds <code>::Lesson 1</code> when all notes have{' '}
                <code>source = "Lesson 1"</code>, otherwise <code>::Mix</code>. <code>fixed</code>{' '}
                uses <code>destination.deck</code> as written. Each export makes one deck.
              </p>
            </Section>

            <Section id="schema" title="Describe the input">
              <p>
                A schema lists allowed fields and values. Match its three <code>const</code> values
                to the first three lines of <code>sample.toml</code>.
              </p>
              <p>
                Put required field names in <code>required</code>; the rest are optional. Add{' '}
                <code>examples</code> to give the LLM a useful starting point.
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
                    'Schema version (draft-07), title, description, and examples.',
                  ],
                  ['type', 'object, array, string, integer, number, or boolean. Choose one.'],
                  [
                    'properties, required, additionalProperties, items',
                    'Fields, required names, and list items. Every object needs additionalProperties: false.',
                  ],
                  [
                    'const, enum',
                    'One exact value (text, number, or true/false), or up to 64 choices.',
                  ],
                  [
                    'minLength, maxLength, minItems, maxItems',
                    'Text length and list size. Set maxLength ≤ 4000 for every string and maxItems ≤ 2000 for every array.',
                  ],
                  ['minimum, maximum', 'Smallest and largest allowed numbers.'],
                  ['dependencies', 'Require related fields together, as below.'],
                  ['pattern', 'Only the two patterns below are supported.'],
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
                    The first blocks <code>::</code> and control characters in sources. The second
                    blocks em dashes, HTML brackets, Anki expressions, and audio references.
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
                Other JSON Schema features, such as <code>$ref</code> and <code>oneOf</code>, are
                unsupported.
              </p>
            </Section>

            <Section id="fields" title="Map data into Anki fields">
              <p>
                Each <code>[[fields]]</code> copies a value from a note into an Anki field. Names
                must be unique: start with <code>A–Z</code> or <code>a–z</code>, then use letters or
                digits. Anki keeps the order you list them in.
              </p>
              <Reference
                label="Field formats"
                rows={[
                  [
                    'text',
                    'Text, numbers, or true/false. Missing optional values leave the field empty.',
                  ],
                  ['lines', 'Like text, but preserves line breaks.'],
                  ['list', 'Read a list using item_path. Adds a div per item; see below.'],
                ]}
              />
              <p>
                <code>path = "word"</code> reads the word. <code>path = "meanings.0.sk"</code> reads{' '}
                <code>sk</code> from the first meaning: counting starts at zero.
              </p>
              <Code name="Nested text mapping (template.toml)">{`[[fields]]
name = "SlovakMeaning1"
path = "meanings.0.sk"
format = "text"`}</Code>
              <p>
                For a few meanings, use separate <code>text</code> fields, like the Russian
                template. Keep layout HTML in the card files so notes stay easy to edit.
              </p>
              <Code name="List mapping alternative (template.toml)">{`[[fields]]
name = "Meanings"
path = "meanings"
format = "list"
item_path = "en"`}</Code>
              <p>
                With{' '}
                <code>meanings = [&#123; en = "book" &#125;, &#123; en = "volume" &#125;]</code>,
                this creates the HTML below <em>inside the editable field</em>. The list must exist.{' '}
                <code>item_path</code> names one property and only works with <code>list</code>.
              </p>
              <Code name="Generated Meanings field">{`<div class="Meanings" style="grid-row: 1">book</div>
<div class="Meanings" style="grid-row: 2">volume</div>`}</Code>
            </Section>

            <Section id="cards" title="Write the cards and CSS">
              <p>
                <code>{'{{Word}}'}</code> shows a field. <code>{'{{#Example}}…{{/Example}}'}</code>{' '}
                shows that part only when Example has a value. Make sure each front shows something;
                empty fronts can prevent Anki from creating cards.
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
                Use ordinary HTML and CSS. Tailwind and DaisyUI are not included in Anki cards. Put
                HTML in these files, not in TOML values: values display as text. Check the result in
                Anki; the app has no card preview.
              </p>
              <p>
                See Anki’s{' '}
                <a class="link text-primary" href="https://docs.ankiweb.net/templates/intro.html">
                  card template reference
                </a>{' '}
                for more options, including text-to-speech.
              </p>
            </Section>

            <Section id="prompt" title="Tell the LLM what to write">
              <Code name="prompt.md">{starterFiles['prompt.md']}</Code>
              <p>
                Describe the language, detail, and examples you want. The app adds the shared queue
                instructions, field rules, and a TOML example automatically.
              </p>
              <p>
                Copy the LLM prompt to check the example. If importing reports an invalid example,
                fix the <code>examples</code> values in your schema.
              </p>
            </Section>

            <Section id="identity" title="Update your template">
              <p>
                Keep <code>key</code> and each note’s <code>id</code> the same when correcting
                notes, so Anki recognizes them on reimport. Changing decks or sources does not
                change IDs. Anki’s import settings still affect updates.
              </p>
              <p>
                Exact duplicates are skipped. Two different notes with the same ID cause an error.
                Imported templates also need a key and model ID that are not already loaded.
              </p>
              <Reference
                label="Versioning"
                rows={[
                  ['format_version = 1', 'The format this page covers.'],
                  [
                    'input_version → template_version',
                    'Increase it when changing required fields or allowed values. Set template_version to match in JSON and TOML. Older versions are rejected.',
                  ],
                  [
                    'model.id',
                    'Keep it for appearance changes. Changing field/card names, order, or count needs care with existing notes. New note types need new IDs.',
                  ],
                ]}
              />
            </Section>

            <Section id="limits" title="Stay within the limits">
              <Reference
                label="Resource limits"
                rows={[
                  [
                    'Pack ZIP',
                    '2 MiB zipped; 8 MiB unzipped; 64 files/folders; 512 KiB per file. UTF-8 text only.',
                  ],
                  [
                    'Pack paths',
                    'Keep files inside the template folder. No / prefix, backslashes, colons, or . / .. folder names.',
                  ],
                  ['Input schema', '64 KiB; 512 schema entries; up to 12 levels of nesting.'],
                  ['TOML batch', '4 MiB; 1–2000 notes.'],
                  [
                    'Note ID / source',
                    'Nonblank ID: up to 200 characters. Source: up to 100, without :: or control characters.',
                  ],
                  ['Anki field', '32 KiB after conversion.'],
                ]}
              />
              <p>
                Choose <strong>Validate</strong>, generate the <code>.apkg</code>, then import it
                into Anki and check both card directions.
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
