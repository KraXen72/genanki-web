import type { Pack } from '../core/packs';
import { getPath } from '../core/paths';
import { checkRussianStress } from './ru-stress';
import { loadStressDictionary } from './ru-stress/dictionary';
import { checkRussianAspect } from './ru-aspect';
import { loadAspectDictionary } from './ru-aspect/dictionary';

/** A note's raw input values, keyed by the validator's declared Anki field names. */
export interface CheckedNote {
  noteId: string;
  fields: Record<string, string>;
}

/** Separates blocking dictionary facts, review warnings, and informational notices. */
export interface ValidatorResult {
  errors: string[];
  /** Possible problems the user must confirm before exporting. */
  reviewWarnings: string[];
  /** Information that does not need a decision, such as what could not be checked. */
  notices: string[];
}

type Validator = (notes: CheckedNote[]) => Promise<ValidatorResult>;
type ValidatorName = NonNullable<Pack['manifest']['validators']>[number]['name'];

// packs select validators by name because imported packs cannot run their own code
const validators: Record<ValidatorName, Validator> = {
  'ru-stress': checkRussianStress,
  'ru-aspect': checkRussianAspect,
};

function collectNotes(
  notes: Record<string, unknown>[],
  pack: Pack,
  fieldNames: string[],
): CheckedNote[] {
  const mappings = pack.manifest.fields.filter((field) => fieldNames.includes(field.name));

  return notes.map((note) => {
    const fields: Record<string, string> = {};
    for (const field of mappings) {
      const value = getPath(note, field.path);
      if (typeof value === 'string') fields[field.name] = value;
    }
    return { noteId: note.id as string, fields };
  });
}

/** Runs the validators a pack opted into. Packs that declare none get an empty result. */
export async function runValidators(
  pack: Pack,
  notes: Record<string, unknown>[],
): Promise<ValidatorResult> {
  const results = await Promise.all(
    (pack.manifest.validators ?? []).map(({ name, fields }) => {
      return validators[name](collectNotes(notes, pack, fields));
    }),
  );

  return {
    errors: results.flatMap((result) => result.errors),
    reviewWarnings: results.flatMap((result) => result.reviewWarnings),
    notices: results.flatMap((result) => result.notices),
  };
}

/** Starts downloading validator data in the background, so the first validation is not slowed. */
export function preloadValidators(): void {
  // a failed download is retried and reported by the validation that needs it
  loadStressDictionary().catch(() => {});
  loadAspectDictionary().catch(() => {});
}
