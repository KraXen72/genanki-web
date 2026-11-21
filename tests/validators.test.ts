import { expect, it } from 'vitest';
import { stringify } from 'smol-toml';
import { compileBatch } from '../src/core/compiler';
import { bundledPacks } from '../src/core/packs';
import { schemaExample } from '../src/core/prompt';
import { checkRussianStress } from '../src/validators/ru-stress';
import { StressDictionary } from '../src/validators/ru-stress/dictionary';

const packs = bundledPacks();
const pack = (key: string) => packs.find((candidate) => candidate.manifest.key === key)!;
const check = (text: string, noteId = 'ru:тест:general') => {
  return checkRussianStress([{ noteId, field: 'Sentence1', text }]);
};

it.each([
  ['фу́тболка', 'футбо́лка'],
  ['ку́пил', 'купи́л'],
  ['диване́', 'дива́не'],
  ['серебря́ный', 'сере́бряный'],
])('flags %s and suggests %s', async (written, expected) => {
  const [warning] = (await check(written)).reviewWarnings;

  expect(warning).toBe(
    `note "ru:тест:general", Sentence1: "${written}" has unexpected stress; the dictionary has "${expected}".`,
  );
});

it('accepts correct stress, capitals, and every stress of a homograph', async () => {
  const sentence = 'Э́то кни́га. За́мок и замо́к. Хорошо́ говори́ть по-ру́сски.';
  expect(await check(sentence)).toEqual({ reviewWarnings: [], notices: [] });
});

it('accepts common words that only the supplement lists', async () => {
  expect((await check('Она́ бу́дет на́ша. Ко́торый тво́рог? творо́г')).reviewWarnings).toEqual([]);
});

it('knows words that OpenRussian added after its last export', async () => {
  expect(await check('Он порезал мизи́нчик.')).toEqual({ reviewWarnings: [], notices: [] });
});

it('skips unmarked words and words with ё', async () => {
  expect(await check('футболка идёт ещё кот')).toEqual({ reviewWarnings: [], notices: [] });
});

it('only mentions words missing from the dictionary', async () => {
  expect(await check('бла́бла бла́бла')).toEqual({
    reviewWarnings: [],
    notices: ['Stress not checked (not in the dictionary): бла́бла.'],
  });
});

it('finds stress marks in decomposed text', async () => {
  expect((await check('футбо́лка'.normalize('NFD'))).reviewWarnings).toEqual([]);
});

it('reports stress problems for review without failing the Russian pack', async () => {
  const document = schemaExample(pack('russian-vocabulary')) as any;
  document.notes[0].meanings[0].sentence = 'У него́ се́рая фу́тболка.';

  const result = await compileBatch(stringify(document), packs);

  expect(result.reviewWarnings).toEqual([
    `note "${document.notes[0].id}", Sentence1: "фу́тболка" has unexpected stress; the dictionary has "футбо́лка".`,
  ]);
  expect(result.payload.notes).toHaveLength(1);
});

it('leaves packs that do not opt in unchecked', async () => {
  const document = schemaExample(pack('basic')) as any;
  document.notes[0] = { ...document.notes[0], question: 'фу́тболка', answer: 'ку́пил' };

  const result = await compileBatch(stringify(document), packs);

  expect(pack('basic').manifest.validators).toBeUndefined();
  expect(result.reviewWarnings).toEqual([]);
});

it('refuses a dictionary whose forms are out of order', () => {
  // "за́мок", then "замо́к" written as sharing "за" with it, then "а́ист" out of order
  const sorted = '0за́мок\n2мо́к\n';
  expect(new StressDictionary(sorted).stressesOf('замок')).toEqual(['за́мок', 'замо́к']);

  expect(() => new StressDictionary(`${sorted}0а́ист\n`)).toThrow(
    'The stress dictionary is not sorted at line 3: "а́ист".',
  );
});
