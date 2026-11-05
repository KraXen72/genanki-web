import type { CheckedText, ValidatorResult } from '..';
import dictionary from './dictionary.txt?raw';

const STRESS_MARK = '\u0301';
const RUSSIAN_WORD = /[\p{Script=Cyrillic}\u0301]+/gu;

/** A stress-marked word found in a note. */
interface StressedWord {
  noteId: string;
  field: string;
  written: string;
  stressed: string;
  unstressed: string;
}

function removeStress(word: string): string {
  return word.replaceAll(STRESS_MARK, '');
}

/** Words without a mark have nothing to check, and ё already shows the stress. */
function findStressedWords({ noteId, field, text }: CheckedText): StressedWord[] {
  const words = text.normalize('NFC').match(RUSSIAN_WORD) ?? [];
  const checkable = words.filter((word) => word.includes(STRESS_MARK) && !/[ёЁ]/.test(word));

  return checkable.map((written) => {
    const stressed = written.toLowerCase();
    return { noteId, field, written, stressed, unstressed: removeStress(stressed) };
  });
}

/**
 * Finds the accepted stress of each word.
 *
 * Scanning the dictionary on each run avoids keeping over 500,000 strings in memory.
 * `scripts/build-ru-stress.mjs` documents the file format.
 */
function lookUpStress(unstressedWords: Set<string>): Map<string, string[]> {
  const acceptedForms = new Map<string, string[]>();
  let form = '';

  for (const line of dictionary.trimEnd().split('\n')) {
    const sharedLength = Number.parseInt(line[0], 36);
    form = form.slice(0, sharedLength) + line.slice(1);

    const unstressed = removeStress(form);
    if (!unstressedWords.has(unstressed)) continue;
    acceptedForms.set(unstressed, [...(acceptedForms.get(unstressed) ?? []), form]);
  }

  return acceptedForms;
}

function describeWrongStress(word: StressedWord, acceptedForms: string[]): string {
  const accepted = acceptedForms.map((form) => `"${form}"`).join(' or ');

  return `note "${word.noteId}", ${word.field}: "${word.written}" has unexpected stress; the dictionary has ${accepted}.`;
}

/** Warns about stress marks that differ from the dictionary. Words it lacks are only counted. */
export function checkRussianStress(texts: CheckedText[]): ValidatorResult {
  const words = texts.flatMap(findStressedWords);
  const acceptedForms = lookUpStress(new Set(words.map((word) => word.unstressed)));

  const wrongStress = words.filter((word) => {
    return acceptedForms.get(word.unstressed)?.includes(word.stressed) === false;
  });
  const uncheckedWords = new Set(
    words.filter((word) => !acceptedForms.has(word.unstressed)).map((word) => word.stressed),
  );

  const notices = uncheckedWords.size
    ? [`Stress not checked (not in the dictionary): ${[...uncheckedWords].join(', ')}.`]
    : [];

  return {
    reviewWarnings: wrongStress.map((word) => {
      return describeWrongStress(word, acceptedForms.get(word.unstressed)!);
    }),
    notices,
  };
}
