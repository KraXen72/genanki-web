import type { CheckedNote, ValidatorResult } from '..';
import { aspectKey, loadAspectDictionary, type AspectDictionary } from './dictionary';

/** The 14 unprefixed pairs: one-direction verb first, multidirectional verb second. */
export const MOTION_PAIRS = [
  ['идти', 'ходить'],
  ['ехать', 'ездить'],
  ['бежать', 'бегать'],
  ['лететь', 'летать'],
  ['плыть', 'плавать'],
  ['нести', 'носить'],
  ['вести', 'водить'],
  ['везти', 'возить'],
  ['тащить', 'таскать'],
  ['катить', 'катать'],
  ['гнать', 'гонять'],
  ['ползти', 'ползать'],
  ['лезть', 'лазить'],
  ['брести', 'бродить'],
] as const;
const motionByWord = new Map<string, string>(
  MOTION_PAIRS.flatMap(([unidir, multidir]) => [
    [unidir, 'unidir'],
    [multidir, 'multidir'],
  ]),
);

/** Checks verb fields and dictionary facts, requesting review of supplied partner disagreements. */
export async function checkRussianAspect(
  notes: CheckedNote[],
  dictionary?: AspectDictionary,
): Promise<ValidatorResult> {
  const lookup = dictionary ?? (await loadAspectDictionary());
  const result: ValidatorResult = { errors: [], reviewWarnings: [], notices: [] };

  for (const { noteId, fields } of notes) {
    const {
      Word: word = '',
      Kind: kind,
      Aspect: aspect,
      Partner: partner,
      Motion: motion,
    } = fields;
    const prefix = `note "${noteId}":`;
    const normalized = word.normalize('NFC').toLowerCase().trim();
    const tokens = normalized.split(/\s+/u);

    if (kind !== 'slov') {
      for (const field of ['aspect', 'partner', 'motion'] as const) {
        const value = { aspect, partner, motion }[field];
        if (value !== undefined) {
          result.errors.push(
            `${prefix} ${field} is only allowed when kind = "slov". Remove ${field}.`,
          );
        }
      }
      const lastWord = aspectKey(tokens.at(-1) ?? '');
      if (/(?:ть|ти|чь|ться|тись|чься)$/u.test(lastWord) && lookup.entriesFor(lastWord).length) {
        result.reviewWarnings.push(`${prefix} "${word}" looks like a verb; check kind.`);
      }
      continue;
    }

    if (aspect === undefined) {
      result.errors.push(
        `${prefix} kind is "slov" but aspect is missing. Add aspect = "impf" | "pf" | "both".`,
      );
    }

    const expectedMotion = motionByWord.get(aspectKey(normalized));
    if (expectedMotion && motion !== expectedMotion) {
      result.errors.push(`${prefix} motion verb "${word}" needs motion = "${expectedMotion}".`);
    } else if (!expectedMotion && motion !== undefined) {
      result.errors.push(
        `${prefix} motion is only allowed for the 14 unprefixed paired verbs of motion. Remove motion from "${word}".`,
      );
    }

    const headword = tokens[0];
    const entries = lookup.entriesFor(aspectKey(headword));
    const exact = entries.filter((entry) => entry.stressed === headword);
    const matched = exact.length ? exact : entries;
    if (!matched.length) {
      result.notices.push(`${prefix} Aspect not checked (not in the dictionary): ${headword}.`);
      continue;
    }

    const partners = [...new Set(matched.flatMap((entry) => entry.partners))];
    const accepted = new Set(
      matched.flatMap((entry) =>
        entry.aspect === 'both' ? ['impf', 'pf', 'both'] : [entry.aspect],
      ),
    );
    if (aspect !== undefined && !accepted.has(aspect)) {
      const facts = matched
        .map((entry) => `"${entry.stressed || entry.key}" as "${entry.aspect}"`)
        .join(' or ');
      const partnerHint = partners.length ? ` (partner: ${partners.join(', ')})` : '';
      result.errors.push(
        `${prefix} aspect is "${aspect}", but the dictionary has ${facts}${partnerHint}. Fix aspect.`,
      );
    } else if (
      aspect !== undefined &&
      aspect !== 'both' &&
      matched.some((entry) => entry.aspect === 'both')
    ) {
      result.notices.push(
        `${prefix} the dictionary lists "${headword}" as biaspectual (both); "${aspect}" is accepted.`,
      );
    }

    if (partner !== undefined && partners.length) {
      const knownPartners = new Set(partners.map(aspectKey));
      const writtenPartners = partner.split(',').map((value) => aspectKey(value.trim()));
      if (!writtenPartners.some((value) => knownPartners.has(value))) {
        result.reviewWarnings.push(
          `${prefix} partner "${partner}" differs from the dictionary (${partners.join(', ')}). Check partner.`,
        );
      }
    }
  }

  return result;
}
