import { expect, it } from 'vitest';
import { stringify } from 'smol-toml';
import { bundledPacks } from '../src/core/packs';
import { compileBatch } from '../src/core/compiler';
import { schemaExample } from '../src/core/prompt';
import noteSchema from '../templates/russian-vocabulary/note.schema.json';

const packs = bundledPacks();
const russian = packs.find((pack) => pack.manifest.key === 'russian-vocabulary')!;
const meaning = { sk: 'robiť', en: 'to do, to make' };
interface BatchFixture {
  format_version: number;
  template: string;
  template_version: number;
  notes: Record<string, unknown>[];
}
function batch(note: Record<string, unknown> = {}): BatchFixture {
  return {
    format_version: 1,
    template: 'russian-vocabulary',
    template_version: 2,
    notes: [
      {
        id: 'ru:делать:general',
        word: 'де́лать',
        kind: 'slov',
        aspect: 'impf',
        meanings: [meaning],
        ...note,
      },
    ],
  };
}

it.each(noteSchema.properties.kind.enum)(
  'accepts kind %s and uses its exact NFC tag',
  async (kind) => {
    const document = kind === 'slov' ? batch() : batch({ word: 'кни́га', kind, aspect: undefined });

    const result = await compileBatch(stringify(document), packs);

    expect(kind.normalize('NFC')).toBe(kind);
    expect(result.payload.notes[0].tags).toEqual([`genanki::${kind}`]);
    expect(result.payload.notes[0].fields[2]).toBe(
      russian.manifest.fields.find((field) => field.name === 'Kind')!.labels![kind],
    );
  },
);

it('rejects the previous contract with a clear version error', async () => {
  const document = { ...batch(), template_version: 1 };

  const compile = compileBatch(stringify(document), packs);

  await expect(compile).rejects.toThrow(
    'template_version: 1 is unsupported for russian-vocabulary; expected 2.',
  );
});

it('rejects category when an input uses the v4 contract', async () => {
  const document = batch({ category: 'sloveso; nedokonavý vid' });

  const compile = compileBatch(stringify(document), packs);

  await expect(compile).rejects.toThrow(
    'notes.0.category (note "ru:делать:general"): is not a known field; remove it.',
  );
});

it.each(['blank', 'pod.m:z', 'sloveso'])('rejects unsupported kind %s', async (kind) => {
  const document = batch({ kind });

  const compile = compileBatch(stringify(document), packs);

  await expect(compile).rejects.toThrow('notes.0.kind');
});

it('compiles a dictionary-valid schema example with labels and an answer-only partner', async () => {
  const document = schemaExample(russian);

  const result = await compileBatch(stringify(document), packs);

  expect(result.reviewWarnings).toEqual([]);
  expect(result.payload.notes[0].fields.slice(0, 7)).toEqual([
    'ru:делать:general',
    'де́лать',
    'sloveso',
    'impf.',
    'сде́лать',
    '',
    '',
  ]);
  expect(result.payload.notes[0].tags).toEqual(['genanki::slov']);
});

it('rejects every wrong aspect in a batch with complete copyable lines', async () => {
  const document = batch({ aspect: 'pf' });
  document.notes.push({
    ...document.notes[0],
    id: 'ru:сделать:general',
    word: 'сде́лать',
    aspect: 'impf',
  });

  const failure = await compileBatch(stringify(document), packs).catch((error: Error) => error);

  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message.split('\n')).toEqual([
    'note "ru:делать:general": aspect is "pf", but the dictionary has "де́лать" as "impf" (partner: сде́лать). Fix aspect.',
    'note "ru:сделать:general": aspect is "impf", but the dictionary has "сде́лать" as "pf" (partner: де́лать). Fix aspect.',
  ]);
});

it('blocks missing aspect and non-verb aspect after structural validation', async () => {
  const document = batch({ aspect: undefined });
  document.notes.push({
    ...document.notes[0],
    id: 'ru:книга:general',
    word: 'кни́га',
    kind: 'pod.m:ž',
    aspect: 'pf',
  });

  const failure = await compileBatch(stringify(document), packs).catch((error: Error) => error);

  expect((failure as Error).message.split('\n')).toEqual([
    'note "ru:делать:general": kind is "slov" but aspect is missing. Add aspect = "impf" | "pf" | "both".',
    'note "ru:книга:general": aspect is only allowed when kind = "slov". Remove aspect.',
  ]);
});

it.each([{ partner: 'сде́лать' }, { motion: 'unidir' }])(
  'requires aspect when a dependent verb field is present',
  async (dependent) => {
    const document = batch({ ...dependent, aspect: undefined });

    const compile = compileBatch(stringify(document), packs);

    await expect(compile).rejects.toThrow('aspect');
  },
);

it('compiles the specification examples with display labels and raw kind tags', async () => {
  const document = batch({
    id: 'ru:сделать:general',
    word: 'сде́лать',
    aspect: 'pf',
    partner: 'де́лать',
    meanings: [
      {
        sk: 'urobiť, spraviť',
        en: 'to do, to make',
        sentence: 'Я сде́лал это сам.',
        translation: 'Urobil som to sám.',
      },
    ],
  });
  const original = document.notes[0];
  document.notes.push(
    {
      ...original,
      id: 'ru:ходить:general',
      word: 'ходи́ть',
      aspect: 'impf',
      partner: undefined,
      motion: 'multidir',
    },
    {
      ...original,
      id: 'ru:тачка:general',
      word: 'та́чка',
      kind: 'pod.m:ž',
      aspect: undefined,
      partner: undefined,
      usage: 'hovorové',
    },
  );

  const result = await compileBatch(stringify(document), packs);

  expect(result.payload.model.name).toBe('Russian vocabulary v4');
  expect(result.payload.notes.map((note) => note.fields.slice(1, 7))).toEqual([
    ['сде́лать', 'sloveso', 'pf.', 'де́лать', '', ''],
    ['ходи́ть', 'sloveso', 'impf.', '', 'multidir.', ''],
    ['та́чка', 'podst. meno, ženský rod', '', '', '', 'hovorové'],
  ]);
  expect(result.payload.notes.map((note) => note.tags)).toEqual([
    ['genanki::slov'],
    ['genanki::slov'],
    ['genanki::pod.m:ž'],
  ]);
});

it('keeps later prompt examples intact when a caller edits a generated note', () => {
  const expected = structuredClone(schemaExample(russian));
  const editable = schemaExample(russian);
  // the pack loader validated this generated example against the vocabulary schema
  const notes = editable.notes as unknown as Record<string, unknown>[];
  const meanings = notes[0].meanings as unknown as Record<string, unknown>[];

  notes[0].word = 'изменено';
  meanings[0].sk = 'changed';

  expect(schemaExample(russian)).toEqual(expected);
});
