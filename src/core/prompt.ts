import { stringify } from 'smol-toml';
import queuePrompt from '../../prompts/queue.md?raw';

export { queuePrompt };
import type { Pack } from './packs';
import type { Schema } from './schema';

function exampleValue(schema: Schema): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.examples?.length) return schema.examples[0];
  if (schema.enum?.length) return schema.enum[0];

  switch (schema.type) {
    case 'object': {
      const entries = Object.entries(schema.properties).map(([key, child]) => {
        return [key, exampleValue(child as Schema)];
      });
      return Object.fromEntries(entries);
    }
    case 'array': {
      const count = Math.max(1, schema.minItems ?? 1);
      return Array.from({ length: count }, () => exampleValue(schema.items));
    }
    case 'integer':
    case 'number':
      return schema.minimum ?? Math.min(1, schema.maximum ?? 1);
    case 'boolean':
      return false;
    default: {
      const length = Math.max(schema.minLength ?? 1, Math.min(7, schema.maxLength ?? 7));
      return 'REPLACE'.padEnd(length, 'X').slice(0, length);
    }
  }
}

/** Builds a populated example from schema annotations, falling back to bounded placeholders. */
export function schemaExample(pack: Pick<Pack, 'schema'>): Record<string, unknown> {
  return exampleValue(pack.schema) as Record<string, unknown>;
}

function fieldDescription(schema: Schema, path: string, required: boolean): string {
  const type = schema.const !== undefined ? `exactly ${JSON.stringify(schema.const)}` : schema.type;
  const details: string[] = [];

  if (schema.enum) details.push(`one of ${JSON.stringify(schema.enum)}`);
  for (const bound of ['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum']) {
    if (schema[bound] !== undefined) details.push(`${bound}=${schema[bound]}`);
  }
  if (schema.description) details.push(schema.description);
  if (schema.pattern) details.push(`pattern: ${schema.pattern}`);
  if (schema.dependencies) details.push(`paired fields: ${JSON.stringify(schema.dependencies)}`);

  const suffix = details.length ? `; ${details.join('; ')}` : '';
  return `${path || 'document'}: ${required ? 'required' : 'optional'}, ${type}${suffix}`;
}

function fieldReference(schema: Schema, path = '', required = true): string[] {
  const lines = [fieldDescription(schema, path, required)];

  if (schema.type === 'object') {
    for (const [key, child] of Object.entries(schema.properties)) {
      const childPath = path ? `${path}.${key}` : key;
      const childRequired = schema.required?.includes(key) ?? false;
      lines.push(...fieldReference(child as Schema, childPath, childRequired));
    }
  } else if (schema.type === 'array') {
    lines.push(...fieldReference(schema.items, `${path}[]`));
  }

  return lines;
}

/** Assembles one self-contained prompt; the schema-derived TOML structure is always last. */
export function assemblePrompt(pack: Pack): string {
  const { key, input_version: version } = pack.manifest;
  const reference = fieldReference(pack.schema)
    .map((line) => `- ${line}`)
    .join('\n');
  const skeleton = stringify(schemaExample(pack)).trim();
  const comments = [
    '# Schema examples: replace these values with completed queued content.',
    '# Required and optional fields are listed above. Omit absent optional fields.',
    '# Repeat [[notes]] for entries. Keep each note’s nested arrays immediately after it.',
    '# Repeat nested array tables within the cardinality limits listed above.',
  ].join('\n');

  return [
    queuePrompt.trim(),
    `TEMPLATE INSTRUCTIONS\n${pack.prompt.trim()}`,
    `INPUT CONTRACT: ${key}, version ${version}\n${reference}`,
    `TOML STRUCTURE\n\`\`\`toml\n${comments}\n${skeleton}\n\`\`\``,
  ].join('\n\n');
}
