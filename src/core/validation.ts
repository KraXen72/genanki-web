import Ajv, { type ErrorObject } from 'ajv';
import envelopeSchema from '../../schemas/envelope.schema.json';

export const LIMITS = {
  inputBytes: 4 * 1024 * 1024,
  packBytes: 2 * 1024 * 1024,
  expandedBytes: 8 * 1024 * 1024,
  fileBytes: 512 * 1024,
  files: 64,
  notes: envelopeSchema.properties.notes.maxItems,
  fieldBytes: 32 * 1024,
} as const;

export const ajv = new Ajv({ allErrors: true, strict: true, ownProperties: true });

/** Converts AJV paths to human-readable paths, including missing and unknown fields. */
export function validationErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).slice(0, 30).map((error) => {
    const path = error.instancePath.replace(
      /\/([^/]+)/g,
      (_, part: string) => `.${part.replace(/~1/g, '/').replace(/~0/g, '~')}`,
    );
    const field = error.params.missingProperty ?? error.params.additionalProperty;
    return `${path.slice(1) || 'document'}${field ? `.${field}` : ''}: ${error.message}`;
  });
}

/** Rejects content that cannot be represented safely in Anki's field storage. */
export function checkText(value: unknown, path = 'document'): void {
  if (typeof value === 'string' && /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) {
    throw new Error(`${path}: control characters are not allowed.`);
  }
  if (Array.isArray(value)) value.forEach((item, index) => checkText(item, `${path}.${index}`));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) checkText(item, `${path}.${key}`);
  }
}

/** Measures UTF-8 bytes rather than JavaScript UTF-16 code units. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
