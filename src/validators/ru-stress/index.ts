import { loadStressDictionary, type StressDictionary } from './dictionary';
import type { CheckedText, ValidatorResult } from '..';

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

function lookUpStress(
  dictionary: StressDictionary,
  unstressedWords: Set<string>,
): Map<string, string[]> {
  const acceptedForms = new Map<string, string[]>();

  for (const unstressed of unstressedWords) {
    const forms = dictionary.stressesOf(unstressed);
    if (forms.length) acceptedForms.set(unstressed, forms);
  }

  return acceptedForms;
}

function describeWrongStress(word: StressedWord, acceptedForms: string[]): string {
  const accepted = acceptedForms.map((form) => `"${form}"`).join(' or ');

  return `note "${word.noteId}", ${word.field}: "${word.written}" has unexpected stress; the dictionary has ${accepted}.`;
}

/** Warns about stress marks that differ from the dictionary. Words it lacks are only counted. */
export async function checkRussianStress(texts: CheckedText[]): Promise<ValidatorResult> {
  const words = texts.flatMap(findStressedWords);
  const unstressedWords = new Set(words.map((word) => word.unstressed));
  const acceptedForms = lookUpStress(await loadStressDictionary(), unstressedWords);

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
