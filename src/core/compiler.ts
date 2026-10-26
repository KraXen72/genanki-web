import { parse } from 'smol-toml';
import envelopeSchema from '../../schemas/envelope.schema.json';
import type { ExportPayload } from './export.generated';
import type { Pack } from './packs';
import { ajv, byteLength, checkText, LIMITS, validationErrors } from './validation';

const validateEnvelope = ajv.compile(envelopeSchema);
const htmlEntities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
type InputNote = Record<string, unknown>;
type FieldMapping = Pack['manifest']['fields'][number];

export interface Compilation {
  payload: ExportPayload;
  cardCount: number;
  duplicates: number;
  warnings: string[];
}

/** Escapes content once, before it reaches Anki; Python preserves these field strings. */
export function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

function getPath(value: unknown, path: string): unknown {
  let current = value;

  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function compileScalar(value: unknown, path: string): string {
  if (value === undefined) return '';

  const isScalar = ['string', 'number', 'boolean'].includes(typeof value);
  if (!isScalar) {
    throw new Error(`Mapping ${path} requires a string, number, or boolean.`);
  }

  return escapeText(String(value));
}

function compileList(value: unknown, field: FieldMapping): string {
  if (!Array.isArray(value)) {
    throw new Error(`Mapping ${field.path} requires an array.`);
  }

  return value
    .map((item, index) => {
      const itemValue = getPath(item, field.item_path!);
      const content = compileScalar(itemValue, `${field.path}.${index}.${field.item_path}`);
      const row = index + 1;
      return `<div class="${field.name}" style="grid-row: ${row}">${content}</div>`;
    })
    .join('');
}

function compileField(note: InputNote, field: FieldMapping): string {
  const value = getPath(note, field.path);
  let content =
    field.format === 'list' ? compileList(value, field) : compileScalar(value, field.path);

  if (field.format === 'lines') {
    content = content.replace(/\r\n|\r|\n/g, '<br>');
  }
  if (byteLength(content) > LIMITS.fieldBytes) {
    throw new Error(`Compiled field ${field.name} exceeds 32 KiB.`);
  }

  return content;
}

/** Sorts object keys so TOML table/property ordering does not affect duplicate checks. */
function canonicalContent(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(canonicalContent));
  }
  if (value && typeof value === 'object') {
    const sortedEntries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const entries = sortedEntries.map(([key, item]) => [key, canonicalContent(item)]);
    return JSON.stringify(entries);
  }

  return JSON.stringify(value);
}

function deduplicateNotes(notes: InputNote[]) {
  const accepted = new Map<string, InputNote>();
  let duplicates = 0;

  for (const [index, note] of notes.entries()) {
    const id = note.id as string;
    if (!id.trim()) throw new Error(`notes.${index}.id: must not be blank.`);

    const existing = accepted.get(id);
    if (!existing) {
      accepted.set(id, note);
      continue;
    }
    if (canonicalContent(existing) !== canonicalContent(note)) {
      throw new Error(`notes.${index}.id: conflicting content for ID "${id}".`);
    }
    duplicates++;
  }

  return { notes: [...accepted.values()], duplicates };
}

function duplicateContentWarnings(notes: InputNote[]): string[] {
  const seenContent = new Set<string>();
  const warnings: string[] = [];

  for (const note of notes) {
    const { id, source: _source, ...content } = note;
    const signature = canonicalContent(content);
    if (seenContent.has(signature)) {
      warnings.push(
        `ID "${id}" has the same content as another ID. Check whether these are separate entries.`,
      );
    }
    seenContent.add(signature);
  }

  return warnings;
}

function resolveDeckName(pack: Pack, notes: InputNote[]): string {
  const { policy, deck } = pack.manifest.destination;
  const baseDeck = deck
    .split('::')
    .map((part) => part.normalize('NFC').trim())
    .join('::');
  if (policy === 'fixed') return baseDeck;

  const sources = notes.map((note) => {
    return typeof note.source === 'string' ? note.source.normalize('NFC').trim() : '';
  });
  const allShareSource = sources[0] && sources.every((source) => source === sources[0]);
  const destination = allShareSource ? sources[0] : 'Mix';

  return `${baseDeck}::${destination}`;
}

/** Hashes the normalized full deck path into a positive 52-bit, JS-safe Anki ID. */
export async function deckId(path: string): Promise<number> {
  const input = new TextEncoder().encode(`anki-deck:v1:${path}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return Number.parseInt(hex.slice(0, 13), 16) || 1;
}

function parseBatch(input: string, unwrapFence: boolean) {
  if (byteLength(input) > LIMITS.inputBytes) {
    throw new Error('TOML input exceeds 4 MiB.');
  }

  let text = input.trim();
  if (unwrapFence) {
    const fenced = text.match(/^```(?:toml)?\s*\n([\s\S]*?)\n```$/i);
    if (fenced) text = fenced[1];
  }

  const document = parse(text);
  if (!validateEnvelope(document)) {
    throw new Error(validationErrors(validateEnvelope.errors).join('\n'));
  }

  return document;
}

function resolvePack(document: Record<string, unknown>, packs: Pack[]): Pack {
  const pack = packs.find((candidate) => candidate.manifest.key === document.template);
  if (!pack) {
    throw new Error(
      `Unknown template "${document.template}". Select a bundled pack or import its ZIP.`,
    );
  }
  if (document.template_version !== pack.manifest.input_version) {
    throw new Error(
      `template_version: ${document.template_version} is unsupported for ${document.template}; expected ${pack.manifest.input_version}.`,
    );
  }
  if (!pack.validate(document)) {
    throw new Error(validationErrors(pack.validate.errors).join('\n'));
  }

  return pack;
}

/** Parses a whole batch, rejects invalid/conflicting notes, and compiles ordered Anki fields. */
export async function compileBatch(
  input: string,
  packs: Pack[],
  unwrapFence = true,
): Promise<Compilation> {
  const document = parseBatch(input, unwrapFence);
  const pack = resolvePack(document, packs);
  checkText(document);

  const { notes, duplicates } = deduplicateNotes(document.notes as InputNote[]);
  const deckName = resolveDeckName(pack, notes);
  const model = pack.manifest.model;
  const compiledNotes = notes.map((note) => ({
    id: note.id as string,
    fields: pack.manifest.fields.map((field) => compileField(note, field)),
  }));

  const payload: ExportPayload = {
    packKey: pack.manifest.key,
    model: {
      id: model.id,
      name: model.name,
      fields: pack.manifest.fields.map((field) => field.name),
      cards: pack.cards.map((card) => ({ ...card })),
      css: pack.css,
    },
    deck: { id: await deckId(deckName), name: deckName },
    notes: compiledNotes,
  };

  return {
    payload,
    cardCount: compiledNotes.length * pack.cards.length,
    duplicates,
    warnings: duplicateContentWarnings(notes),
  };
}
