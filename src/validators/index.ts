import type { Pack } from '../core/packs';
import { getPath } from '../core/validation';
import { checkRussianStress } from './ru-stress';

/** One field of one note, passed to a validator. */
export interface CheckedText {
  noteId: string;
  field: string;
  text: string;
}

export interface ValidatorResult {
  /** Possible problems the user must confirm before exporting. */
  reviewWarnings: string[];
  /** Information that does not need a decision, such as what could not be checked. */
  notices: string[];
}

type Validator = (texts: CheckedText[]) => ValidatorResult;
type ValidatorName = NonNullable<Pack['manifest']['validators']>[number]['name'];

// packs select validators by name because imported packs cannot run their own code
const validators: Record<ValidatorName, Validator> = {
  'ru-stress': checkRussianStress,
};

function collectTexts(
  notes: Record<string, unknown>[],
  pack: Pack,
  fieldNames: string[],
): CheckedText[] {
  const fields = pack.manifest.fields.filter((field) => fieldNames.includes(field.name));

  return notes.flatMap((note) => {
    return fields.flatMap((field) => {
      const text = getPath(note, field.path);
      if (typeof text !== 'string') return [];

      return [{ noteId: note.id as string, field: field.name, text }];
    });
  });
}

/** Runs the validators a pack opted into. Packs that declare none get an empty result. */
export function runValidators(pack: Pack, notes: Record<string, unknown>[]): ValidatorResult {
  const results = (pack.manifest.validators ?? []).map(({ name, fields }) => {
    return validators[name](collectTexts(notes, pack, fields));
  });

  return {
    reviewWarnings: results.flatMap((result) => result.reviewWarnings),
    notices: results.flatMap((result) => result.notices),
  };
}
