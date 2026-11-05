import Ajv, { type ErrorObject } from 'ajv';
import envelopeSchema from '../../schemas/envelope.schema.json';
import { getPath } from './paths';

export const LIMITS = {
  inputBytes: 4 * 1024 * 1024,
  packBytes: 2 * 1024 * 1024,
  expandedBytes: 8 * 1024 * 1024,
  fileBytes: 512 * 1024,
  files: 64,
  notes: envelopeSchema.properties.notes.maxItems,
  fieldBytes: 32 * 1024,
} as const;

// verbose keeps each failing value on the error, so messages can show what was rejected
export const ajv = new Ajv({ allErrors: true, strict: true, ownProperties: true, verbose: true });

/** Adds the note ID to paths inside notes, because array positions are hard to find in a batch. */
function labelPath(path: string, document: unknown): string {
  const noteIndex = path.match(/^notes\.(\d+)/)?.[1];
  const noteId = noteIndex && getPath(document, `notes.${noteIndex}.id`);

  return typeof noteId === 'string' ? `${path} (note "${noteId}")` : path;
}

/**
 * Finds the text rejected by a "must not contain" pattern such as `^(?!.*::)[^\n]*$`.
 *
 * Note schemas allow only the audited patterns in `schema.ts`, which all have this shape.
 *
 * @returns the distinct rejected texts, or nothing for any other kind of pattern
 */
function findForbiddenText(pattern: string, value: string): string[] {
  const forbidden = pattern.match(/^\^\(\?!(?:\.\*|\[\\s\\S\]\*)(.+)\)[^)]*$/)?.[1];
  if (!forbidden) return [];

  return [...new Set(value.match(new RegExp(forbidden, 'g')))];
}

function describePatternFailure(error: ErrorObject): string {
  const value = String(error.data);
  const forbiddenText = findForbiddenText(error.params.pattern, value);
  if (!forbiddenText.length) {
    return `value ${JSON.stringify(value)} does not match the pattern ${error.params.pattern}.`;
  }

  const quoted = forbiddenText.map((text) => JSON.stringify(text)).join(', ');
  return `contains ${quoted}, which is not allowed. Value: ${JSON.stringify(value)}.`;
}

function describeProblem(error: ErrorObject): string {
  switch (error.keyword) {
    case 'pattern':
      return describePatternFailure(error);
    case 'const':
      return `must be ${JSON.stringify(error.params.allowedValue)}, not ${JSON.stringify(error.data)}.`;
    case 'additionalProperties':
      return 'is not a known field; remove it.';
    default:
      return `${error.message}.`;
  }
}

/**
 * Describes every schema failure on one line: its location, note ID, and what to fix.
 *
 * @param document the validated value, used to name the affected notes
 */
export function validationErrors(
  errors: ErrorObject[] | null | undefined,
  document?: unknown,
): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath.replace(
      /\/([^/]+)/g,
      (_, part: string) => `.${part.replace(/~1/g, '/').replace(/~0/g, '~')}`,
    );
    const field = error.params.missingProperty ?? error.params.additionalProperty;
    const fullPath = `${path.slice(1)}${field ? `${path ? '.' : ''}${field}` : ''}`;
    return `${fullPath ? labelPath(fullPath, document) : 'document'}: ${describeProblem(error)}`;
  });
}

/** Finds content that cannot be represented safely in Anki's field storage. */
export function controlCharacterErrors(document: unknown): string[] {
  function search(value: unknown, path: string): string[] {
    if (typeof value === 'string') {
      const hasControlCharacter = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
      return hasControlCharacter
        ? [`${labelPath(path, document)}: control characters are not allowed.`]
        : [];
    }
    if (!value || typeof value !== 'object') return [];

    return Object.entries(value).flatMap(([key, item]) => {
      return search(item, path ? `${path}.${key}` : key);
    });
  }

  return search(document, '');
}

/** Stops with the full list of problems, one per line, when there are any. */
export function rejectIfAny(errors: string[]): void {
  if (errors.length) throw new Error(errors.join('\n'));
}

/** Measures UTF-8 bytes rather than JavaScript UTF-16 code units. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
