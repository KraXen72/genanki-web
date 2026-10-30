import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'smol-toml';
import { bundledPacks } from '../src/core/packs';
import { compileBatch, deckId, escapeText } from '../src/core/compiler';
import { assemblePrompt, schemaExample } from '../src/core/prompt';
import queue from '../prompts/queue.md?raw';

const packs = bundledPacks();
const russian = packs.find((pack) => pack.manifest.key === 'russian-vocabulary')!;
const example = () => schemaExample(russian) as any;
const compile = (document: ReturnType<typeof example>) => compileBatch(stringify(document), packs);

it('loads two packs without special exporter branches', () => {
  expect(packs.map((pack) => pack.manifest.key).sort()).toEqual(['basic', 'russian-vocabulary']);
});

it.each([1, 2, 3])('compiles %i paired meanings in exact field/card order', async (count) => {
  const document = example();
  document.notes[0].meanings = Array.from({ length: count }, (_, index) => ({
    sk: `Slovak ${index + 1}`,
    en: `English ${index + 1}`,
    sentence: `Ру́сский ${index + 1}`,
    translation: `Translation ${index + 1}`,
  }));
  const result = await compile(document);
  expect(result.payload.model.fields).toEqual([
    'ID',
    'Category',
    'Word',
    'SlovakMeaning1',
    'EnglishGloss1',
    'SlovakMeaning2',
    'EnglishGloss2',
    'SlovakMeaning3',
    'EnglishGloss3',
    'Sentence1',
    'Translation1',
    'Sentence2',
    'Translation2',
    'Sentence3',
    'Translation3',
  ]);
  expect(result.payload.model.id).toBe(1759797713);
  expect(result.payload.model.name).toBe('Russian vocabulary v3');
  expect(result.payload.notes[0].fields).toEqual([
    document.notes[0].id,
    document.notes[0].category,
    document.notes[0].word,
    ...Array.from({ length: 3 }, (_, index) =>
      index < count ? [`Slovak ${index + 1}`, `English ${index + 1}`] : ['', ''],
    ).flat(),
    ...Array.from({ length: 3 }, (_, index) =>
      index < count ? [`Ру́сский ${index + 1}`, `Translation ${index + 1}`] : ['', ''],
    ).flat(),
  ]);
  expect(result.cardCount).toBe(2);
  expect(result.payload.model.cards.map((card) => card.name)).toEqual([
    'Russian → Slovak',
    'Slovak → Russian',
  ]);
});

it('keeps optional pairs empty, combining stress and ё unchanged', async () => {
  const document = example();
  document.notes[0].word = 'всё ещё́';
  delete document.notes[0].meanings[0].sentence;
  delete document.notes[0].meanings[0].translation;
  const result = await compile(document);
  expect(result.payload.notes[0].fields[2]).toBe('всё ещё́');
  expect(result.payload.notes[0].fields.slice(9)).toEqual(['', '', '', '', '', '']);
});

it('keeps meaning fields editable as escaped text without layout markup', async () => {
  const document = example();
  document.notes[0].meanings = [{ sk: 'kniha & text', en: 'a "book"' }];
  const result = await compile(document);
  expect(result.payload.notes[0].fields.slice(3, 9)).toEqual([
    'kniha &amp; text',
    'a &quot;book&quot;',
    '',
    '',
    '',
    '',
  ]);
});

it('escapes text once and only changes newlines for lines mappings', async () => {
  const basic = packs.find((pack) => pack.manifest.key === 'basic')!;
  const document = schemaExample(basic) as any;
  document.notes[0].answer = '<b>"A" & B</b>\nNext';
  const result = await compile(document);
  expect(result.payload.notes[0].fields[2]).toBe(
    '&lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;<br>Next',
  );
  expect(escapeText("'&")).toBe('&#39;&amp;');
});

