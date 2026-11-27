import { expect, it } from 'vitest';
import { stringify } from 'smol-toml';
import { loadPack } from '../src/core/packs';
import { compileBatch } from '../src/core/compiler';
import { schemaExample } from '../src/core/prompt';

const bundled = import.meta.glob('../templates/basic/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function labelFiles(
  labels: Record<string, string> = { impf: '<imperfective> & "ongoing"', pf: 'perfective' },
) {
  const files = Object.fromEntries(
    Object.entries(bundled).map(([path, text]) => [path.slice('../templates/basic/'.length), text]),
  );
  const schema = JSON.parse(files['input.schema.json']);
  schema.properties.notes.items.properties.aspect = {
    type: 'string',
    maxLength: 20,
    enum: ['impf', 'pf'],
    examples: ['impf'],
  };
  files['input.schema.json'] = JSON.stringify(schema);
  files['template.toml'] +=
    `\n${stringify({ fields: [{ name: 'Aspect', path: 'aspect', format: 'label', labels }], tags: [{ prefix: 'genanki', path: 'aspect' }] })}`;
  return files;
}

it.each([
  [{ impf: 'imperfective' }, 'missing labels [pf]'],
  [{ impf: 'imperfective', pf: 'perfective', both: 'both' }, 'extra labels [both]'],
])('rejects an incomplete or extra label table when loading a pack', (labels, message) => {
  const files = labelFiles(labels);

  const load = () => loadPack(files);

  expect(load).toThrow(message);
});

it.each(['text', 'lines', 'list'])('rejects labels when the format is %s', (format) => {
  const files = labelFiles();
  files['template.toml'] = files['template.toml'].replace(
    'format = "label"',
    `format = "${format}"${format === 'list' ? '\nitem_path = "value"' : ''}`,
  );

  const load = () => loadPack(files);

  expect(load).toThrow('requires labels exactly when');
});

it('rejects a label mapping when its path has no string enum', () => {
  const files = labelFiles();
  files['template.toml'] = files['template.toml'].replace('path = "aspect"', 'path = "answer"');

  const load = () => loadPack(files);

  expect(load).toThrow('requires a string enum at answer');
});

it('rejects a label mapping when its labels are missing', () => {
  const files = labelFiles();
  const manifest = files['template.toml'];
  files['template.toml'] = manifest.replace(/\[fields.labels\][\s\S]*?(?=\[\[tags\]\])/, '');

  const load = () => loadPack(files);

  expect(load).toThrow('requires labels exactly when');
});

it('escapes display labels and emits raw enum tags when the value is present', async () => {
  const pack = loadPack(labelFiles());
  const document = schemaExample(pack);

  const result = await compileBatch(stringify(document), [pack]);

  expect(result.payload.notes[0].fields.at(-1)).toBe(
    '&lt;imperfective&gt; &amp; &quot;ongoing&quot;',
  );
  expect(result.payload.notes[0].tags).toEqual(['genanki::impf']);
});

it('leaves optional labels empty and omits tags when the input value is missing', async () => {
  const pack = loadPack(labelFiles());
  const document = schemaExample(pack);
  // the loader validated this generated example against the local test schema
  const notes = document.notes as unknown as Record<string, unknown>[];
  delete notes[0].aspect;

  const result = await compileBatch(stringify(document), [pack]);

  expect(result.payload.notes[0].fields.at(-1)).toBe('');
  expect(result.payload.notes[0].tags).toEqual([]);
});

it.each(['with space', 'with\ttab', 'with\nnewline', 'with\u00a0space', '', 12])(
  'rejects invalid tag value %j',
  async (value) => {
    const files = labelFiles();
    files['template.toml'] = files['template.toml'].replace(
      /\[\[tags\]\][\s\S]*/,
      '[[tags]]\nprefix = "genanki"\npath = "question"\n',
    );
    const schema = JSON.parse(files['input.schema.json']);
    schema.properties.notes.items.properties.question = {
      type: typeof value === 'number' ? 'number' : 'string',
      ...(typeof value === 'string' ? { maxLength: 100 } : {}),
      examples: [value],
    };
    files['input.schema.json'] = JSON.stringify(schema);
    const pack = loadPack(files);

    const compile = compileBatch(stringify(schemaExample(pack)), [pack]);

    await expect(compile).rejects.toThrow('requires a nonempty string without whitespace');
  },
);

it('checks raw declared fields when a validator reads a label mapping', async () => {
  const files = labelFiles();
  const schema = JSON.parse(files['input.schema.json']);
  schema.properties.notes.items.properties.aspect.enum = ['ку́пил'];
  schema.properties.notes.items.properties.aspect.examples = ['ку́пил'];
  files['input.schema.json'] = JSON.stringify(schema);
  files['template.toml'] = files['template.toml'].replace(
    /\[fields.labels\][\s\S]*/,
    '[fields.labels]\n"ку́пил" = "purchased"\n[[validators]]\nname = "ru-stress"\nfields = ["Aspect"]\n',
  );
  const pack = loadPack(files);
  const document = schemaExample(pack);
  // the loader validated this generated example against the local test schema
  const notes = document.notes as unknown as Record<string, unknown>[];
  notes[0].question = 'фу́тболка';

  const result = await compileBatch(stringify(document), [pack]);

  expect(result.payload.notes[0].fields.at(-1)).toBe('purchased');
  expect(result.reviewWarnings).toEqual([
    `note "${notes[0].id}", Aspect: "ку́пил" has unexpected stress; the dictionary has "купи́л".`,
  ]);
});
