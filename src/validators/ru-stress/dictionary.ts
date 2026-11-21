import { decompress } from 'fzstd';

const STRESS_MARK = '\u0301';
const VOWELS = new Set('аеиоуыэюя');
/** Lines between the points where a lookup can start decoding. */
const BLOCK_SIZE = 64;

/**
 * The sorted list of stressed word forms built by `scripts/build-ru-stress.mjs`.
 *
 * The file stores each form as the length of the prefix it shares with the previous form, plus
 * the rest of the form. So a form can only be decoded from an earlier, fully known form. Loading
 * decodes the whole list once and remembers every 64th form and where its line starts. A lookup
 * then binary-searches those forms and decodes at most 64 lines.
 */
export class StressDictionary {
  private readonly blockForms: string[] = [];
  private readonly blockOffsets: number[] = [];

  constructor(private readonly text: string) {
    let form = '';
    let offset = 0;

    for (let line = 0; offset < text.length; line++) {
      const end = text.indexOf('\n', offset);
      const previous = form;
      form = this.decodeLine(previous, offset, end);

      // binary search would silently miss forms in an unsorted list
      if (line > 0 && form <= previous) {
        throw new Error(`The stress dictionary is not sorted at line ${line + 1}: "${form}".`);
      }
      if (line % BLOCK_SIZE === 0) {
        this.blockForms.push(form);
        this.blockOffsets.push(offset);
      }
      offset = end + 1;
    }
  }

  /** Returns every listed stress of a lowercase word without stress marks, in sorted order. */
  stressesOf(unstressed: string): string[] {
    const forms: string[] = [];

    for (let i = 0; i < unstressed.length; i++) {
      if (!VOWELS.has(unstressed[i])) continue;

      const candidate = unstressed.slice(0, i + 1) + STRESS_MARK + unstressed.slice(i + 1);
      if (this.has(candidate)) forms.push(candidate);
    }

    return forms;
  }

  private has(form: string): boolean {
    const block = this.findBlock(form);
    if (block < 0) return false;

    let current = this.blockForms[block];
    let offset = this.blockOffsets[block];
    for (let line = 0; line < BLOCK_SIZE && offset < this.text.length; line++) {
      const end = this.text.indexOf('\n', offset);
      if (line > 0) current = this.decodeLine(current, offset, end);

      // the list is sorted, so passing the form means it is missing
      if (current >= form) return current === form;
      offset = end + 1;
    }

    return false;
  }

  /** Finds the last block whose first form is not after `form`, or -1 if there is none. */
  private findBlock(form: string): number {
    let low = 0;
    let high = this.blockForms.length - 1;
    if (high < 0 || form < this.blockForms[0]) return -1;

    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.blockForms[middle] <= form) low = middle;
      else high = middle - 1;
    }

    return low;
  }

  private decodeLine(previous: string, offset: number, end: number): string {
    const sharedLength = Number.parseInt(this.text[offset], 36);
    return previous.slice(0, sharedLength) + this.text.slice(offset + 1, end);
  }
}

let dictionary: Promise<StressDictionary> | undefined;

/**
 * Downloads and prepares the stress dictionary once; later calls reuse the result.
 *
 * The zstd file is about a sixteenth of the text's size, and decompressing takes about 20 ms.
 */
export function loadStressDictionary(): Promise<StressDictionary> {
  dictionary ??= downloadDictionary().catch((error: unknown) => {
    // let the next validation try again instead of keeping the failure
    dictionary = undefined;
    throw error;
  });

  return dictionary;
}

async function downloadDictionary(): Promise<StressDictionary> {
  const response = await fetch(new URL('./dictionary.txt.zst', import.meta.url));
  if (!response.ok) {
    throw new Error(`Could not load the Russian stress dictionary: ${response.status}`);
  }

  const compressed = new Uint8Array(await response.arrayBuffer());
  return new StressDictionary(new TextDecoder().decode(decompress(compressed)));
}
