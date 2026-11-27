/** Builds aspect data; --stress also builds stress data in the same Wiktionary pass. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants, zstdCompressSync } from 'node:zlib';
import {
  readWiktionaryEntries,
  collectStressForms,
  WIKTIONARY_URL,
} from './ru-stress/wiktionary.mjs';
import { downloadOpenRussianData, downloadOpenRussianForms } from './ru-stress/openrussian.mjs';
import { writeStressDictionary } from './build-ru-stress.mjs';
import {
  wiktionaryAspects,
  openRussianAspects,
  mergeAspects,
  parseSupplement,
  serializeAspects,
} from './ru-aspect/entries.mjs';

const args = process.argv.slice(2);
const withStress = args.includes('--stress');
const localPaths = args.filter((arg) => arg !== '--stress');
if (localPaths.length > 1 || localPaths.some((arg) => arg.startsWith('--'))) {
  throw new Error(
    'Usage: node scripts/build-ru-aspect.mjs [--stress] [raw-wiktextract-data.jsonl.gz]',
  );
}
const directory = 'src/validators/ru-aspect';
const primary = [];
const stressForms = new Set();
const wiktionaryUnknown = new Map();
const openRussianUnknown = new Map();
const [wiktionary, openRussian, supplementText] = await Promise.all([
  readWiktionaryEntries(localPaths[0], (entry) => {
    primary.push(...wiktionaryAspects(entry, wiktionaryUnknown));
    if (withStress) collectStressForms(entry, stressForms);
  }),
  downloadOpenRussianData({ includeVerbs: true, includeForms: withStress }),
  readFile(`${directory}/supplement.tsv`, 'utf8'),
]);
const fallback = openRussianAspects(openRussian, openRussianUnknown);
const { entries, conflicts } = mergeAspects(primary, fallback, parseSupplement(supplementText));
const text = serializeAspects(entries);
const compressed = zstdCompressSync(Buffer.from(text), {
  params: { [constants.ZSTD_c_compressionLevel]: 19, [constants.ZSTD_c_checksumFlag]: 1 },
});
await mkdir('data', { recursive: true });
await writeFile('data/ru-aspect.tsv', text);
await writeFile(`${directory}/aspects.tsv.zst`, compressed);
const provenance = {
  wiktionary: {
    url: WIKTIONARY_URL,
    lastModified: wiktionary.lastModified,
    entries: primary.length,
    unknownAspects: Object.fromEntries(wiktionaryUnknown),
  },
  openRussian: {
    url: 'https://en.openrussian.org/dictionary-data',
    newestWord: openRussian.newestWord,
    entries: fallback.length,
    unknownAspects: Object.fromEntries(openRussianUnknown),
  },
  entries: entries.length,
  conflicts: conflicts.length,
};
await writeFile('data/ru-aspect.sources.json', `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`Wrote ${entries.length} aspect rows, ${compressed.length} bytes compressed.`);
console.log(`Wiktionary: ${primary.length} rows from ${WIKTIONARY_URL}`);
console.log(`  version (Last-Modified): ${wiktionary.lastModified}`);
console.log(`  unknown aspect values: ${JSON.stringify(Object.fromEntries(wiktionaryUnknown))}`);
console.log(`OpenRussian: ${fallback.length} rows, newest word ${openRussian.newestWord}`);
console.log(`  unknown aspect values: ${JSON.stringify(Object.fromEntries(openRussianUnknown))}`);
console.log(`Aspect conflicts (Wiktionary wins): ${conflicts.length}`);
for (const conflict of conflicts.slice(0, 20))
  console.log(`  ${conflict.word}: wikt=${conflict.wiktionary}, or=${conflict.openRussian}`);
if (withStress) {
  await writeStressDictionary(
    { forms: [...stressForms], ...wiktionary },
    await downloadOpenRussianForms(openRussian),
  );
}
