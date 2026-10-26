import { parse } from 'smol-toml';
import { unzipSync } from 'fflate';
import type { ValidateFunction } from 'ajv';
import manifestSchema from '../../schemas/manifest.schema.json';
import envelopeSchema from '../../schemas/envelope.schema.json';
import type { PackManifest } from './manifest.generated';
import type { ExportPayload } from './export.generated';
import { schemaExample } from './prompt';
import { ajv, byteLength, checkText, LIMITS, validationErrors } from './validation';
import { checkSchema, type Schema } from './schema';

export interface Pack {
  manifest: PackManifest;
  schema: Schema;
  prompt: string;
  css: string;
  cards: ExportPayload['model']['cards'];
  validate: ValidateFunction;
}

type PackFiles = Record<string, string>;
const validateManifest = ajv.compile<PackManifest>(manifestSchema);
const decoder = new TextDecoder('utf-8', { fatal: true });

function isSafePath(path: string): boolean {
  const unsafePrefix = path.startsWith('/') || path.includes('\\') || path.includes(':');
  const unsafePart = path.split('/').some((part) => part === '.' || part === '..' || part === '');
  return !unsafePrefix && !unsafePart;
}

function checkFiles(files: PackFiles): void {
  const entries = Object.entries(files);
  if (entries.length > LIMITS.files) throw new Error('Too many pack files.');

  let totalBytes = 0;
  for (const [path, text] of entries) {
    if (!isSafePath(path)) throw new Error(`Unsafe pack path: ${path}`);
    const size = byteLength(text);
    if (size > LIMITS.fileBytes) throw new Error(`Pack file too large: ${path}`);
    totalBytes += size;
  }
  if (totalBytes > LIMITS.expandedBytes) throw new Error('Expanded pack is too large.');
}

function readMember(files: PackFiles, path: string): string {
  if (!isSafePath(path) || !Object.hasOwn(files, path)) {
    throw new Error(`Missing or unsafe pack file: ${path}`);
  }
  return files[path];
}

function parseManifest(text: string): PackManifest {
  const manifest = parse(text);
  if (!validateManifest(manifest)) {
    throw new Error(validationErrors(validateManifest.errors).join('\n'));
  }
  checkText(manifest);

  const fieldNames = manifest.fields.map((field) => field.name);
  const cardNames = manifest.cards.map((card) => card.name);
  if (new Set(fieldNames).size !== fieldNames.length)
    throw new Error('Field names must be unique.');
  if (new Set(cardNames).size !== cardNames.length) throw new Error('Card names must be unique.');

  for (const field of manifest.fields) {
    if (field.format === 'list' && !field.item_path) {
      throw new Error(`List mapping ${field.name} requires item_path.`);
    }
    if (field.format !== 'list' && field.item_path) {
      throw new Error(`Only list mappings support item_path (${field.name}).`);
    }
  }
  if (manifest.destination.deck.split('::').some((part) => !part.trim())) {
    throw new Error('Deck paths must have nonempty components.');
  }

  return manifest;
}

function checkSchemaHeader(schema: Schema, manifest: PackManifest): void {
  const headers = envelopeSchema.required;
  const properties = schema.properties ?? {};
  const hasRequiredHeaders = headers.every((key) => schema.required?.includes(key));
  const hasOnlyHeaders = Object.keys(properties).every((key) => headers.includes(key));
  const exactContract =
    properties.format_version?.const === envelopeSchema.properties.format_version.const &&
    properties.template?.const === manifest.key &&
    properties.template_version?.const === manifest.input_version;
  const noteSchema = properties.notes?.items;
  const hasNoteIds =
    properties.notes?.type === 'array' &&
    noteSchema?.type === 'object' &&
    noteSchema.required?.includes('id');

  if (
    schema.type !== 'object' ||
    !hasRequiredHeaders ||
    !hasOnlyHeaders ||
    !exactContract ||
    !hasNoteIds
  ) {
    throw new Error(
      'Input schema must declare the exact manifest header and require notes with IDs.',
    );
  }
}

function parseInputSchema(text: string, manifest: PackManifest): Schema {
  if (byteLength(text) > 64 * 1024) throw new Error('Input schema exceeds 64 KiB.');
  const schema: Schema = JSON.parse(text);
  checkSchema(schema);
  checkSchemaHeader(schema, manifest);
  return schema;
}

/** Loads bundled and imported packs through the same declarative validation pipeline. */
export function loadPack(files: PackFiles): Pack {
  checkFiles(files);
  const manifest = parseManifest(readMember(files, 'template.toml'));
  const schema = parseInputSchema(readMember(files, manifest.schema), manifest);
  const validate = ajv.compile(schema);
  const cards = manifest.cards.map((card) => ({
    name: card.name,
    qfmt: readMember(files, card.front),
    afmt: readMember(files, card.back),
  }));

  const pack = {
    manifest,
    schema,
    validate,
    cards,
    prompt: readMember(files, manifest.prompt),
    css: readMember(files, manifest.css),
  };
  if (!validate(schemaExample(pack))) {
    const errors = validationErrors(validate.errors).join('\n');
    throw new Error(
      `The schema cannot produce a valid prompt example. Add valid examples annotations.\n${errors}`,
    );
  }

  return pack;
}

function extractZipFiles(bytes: Uint8Array): PackFiles {
  let expandedBytes = 0;
  const names = new Set<string>();
  const members = unzipSync(bytes, {
    filter(file) {
      const path = file.name.endsWith('/') ? file.name.slice(0, -1) : file.name;
      if (!isSafePath(path) || names.has(file.name)) {
        throw new Error(`Unsafe or duplicate ZIP member: ${file.name}`);
      }
      names.add(file.name);
      expandedBytes += file.originalSize;

      const oversized =
        file.originalSize > LIMITS.fileBytes || expandedBytes > LIMITS.expandedBytes;
      if (names.size > LIMITS.files || oversized) {
        throw new Error('Pack ZIP exceeds expanded size or file count limits.');
      }
      return !file.name.endsWith('/');
    },
  });

  const paths = Object.keys(members);
  const manifests = paths.filter(
    (path) => path === 'template.toml' || path.endsWith('/template.toml'),
  );
  if (manifests.length !== 1) throw new Error('A pack ZIP must contain exactly one template.toml.');

  const root = manifests[0].slice(0, -'template.toml'.length);
  if (paths.some((path) => !path.startsWith(root))) {
    throw new Error('All ZIP files must be within the pack root.');
  }

  const files: PackFiles = Object.create(null);
  for (const path of paths) {
    files[path.slice(root.length)] = decoder.decode(members[path]);
  }
  return files;
}

/** Imports a local ZIP without writing files or rendering its HTML/CSS. */
export function importPack(bytes: Uint8Array): Pack {
  if (bytes.byteLength > LIMITS.packBytes) throw new Error('Pack ZIP exceeds 2 MiB.');
  return loadPack(extractZipFiles(bytes));
}

const bundledFiles = import.meta.glob(
  ['../../templates/**/*', '!../../templates/**/note.schema.json'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as PackFiles;

/** Returns fresh in-memory pack objects; no user content or imports are persisted. */
export function bundledPacks(): Pack[] {
  const groups = new Map<string, PackFiles>();

  for (const [path, text] of Object.entries(bundledFiles)) {
    const relativePath = path.slice('../../templates/'.length);
    const separator = relativePath.indexOf('/');
    const key = relativePath.slice(0, separator);
    const member = relativePath.slice(separator + 1);
    if (!groups.has(key)) groups.set(key, Object.create(null));
    groups.get(key)![member] = text;
  }

  return [...groups.values()].map(loadPack);
}
