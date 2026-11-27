/**
 * Reads stressed Russian word forms from English Wiktionary, as extracted by wiktextract.
 *
 * kaikki.org publishes the extraction about once a week and keeps no older versions. Like
 * yomidevs/wiktionary-to-yomitan, this reads the raw dump of all languages (about 3 GB gzipped)
 * and keeps the Russian entries; kaikki.org has deprecated its per-language files.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

export const WIKTIONARY_URL = 'https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz';

const ACUTE = '\u0301';
const GRAVE = '\u0300';

/** Tags of forms that are not standard modern spellings, or not spellings at all. */
const EXCLUDED_FORM_TAGS = new Set([
  'romanization',
  'table-tags', // wiktextract bookkeeping, such as "no-table-tags"
  'inflection-template', // template names, such as "ru-noun-table"
  'class', // declension and stress classes, such as "accent-a"
  'misspelling',
  'proscribed',
  'nonstandard',
  'pronunciation-spelling', // such as "фсё"
  'obsolete',
  'archaic',
  'dated',
  'dialectal',
  'regional',
  'Internet',
  'abbreviation',
  'contraction',
  'clipping',
]);

/** If every sense of an entry has one of these tags, none of its forms is used. */
const EXCLUDED_SENSE_TAGS = new Set([
  'misspelling',
  'nonstandard',
  'proscribed',
  'obsolete',
  'archaic',
  'dialectal',
  'pronunciation-spelling',
]);

/** Opens a local copy of the dump, or downloads it while reading. */
async function openDump(localPath) {
  if (localPath) {
    const { mtime } = await stat(localPath);
    return {
      stream: createReadStream(localPath),
      lastModified: `${mtime.toISOString()} (local file)`,
    };
  }

  const response = await fetch(WIKTIONARY_URL);
  if (!response.ok) throw new Error(`Could not download ${WIKTIONARY_URL}: ${response.status}`);

  return {
    stream: Readable.fromWeb(response.body),
    lastModified: response.headers.get('last-modified') ?? 'unknown',
  };
}

function hasOnlyExcludedSenses(entry) {
  const senses = entry.senses ?? [];
  return (
    senses.length > 0 &&
    senses.every((sense) => (sense.tags ?? []).some((tag) => EXCLUDED_SENSE_TAGS.has(tag)))
  );
}

/** Returns the form with only its main stress mark, or nothing if it carries no stress. */
function normalizeForm(form, tags) {
  if (tags.some((tag) => EXCLUDED_FORM_TAGS.has(tag) || tag.startsWith('error-'))) return;

  const normalized = form.normalize('NFC').toLowerCase();
  // a final ъ only appears in spellings from before the 1918 reform
  if (!normalized.includes(ACUTE) || normalized.endsWith('ъ')) return;

  // a grave accent marks secondary stress in compounds, such as "фо̀тоаппара́т"
  return normalized.replaceAll(GRAVE, '');
}

/**
 * Visits modern Russian entries once, letting several dictionary builders share the same stream.
 * Returns the source date for the build log.
 */
export async function readWiktionaryEntries(localPath, visit) {
  const { stream, lastModified } = await openDump(localPath);
  const lines = createInterface({ input: stream.pipe(createGunzip()), crlfDelay: Infinity });

  for await (const line of lines) {
    if (!/"lang_code"\s*:\s*"ru"/.test(line)) continue;
    const entry = JSON.parse(line);
    if (entry.lang_code !== 'ru' || hasOnlyExcludedSenses(entry)) continue;
    visit(entry);
  }

  return { lastModified };
}

/** Adds an entry's accepted stressed forms to a shared build's set. */
export function collectStressForms(entry, forms) {
  for (const { form, tags = [] } of entry.forms ?? []) {
    const normalized = typeof form === 'string' && normalizeForm(form, tags);
    if (normalized) forms.add(normalized);
  }
}

/** Collects stressed headwords and inflections, optionally from a previously downloaded dump. */
export async function readWiktionaryForms(localPath) {
  const forms = new Set();
  const metadata = await readWiktionaryEntries(localPath, (entry) =>
    collectStressForms(entry, forms),
  );
  return { forms: [...forms], ...metadata };
}
