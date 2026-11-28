import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkRussianAspect, MOTION_PAIRS } from '../src/validators/ru-aspect';
import { AspectDictionary, ASPECT_HEADER } from '../src/validators/ru-aspect/dictionary';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/ru-aspect.json', import.meta.url), 'utf8'),
) as string[][];
const dictionary = new AspectDictionary(
  `${ASPECT_HEADER}\n${fixture.map((row) => row.join('\t')).join('\n')}\n`,
);

function check(fields: Record<string, string>) {
  return checkRussianAspect([{ noteId: 'ru:тест:general', fields }], dictionary);
}

it('accepts an imperfective verb when the dictionary agrees', async () => {
  const fields = { Word: 'де́лать', Kind: 'slov', Aspect: 'impf', Partner: 'сде́лать' };

  const result = await check(fields);

  expect(result).toEqual({ errors: [], reviewWarnings: [], notices: [] });
});

it('returns a pasteable dictionary correction when the aspect is wrong', async () => {
  const notes = [
    { noteId: 'ru:сделать:general', fields: { Word: 'сде́лать', Kind: 'slov', Aspect: 'impf' } },
  ];

  const result = await checkRussianAspect(notes, dictionary);

  expect(result.errors).toEqual([
    'note "ru:сделать:general": aspect is "impf", but the dictionary has "сде́лать" as "pf" (partner: де́лать). Fix aspect.',
  ]);
});

it('requires aspect when kind identifies a verb', async () => {
  const fields = { Word: 'де́лать', Kind: 'slov' };

  const result = await check(fields);

  expect(result.errors).toEqual([
    'note "ru:тест:general": kind is "slov" but aspect is missing. Add aspect = "impf" | "pf" | "both".',
  ]);
});

it('rejects all verb-only fields when kind identifies a noun', async () => {
  const fields = {
    Word: 'кни́га',
    Kind: 'pod.m:ž',
    Aspect: 'impf',
    Partner: 'сде́лать',
    Motion: 'unidir',
  };

  const result = await check(fields);

  expect(result.errors).toEqual(
    ['aspect', 'partner', 'motion'].map(
      (field) =>
        `note "ru:тест:general": ${field} is only allowed when kind = "slov". Remove ${field}.`,
    ),
  );
});

it('allows export with a notice when a verb is missing from the dictionary', async () => {
  const fields = { Word: 'блабла́ть', Kind: 'slov', Aspect: 'impf' };

  const result = await check(fields);

  expect(result).toEqual({
    errors: [],
    reviewWarnings: [],
    notices: ['note "ru:тест:general": Aspect not checked (not in the dictionary): блабла́ть.'],
  });
});

it.each(['impf', 'pf', 'both'])('accepts %s when the verb is biaspectual', async (aspect) => {
  const fields = { Word: 'испо́льзовать', Kind: 'slov', Aspect: aspect };

  const result = await check(fields);

  expect(result.errors).toEqual([]);
  expect(result.reviewWarnings).toEqual([]);
  expect(result.notices).toEqual(
    aspect === 'both'
      ? []
      : [
          `note "ru:тест:general": the dictionary lists "испо́льзовать" as biaspectual (both); "${aspect}" is accepted.`,
        ],
  );
});

it.each([
  ['засы́пать', 'pf', false],
  ['засыпа́ть', 'pf', true],
  ['засыпать', 'pf', false],
  ['засыпать', 'impf', false],
  ['засыпать', 'both', true],
])('resolves %s as %s using written stress', async (word, aspect, rejected) => {
  const fields = { Word: word, Kind: 'slov', Aspect: aspect };

  const result = await check(fields);

  expect(result.errors.length > 0).toBe(rejected);
});

it('checks the first token when a phrase is headed by a verb', async () => {
  const fields = { Word: 'ИМЕ́ТЬ в виду́'.normalize('NFD'), Kind: 'slov', Aspect: 'pf' };

  const result = await check(fields);

  expect(result.errors).toEqual([
    'note "ru:тест:general": aspect is "pf", but the dictionary has "име́ть" as "impf". Fix aspect.',
  ]);
});

it.each([
  ['чита́ть', true],
  ['читать, де́лать', false],
  ['де́лать', false],
])('requests partner review only when none of %s match', async (partner, warn) => {
  const fields = { Word: 'сде́лать', Kind: 'slov', Aspect: 'pf', Partner: partner };

  const result = await check(fields);

  expect(result.errors).toEqual([]);
  expect(result.reviewWarnings).toEqual(
    warn
      ? [
          'note "ru:тест:general": partner "чита́ть" differs from the dictionary (де́лать). Check partner.',
        ]
      : [],
  );
});

it('allows an unlisted partner when the dictionary has no partners', async () => {
  const fields = { Word: 'име́ть', Kind: 'slov', Aspect: 'impf', Partner: 'заиме́ть' };

  const result = await check(fields);

  expect(result.reviewWarnings).toEqual([]);
});

it.each(
  MOTION_PAIRS.flatMap(([unidir, multidir]) => [
    [unidir, 'unidir'],
    [multidir, 'multidir'],
  ]),
)('requires %s to have motion = %s', async (word, motion) => {
  const fields = { Word: word, Kind: 'slov', Aspect: 'impf' };

  const missing = await check(fields);
  const wrong = await check({ ...fields, Motion: motion === 'unidir' ? 'multidir' : 'unidir' });
  const correct = await check({ ...fields, Motion: motion });

  expect(missing.errors).toEqual([
    `note "ru:тест:general": motion verb "${word}" needs motion = "${motion}".`,
  ]);
  expect(wrong.errors).toEqual(missing.errors);
  expect(correct.errors).toEqual([]);
});

it.each(['прийти́', 'блабла́ть'])(
  'rejects motion when %s is outside the unprefixed table',
  async (word) => {
    const fields = { Word: word, Kind: 'slov', Aspect: 'pf', Motion: 'unidir' };

    const result = await check(fields);

    expect(result.errors).toEqual([
      `note "ru:тест:general": motion is only allowed for the 14 unprefixed paired verbs of motion. Remove motion from "${word}".`,
    ]);
  },
);

it.each([
  ['так де́лать', true],
  ['блабла́ть', false],
  ['кни́га', false],
])('reviews kind for %s when the final verb-like token is known', async (word, warn) => {
  const fields = { Word: word, Kind: 'fráza' };

  const result = await check(fields);

  expect(result.errors).toEqual([]);
  expect(result.reviewWarnings).toEqual(
    warn ? [`note "ru:тест:general": "${word}" looks like a verb; check kind.`] : [],
  );
});
