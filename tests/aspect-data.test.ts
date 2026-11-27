import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { decompress } from 'fzstd';
import {
  wiktionaryAspects,
  openRussianAspects,
  mergeAspects,
  parseSupplement,
  serializeAspects,
  HEADER,
} from '../scripts/ru-aspect/entries.mjs';
import { readWiktionaryEntries, collectStressForms } from '../scripts/ru-stress/wiktionary.mjs';
import { parseTable } from '../scripts/ru-stress/openrussian.mjs';
import { AspectDictionary, type AspectEntry } from '../src/validators/ru-aspect/dictionary';

it('extracts template aspect suffixes and partners when reading a Wiktionary verb', () => {
  const entry = {
    word: 'делать',
    pos: 'verb',
    head_templates: [
      {
        name: 'ru-verb',
        args: { '1': 'де́лать', '2': 'impf-intr', pf: 'сде́лать', pf2: 'поде́лать' },
      },
    ],
    forms: [
      { form: 'де́лать', tags: ['canonical'] },
      { form: 'сде́лать', tags: ['perfective'] },
      { form: 'délatʹ', tags: ['romanization'] },
    ],
  };

  const entries = wiktionaryAspects(entry);

  expect(entries).toEqual([
    {
      key: 'делать',
      stressed: 'де́лать',
      aspect: 'impf',
      partners: ['поде́лать', 'сде́лать'],
      sources: 'wikt',
    },
  ]);
});

it('uses aspect tags when a head template has no known aspect and counts unresolved values', () => {
  const unknown = new Map();
  const entry = {
    word: 'использовать',
    pos: 'verb',
    tags: ['imperfective'],
    senses: [{ tags: ['perfective'] }],
    forms: [{ form: 'испо́льзовать', tags: ['canonical'] }],
  };

  const resolved = wiktionaryAspects(entry, unknown);
  const unresolved = wiktionaryAspects(
    {
      ...entry,
      tags: [],
      senses: [],
      head_templates: [{ name: 'ru-verb', args: { '2': 'unexpected' } }],
    },
    unknown,
  );

  expect(resolved[0].aspect).toBe('both');
  expect(unresolved).toEqual([]);
  expect(Object.fromEntries(unknown)).toEqual({ unexpected: 1 });
});

it('shares one dump pass and excludes historical-only entries when building both dictionaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'genanki-dictionary-'));
  const path = join(directory, 'source.jsonl.gz');
  const modern = {
    lang_code: 'ru',
    word: 'делать',
    pos: 'verb',
    senses: [{ tags: [] }],
    head_templates: [{ name: 'ru-verb', args: { '1': 'де́лать', '2': 'impf' } }],
    forms: [{ form: 'де́лать', tags: ['canonical'] }],
  };
  const entries = [
    modern,
    { ...modern, word: 'old', senses: [{ tags: ['obsolete'] }] },
    { ...modern, lang_code: 'uk' },
  ];
  await writeFile(path, gzipSync(entries.map((entry) => JSON.stringify(entry)).join('\n')));
  const aspects: AspectEntry[] = [];
  const stress = new Set();

  try {
    await readWiktionaryEntries(path, (entry: typeof modern) => {
      aspects.push(...wiktionaryAspects(entry));
      collectStressForms(entry, stress);
    });

    expect(aspects).toEqual([
      { key: 'делать', stressed: 'де́лать', aspect: 'impf', partners: [], sources: 'wikt' },
    ]);
    expect([...stress]).toEqual(['де́лать']);
  } finally {
    await rm(directory, { recursive: true });
  }
});

it('parses quoted CSV fields and checks required columns when reading OpenRussian tables', () => {
  const csv = '\ufeffword_id,aspect,partner\r\n1,imperfective,"сде\'лать, поде\'лать"\r\n';

  const rows = parseTable(csv, ['word_id', 'aspect', 'partner']);

  expect(rows).toEqual([{ word_id: '1', aspect: 'imperfective', partner: "сде'лать, поде'лать" }]);
  expect(() => parseTable('word_id,aspect\n1,pf\n', ['partner'])).toThrow('lacks column "partner"');
});

