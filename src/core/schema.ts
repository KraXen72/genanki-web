import type { AnySchemaObject } from 'ajv';
import { bannedTextByPattern } from './banned-text';
import { LIMITS } from './validation';

/** The bounded JSON Schema subset checked at the pack-import boundary. */
export type Schema = AnySchemaObject;

const keywords = new Set([
  '$schema',
  'title',
  'description',
  'examples',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'const',
  'enum',
  'pattern',
  'dependencies',
]);

const supportedTypes: Record<string, true> = {
  object: true,
  array: true,
  string: true,
  integer: true,
  number: true,
  boolean: true,
};

/** Checks local schema rules; traversal separately bounds the whole schema's complexity. */
function checkNodeRules(node: Schema): void {
  if (node.type === undefined && node.const === undefined) {
    throw new Error('Schema fields require a supported type or a scalar const.');
  }
  if (node.type !== undefined && !Object.hasOwn(supportedTypes, node.type)) {
    throw new Error('Unsupported schema type. TOML has no null values or union types.');
  }
  if (node.const !== undefined && !['string', 'number', 'boolean'].includes(typeof node.const)) {
    throw new Error('Schema const values must be strings, numbers, or booleans.');
  }

  for (const key of Object.keys(node)) {
    if (!keywords.has(key)) throw new Error(`Unsupported input schema keyword: ${key}`);
  }
  if (node.pattern && !bannedTextByPattern.has(node.pattern)) {
    throw new Error('Unsupported schema pattern. See docs/packs.md.');
  }

  if (node.type === 'object' && node.additionalProperties !== false) {
    throw new Error('Schema objects must reject unknown properties.');
  }
  if (node.type === 'array' && (!Number.isInteger(node.maxItems) || node.maxItems > LIMITS.notes)) {
    throw new Error('Schema arrays require maxItems ≤ 2000.');
  }
  if (node.enum && node.enum.length > 64) {
    throw new Error('Schema enums are limited to 64 values.');
  }
  if (node.type === 'string' && (!Number.isInteger(node.maxLength) || node.maxLength > 4000)) {
    throw new Error('Schema strings require maxLength ≤ 4000.');
  }
}

/** Enforces the bounded declarative schema subset before handing a pack to AJV. */
export function checkSchema(schema: Schema): void {
  let nodes = 0;

  function visit(node: Schema, depth: number): void {
    if (!node || typeof node !== 'object' || Array.isArray(node) || ++nodes > 512 || depth > 12) {
      throw new Error('Input schema exceeds the supported complexity (512 nodes / 12 levels).');
    }
    checkNodeRules(node);

    if (node.type === 'object') {
      for (const child of Object.values(node.properties ?? {})) visit(child as Schema, depth + 1);
    } else if (node.type === 'array') {
      visit(node.items, depth + 1);
    }
  }

  visit(schema, 0);
}
