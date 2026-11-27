import { decompress } from 'fzstd';
import { fetchDictionaryAsset } from '../asset-cache';

export const ASPECTS = ['impf', 'pf', 'both'] as const;
export type Aspect = (typeof ASPECTS)[number];
export const ASPECT_HEADER = 'key\tstressed\taspect\tpartners\tsources';

/** One dictionary headword; homographs can share a key and differ in stress and aspect. */
export interface AspectEntry {
  key: string;
  stressed: string;
  aspect: Aspect;
  partners: string[];
  sources: string;
}

/** Normalizes headwords for matching while preserving ё. */
export function aspectKey(word: string): string {
  return word.normalize('NFC').toLowerCase().replaceAll('\u0301', '');
}

/** An index over the sorted TSV shared with the one-time Anki fixup scripts. */
export class AspectDictionary {
  private readonly entries = new Map<string, AspectEntry[]>();

  constructor(text: string) {
    const [header, ...lines] = text.trimEnd().split('\n');
    if (header !== ASPECT_HEADER) throw new Error('Invalid Russian aspect dictionary header.');
    let previousKey = '';
    for (const line of lines) {
      const columns = line.split('\t');
      const [key, stressed, aspect, partners, sources] = columns;
      if (
        columns.length !== 5 ||
        !key ||
        key !== aspectKey(key) ||
        key < previousKey ||
        !ASPECTS.includes(aspect as Aspect) ||
        !/^(wikt|or|wikt,or)$/.test(sources)
      ) {
        throw new Error(`Invalid Russian aspect dictionary row: ${line}`);
      }
      const entry: AspectEntry = {
        key,
        stressed,
        aspect: aspect as Aspect,
        partners: partners ? partners.split(',').map((partner) => partner.trim()) : [],
        sources,
      };
      const entries = this.entries.get(key);
      if (entries) entries.push(entry);
      else this.entries.set(key, [entry]);
      previousKey = key;
    }
  }

  /** Returns every headword with this lowercase, unstressed spelling. */
  entriesFor(key: string): readonly AspectEntry[] {
    return this.entries.get(key) ?? [];
  }
}

let dictionary: Promise<AspectDictionary> | undefined;

/** Loads the bundled dictionary once, allowing a later validation to retry failed downloads. */
export function loadAspectDictionary(): Promise<AspectDictionary> {
  dictionary ??= downloadDictionary().catch((error: unknown) => {
    dictionary = undefined;
    throw error;
  });
  return dictionary;
}

async function downloadDictionary(): Promise<AspectDictionary> {
  const response = await fetchDictionaryAsset(new URL('./aspects.tsv.zst', import.meta.url));
  if (!response.ok) {
    throw new Error(`Could not load the Russian aspect dictionary: ${response.status}`);
  }
  const compressed = new Uint8Array(await response.arrayBuffer());
  return new AspectDictionary(new TextDecoder().decode(decompress(compressed)));
}
