import { expect, it } from 'vitest';
import { checkRussianAspect } from '../src/validators/ru-aspect';
import { AspectDictionary, ASPECT_HEADER, aspectKey } from '../src/validators/ru-aspect/dictionary';

it.each([
  ['де́лать', 'impf', false],
  ['сде́лать', 'impf', true],
  ['засы́пать', 'pf', false],
  ['засыпа́ть', 'pf', true],
  ['засыпать', 'pf', false],
  ['засыпать', 'impf', false],
  ['име́ть в виду́', 'impf', false],
])('checks real-data aspect of %s as %s', async (word, aspect, rejected) => {
  const notes = [
    { noteId: 'ru:реальные-данные:general', fields: { Word: word, Kind: 'slov', Aspect: aspect } },
  ];

  const result = await checkRussianAspect(notes);

  expect(result.errors.length > 0).toBe(rejected);
  expect(result.notices).toEqual([]);
});

it('accepts a specific aspect with a notice when real data lists a biaspectual verb', async () => {
  const notes = [
    {
      noteId: 'ru:использовать:general',
      fields: { Word: 'испо́льзовать', Kind: 'slov', Aspect: 'impf' },
    },
  ];

  const result = await checkRussianAspect(notes);

  expect(result.errors).toEqual([]);
  expect(result.notices).toEqual([
    'note "ru:использовать:general": the dictionary lists "испо́льзовать" as biaspectual (both); "impf" is accepted.',
  ]);
});

it('preserves ё when normalizing dictionary keys', () => {
  const word = 'Ё́ЖИТЬСЯ'.normalize('NFD');
  const dictionary = new AspectDictionary(`${ASPECT_HEADER}\nёжиться\tёжиться\timpf\t\twikt\n`);

  const entries = dictionary.entriesFor(aspectKey(word));

  expect(entries).toEqual([
    { key: 'ёжиться', stressed: 'ёжиться', aspect: 'impf', partners: [], sources: 'wikt' },
  ]);
});

it.each([
  `wrong\n`,
  `${ASPECT_HEADER}\nделать\tде́лать\tunknown\t\twikt\n`,
  `${ASPECT_HEADER}\nсделать\tсде́лать\tpf\t\twikt\nделать\tде́лать\timpf\t\twikt\n`,
])('rejects corrupt dictionary content before it can approve an aspect', (text) => {
  const construct = () => new AspectDictionary(text);

  expect(construct).toThrow(/(header|row)/);
});