it('joins enabled verbs and resolves partner IDs or spellings when reading OpenRussian data', () => {
  const data = {
    words: [
      { id: '1', type: 'verb', accented: "де'лать", disabled: '0' },
      { id: '2', type: 'verb', accented: "сде'лать", disabled: '0' },
      { id: '3', type: 'verb', accented: "переде'лать", disabled: '1' },
      { id: '4', type: 'noun', accented: "де'ло", disabled: '0' },
      { id: '5', type: 'verb', accented: "блабла'ть", disabled: '0' },
    ],
    verbs: [
      { word_id: '1', aspect: 'imperfective', partner: '2' },
      { word_id: '2', aspect: 'perfective', partner: 'делать' },
      { word_id: '3', aspect: 'perfective', partner: '' },
      { word_id: '4', aspect: 'perfective', partner: '' },
      { word_id: '5', aspect: 'mystery', partner: '' },
    ],
  };
  const unknown = new Map();

  const entries = openRussianAspects(data, unknown);

  expect(entries).toEqual([
    { key: 'делать', stressed: 'де́лать', aspect: 'impf', partners: ['сде́лать'], sources: 'or' },
    { key: 'сделать', stressed: 'сде́лать', aspect: 'pf', partners: ['де́лать'], sources: 'or' },
  ]);
  expect(Object.fromEntries(unknown)).toEqual({ mystery: 1 });
});

it('keeps Wiktionary per stressed headword and reports conflicts while preserving homographs', () => {
  const primary = [
    {
      key: 'засыпать',
      stressed: 'засыпа́ть',
      aspect: 'impf',
      partners: ['засну́ть'],
      sources: 'wikt',
    },
  ];
  const secondary = [
    { key: 'засыпать', stressed: 'засыпа́ть', aspect: 'pf', partners: [], sources: 'or' },
    { key: 'засыпать', stressed: 'засы́пать', aspect: 'pf', partners: ['засыпа́ть'], sources: 'or' },
  ];

  const { entries, conflicts } = mergeAspects(primary, secondary);
  const dictionary = new AspectDictionary(serializeAspects(entries));

  expect(new Set(dictionary.entriesFor('засыпать'))).toEqual(
    new Set([
      {
        key: 'засыпать',
        stressed: 'засыпа́ть',
        aspect: 'impf',
        partners: ['засну́ть'],
        sources: 'wikt,or',
      },
      {
        key: 'засыпать',
        stressed: 'засы́пать',
        aspect: 'pf',
        partners: ['засыпа́ть'],
        sources: 'or',
      },
    ]),
  );
  expect(conflicts).toEqual([{ word: 'засыпа́ть', wiktionary: 'impf', openRussian: 'pf' }]);
});

it('overrides source facts when a supplement names the same stressed headword', () => {
  const primary = [
    { key: 'делать', stressed: 'де́лать', aspect: 'pf', partners: [], sources: 'wikt' },
  ];
  const supplement = parseSupplement(
    `# manual correction\n${HEADER}\nделать\tде́лать\timpf\tсде́лать\twikt\n`,
  );

  const { entries } = mergeAspects(primary, [], supplement);

  expect(entries).toEqual([
    { key: 'делать', stressed: 'де́лать', aspect: 'impf', partners: ['сде́лать'], sources: 'wikt' },
  ]);
});

it('ships identical compressed and Python-facing data with real stress-resolved homographs', async () => {
  const plain = await readFile('data/ru-aspect.tsv', 'utf8');
  const compressed = await readFile('src/validators/ru-aspect/aspects.tsv.zst');

  const decoded = new TextDecoder().decode(decompress(compressed));
  const dictionary = new AspectDictionary(decoded);

  expect(decoded).toBe(plain);
  expect(dictionary.entriesFor('делать')).toContainEqual(
    expect.objectContaining({ stressed: 'де́лать', aspect: 'impf' }),
  );
  expect(dictionary.entriesFor('сделать')).toContainEqual(
    expect.objectContaining({ stressed: 'сде́лать', aspect: 'pf' }),
  );
  expect(dictionary.entriesFor('засыпать')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ stressed: 'засы́пать', aspect: 'pf' }),
      expect.objectContaining({ stressed: 'засыпа́ть', aspect: 'impf' }),
    ]),
  );
});