it.each([
  { sources: ['Lesson 1', 'Lesson 1'], destination: 'Lesson 1' },
  { sources: [' Lesson 1 ', 'Lesson 1'], destination: 'Lesson 1' },
  { sources: ['Lesson 1', 'Lesson 2'], destination: 'Mix' },
  { sources: ['Lesson 1', undefined], destination: 'Mix' },
  { sources: ['', ''], destination: 'Mix' },
])('resolves sources $sources to $destination', async ({ sources, destination }) => {
  const document = example();
  document.notes = sources.map((source, index) => ({
    ...document.notes[0],
    id: `entry:${index}`,
    source,
  }));
  // smol-toml correctly omits undefined object properties.
  const result = await compile(document);
  expect(result.payload.deck.name).toBe(`Ruština::Vocabulary::${destination}`);
  expect(result.filename).toBe(
    `${destination.toLowerCase().replaceAll(' ', '_')}__russian_vocabulary.apkg`,
  );
});

it.each([
  {
    template: 'Russian vocabulary',
    source: 'YouTube - ЕГОР ШКРЕД - Smashing Rooms',
    filename: 'youtube_-_egor_shkred_-_smashing_rooms__russian_vocabulary.apkg',
  },
  {
    template: 'Ruská slovná zásoba',
    source: '  Čítanie / кни́га: урок 1?  ',
    filename: 'citanie_kniga_urok_1__ruska_slovna_zasoba.apkg',
  },
  { template: '📚', source: '🎬', filename: 'source__template.apkg' },
])('names downloads $filename', async ({ template, source, filename }) => {
  const document = example();
  document.notes[0].source = source;
  const pack = { ...russian, manifest: { ...russian.manifest, name: template } };
  const result = await compileBatch(stringify(document), [pack]);

  expect(result.filename).toBe(filename);
});

it('uses stable positive safe deck IDs and distinct full paths', async () => {
  const id = await deckId('Ruština::Vocabulary::Lesson 1');
  expect(await deckId('Ruština::Vocabulary::Lesson 1')).toBe(id);
  expect(Number.isSafeInteger(id)).toBe(true);
  expect(id).toBeGreaterThan(0);
  expect(await deckId('Ruština::Vocabulary::Mix')).not.toBe(id);
});

it('deduplicates identical IDs, blocks conflicts, and warns for distinct IDs with identical content', async () => {
  const document = example();
  document.notes.push(structuredClone(document.notes[0]));
  expect((await compile(document)).duplicates).toBe(1);
  document.notes[1].word = 'до́м';
  await expect(compile(document)).rejects.toThrow('conflicting content');
  document.notes[1] = { ...document.notes[0], id: 'ru:other' };
  expect((await compile(document)).warnings).toHaveLength(1);
});

it('unwraps a single pasted TOML fence but requires plain TOML files', async () => {
  const fenced = `\`\`\`toml\n${stringify(example())}\n\`\`\``;
  expect((await compileBatch(fenced, packs)).payload.notes).toHaveLength(1);
  await expect(compileBatch(fenced, packs, false)).rejects.toThrow();
});

