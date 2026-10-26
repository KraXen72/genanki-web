import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { importPack, loadPack } from '../src/core/packs';
import { assemblePrompt } from '../src/core/prompt';

const bundled = import.meta.glob('../templates/basic/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function files(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(bundled).map(([path, text]) => {
      return [path.slice('../templates/basic/'.length), text];
    }),
  );
}

function zip(members: Record<string, string>, root = '') {
  const encoded = Object.fromEntries(
    Object.entries(members).map(([name, text]) => {
      return [`${root}${name}`, strToU8(text)];
    }),
  );
  return zipSync(encoded);
}

function changeSchema(members: Record<string, string>, change: (schema: any) => void) {
  const schema = JSON.parse(members['input.schema.json']);
  change(schema);
  members['input.schema.json'] = JSON.stringify(schema);
}

it.each(['', 'my-pack/'])('loads ZIP files with root %s through the bundled pipeline', (root) => {
  const pack = importPack(zip(files(), root));
  expect(pack.manifest.key).toBe('basic');
  expect(assemblePrompt(pack)).toContain('question');
});

it('does not evaluate pack HTML or CSS while loading', () => {
  const members = files();
  members['cards/front.html'] = '<script>throw new Error("executed")</script>{{Question}}';
  const pack = importPack(zip(members));
  expect(pack.cards[0].qfmt).toBe(members['cards/front.html']);
});

it.each([
  '../outside.txt',
  '/absolute.txt',
  'a/../../bad.txt',
  'a\\bad.txt',
  'C:/bad.txt',
  'a//bad.txt',
])('rejects unsafe ZIP member %s', (path) => {
  expect(() => importPack(zip({ ...files(), [path]: 'bad' }))).toThrow('Unsafe');
});

it('requires one pack root and all referenced assets', () => {
  expect(() => importPack(zip({}))).toThrow('exactly one');
  const members = files();
  delete members['cards/front.html'];
  expect(() => importPack(zip(members))).toThrow('Missing');
  expect(() =>
    importPack(zip({ ...files(), 'nested/template.toml': members['template.toml'] })),
  ).toThrow('exactly one');
  const nested = Object.fromEntries(
    Object.entries(files()).map(([key, value]) => [`nested/${key}`, value]),
  );
  expect(() => importPack(zip({ ...nested, 'outside.txt': 'bad' }))).toThrow('pack root');
});

it('bounds compressed size, expanded files, and file count', () => {
  expect(() => importPack(new Uint8Array(2 * 1024 * 1024 + 1))).toThrow('2 MiB');
  expect(() => importPack(zip({ ...files(), 'large.txt': 'x'.repeat(512 * 1024 + 1) }))).toThrow(
    'expanded size',
  );
  const excessFiles = Object.fromEntries(
    Array.from({ length: 65 }, (_, index) => [`${index}.txt`, 'x']),
  );
  expect(() => importPack(zip(excessFiles))).toThrow('file count');
});

it('rejects invalid UTF-8 and corrupt archives', () => {
  expect(() => importPack(new Uint8Array([1, 2, 3]))).toThrow();
  const members = Object.fromEntries(
    Object.entries(files()).map(([key, value]) => [key, strToU8(value)]),
  );
  members['prompt.md'] = new Uint8Array([255]);
  expect(() => importPack(zipSync(members))).toThrow();
});

it.each([
  [
    'remote references',
    (schema: any) => {
      schema.$ref = 'https://example.com/schema';
    },
    'Unsupported',
  ],
  [
    'arbitrary regex',
    (schema: any) => {
      schema.properties.notes.items.properties.question.pattern = '(a+)+$';
    },
    'pattern',
  ],
  [
    'open objects',
    (schema: any) => {
      schema.additionalProperties = true;
    },
    'unknown properties',
  ],
  [
    'unbounded strings',
    (schema: any) => {
      delete schema.properties.notes.items.properties.question.maxLength;
    },
    'maxLength',
  ],
  [
    'unbounded arrays',
    (schema: any) => {
      delete schema.properties.notes.maxItems;
    },
    'maxItems',
  ],
  [
    'wrong contract',
    (schema: any) => {
      schema.properties.template.const = 'wrong';
    },
    'exact manifest header',
  ],
  [
    'invalid examples',
    (schema: any) => {
      schema.properties.notes.items.properties.question.examples = [12];
    },
    'valid prompt example',
  ],
])('rejects %s', (_name, change, expected) => {
  const members = files();
  changeSchema(members, change);
  expect(() => loadPack(members)).toThrow(expected);
});

it('rejects duplicate fields and list mappings without item_path', () => {
  const members = files();
  members['template.toml'] = members['template.toml'].replace('name = "Question"', 'name = "ID"');
  expect(() => loadPack(members)).toThrow('unique');
  members['template.toml'] = files()['template.toml'].replace(
    'format = "lines"',
    'format = "list"',
  );
  expect(() => loadPack(members)).toThrow('item_path');
});

it('bounds schema complexity before AJV compilation', () => {
  const members = files();
  changeSchema(members, (schema) => {
    let current = schema.properties.notes.items;
    for (let index = 0; index < 15; index++) {
      current.properties.nested = { type: 'object', properties: {}, additionalProperties: false };
      current = current.properties.nested;
    }
  });
  expect(() => loadPack(members)).toThrow('complexity');
});