it.each([
  [
    'unknown property',
    (d: any) => {
      d.notes[0].typo = 'x';
    },
    'notes.0.typo',
  ],
  [
    'wrong type',
    (d: any) => {
      d.notes[0].word = 12;
    },
    'notes.0.word',
  ],
  [
    'missing required field',
    (d: any) => {
      delete d.notes[0].word;
    },
    'notes.0.word',
  ],
  [
    'unsupported version',
    (d: any) => {
      d.template_version = 2;
    },
    'template_version',
  ],
  [
    'unsupported format',
    (d: any) => {
      d.format_version = 2;
    },
    'format_version',
  ],
  [
    'unknown template',
    (d: any) => {
      d.template = 'absent';
    },
    'Unknown template',
  ],
  [
    'too many meanings',
    (d: any) => {
      d.notes[0].meanings = Array(4).fill(d.notes[0].meanings[0]);
    },
    '3 items',
  ],
  [
    'em dash',
    (d: any) => {
      d.notes[0].word = 'сло́во—';
    },
    'pattern',
  ],
  [
    'HTML',
    (d: any) => {
      d.notes[0].word = '<b>сло́во</b>';
    },
    'pattern',
  ],
  [
    'Anki syntax',
    (d: any) => {
      d.notes[0].word = '{{Word}}';
    },
    'pattern',
  ],
  [
    'unpaired example',
    (d: any) => {
      delete d.notes[0].meanings[0].translation;
    },
    'translation',
  ],
  [
    'deck hierarchy',
    (d: any) => {
      d.notes[0].source = 'Lesson::1';
    },
    'source',
  ],
  [
    'control characters',
    (d: any) => {
      d.notes[0].word = 'a\x1fb';
    },
    'control characters',
  ],
  [
    'blank ID',
    (d: any) => {
      d.notes[0].id = ' ';
    },
    'must not be blank',
  ],
])('rejects %s without coercion', async (_label, mutate, expected) => {
  const document = example();
  mutate(document);
  await expect(compile(document)).rejects.toThrow(expected);
});

it('enforces input and note limits', async () => {
  await expect(compileBatch('x'.repeat(4 * 1024 * 1024 + 1), packs)).rejects.toThrow('4 MiB');
  const document = example();
  document.notes = Array(2001).fill(document.notes[0]);
  await expect(compile(document)).rejects.toThrow('2000');
});

describe.each(packs)('schema-derived prompt for $manifest.key', (pack) => {
  it('uses the shared queue and ends with valid, schema-compatible TOML', () => {
    const prompt = assemblePrompt(pack);
    expect(prompt.startsWith(queue.trim())).toBe(true);
    expect(prompt).toContain(pack.prompt.trim());
    expect(prompt.indexOf(pack.prompt.trim())).toBeGreaterThan(queue.trim().length);
    const match = prompt.match(/```toml\n([\s\S]+)\n```$/)!;
    expect(match).not.toBeNull();
    const parsed = parse(match[1]);
    expect(pack.validate(parsed), JSON.stringify(pack.validate.errors)).toBe(true);
    expect(parsed.template).toBe(pack.manifest.key);
    expect(parsed.template_version).toBe(pack.manifest.input_version);
  });
});

it('packages Russian templates unchanged with native TTS and conditional examples', () => {
  const [forward, reverse] = russian.cards;
  expect(forward.qfmt).toContain('{{tts ru_RU:Word}}');
  expect(reverse.qfmt).not.toMatch(/\{\{(?:Word|EnglishGloss\d|tts)/);
  expect(forward.afmt).toBe(reverse.afmt);
  expect(forward.afmt).not.toContain('{{FrontSide}}');
  for (const card of russian.cards) {
    for (let index = 1; index <= 3; index++) {
      expect(card.afmt).toContain(`{{#Sentence${index}}}<section`);
      expect(card.afmt).toContain(`</section>{{/Sentence${index}}}`);
    }
  }
  expect(russian.css).not.toMatch(/(?:background|font-style:\s*italic)/);
});

it('rejects formatting syntax and em dashes after newlines too', async () => {
  const document = example();
  document.notes[0].word = 'сло́во\n—';
  await expect(compile(document)).rejects.toThrow('pattern');
});

it('checks the size of escaped fields rather than just source character counts', async () => {
  const document = example();
  document.notes[0].meanings = Array.from({ length: 3 }, () => ({
    sk: '&'.repeat(4000),
    en: 'gloss',
  }));
  const pack = {
    ...russian,
    manifest: {
      ...russian.manifest,
      fields: [{ name: 'Meanings', path: 'meanings', format: 'list' as const, item_path: 'sk' }],
    },
  };
  await expect(compileBatch(stringify(document), [pack])).rejects.toThrow('32 KiB');
});
