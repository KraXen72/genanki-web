/**
 * Builds the dictionary used by the ru-stress validator.
 *
 * Usage: node scripts/build-ru-stress.mjs [path/to/raw-wiktextract-data.jsonl.gz]
 *
 * The dictionary combines three sources:
 * 1. English Wiktionary, which is updated every week, gives the base stress of each spelling.
 * 2. OpenRussian adds spellings that Wiktionary lacks. Where Wiktionary has the spelling,
 *    OpenRussian's stress is ignored, because Wiktionary is more often right when they disagree.
 * 3. `supplement.txt` adds hand-picked forms that both sources lack.
 *
 * A spelling can have several accepted stresses, such as "за́мок" and "замо́к", so the rule
 * compares whole spellings, not single forms.
 *
 * The text has one sorted stressed word form per line. Each line starts with one base-36
 * character: how many leading characters it shares with the previous form. The script writes it
 * compressed with zstd, which the app decompresses after downloading it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { constants, zstdCompressSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { downloadOpenRussianForms, splitApostropheForms } from './ru-stress/openrussian.mjs';
import { readWiktionaryForms, WIKTIONARY_URL } from './ru-stress/wiktionary.mjs';

const DIRECTORY = 'src/validators/ru-stress';
const STRESS_MARK = '\u0301';
const MAX_SHARED_LENGTH = 35;

/** Keeps forms with exactly one stress mark; ё is left out because it already shows the stress. */
function isUsableForm(form) {
  return /^[а-я]*[аеиоуыэюя]\u0301[а-я]*$/.test(form);
}

function removeStress(form) {
  return form.replace(STRESS_MARK, '');
}

function fromApostrophes(forms) {
  return forms.map((form) => form.replace("'", STRESS_MARK));
}

function parseSupplement(text) {
  const entries = text.split('\n').filter((line) => !line.startsWith('#'));
  return splitApostropheForms(entries.join(' '));
}

/** Adds the forms of `secondary` whose spelling `primary` lacks. */
function fillMissingSpellings(primary, secondary) {
  const knownSpellings = new Set(primary.map(removeStress));
  const missing = secondary.filter((form) => !knownSpellings.has(removeStress(form)));

  return [...primary, ...missing];
}

function frontCode(forms) {
  let previous = '';

  return forms.map((form) => {
    let sharedLength = 0;
    while (
      sharedLength < MAX_SHARED_LENGTH &&
      sharedLength < previous.length &&
      previous[sharedLength] === form[sharedLength]
    ) {
      sharedLength++;
    }
    previous = form;

    return sharedLength.toString(36) + form.slice(sharedLength);
  });
}

/** Writes stress data from collected sources, allowing aspect and stress to share one dump pass. */
export async function writeStressDictionary(wiktionary, openRussian) {
  const supplementText = await readFile(`${DIRECTORY}/supplement.txt`, 'utf8');
  const wiktionaryForms = wiktionary.forms.filter(isUsableForm);
  const openRussianForms = fromApostrophes(openRussian.forms).filter(isUsableForm);
  const supplementForms = fromApostrophes(parseSupplement(supplementText)).filter(isUsableForm);

  const combined = [...fillMissingSpellings(wiktionaryForms, openRussianForms), ...supplementForms];
  const forms = [...new Set(combined)].sort();
  const text = `${frontCode(forms).join('\n')}\n`;
  const compressed = zstdCompressSync(Buffer.from(text), {
    params: { [constants.ZSTD_c_compressionLevel]: 19, [constants.ZSTD_c_checksumFlag]: 1 },
  });
  await writeFile(`${DIRECTORY}/dictionary.txt.zst`, compressed);

  console.log(`Wrote ${forms.length} stress forms, ${compressed.length} bytes compressed.`);
  console.log(`Wiktionary: ${wiktionaryForms.length} forms from ${WIKTIONARY_URL}`);
  console.log(`  version (Last-Modified): ${wiktionary.lastModified}`);
  console.log(
    `OpenRussian: ${openRussianForms.length} forms, newest word ${openRussian.newestWord}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [wiktionary, openRussian] = await Promise.all([
    readWiktionaryForms(process.argv[2]),
    downloadOpenRussianForms(),
  ]);
  await writeStressDictionary(wiktionary, openRussian);
}
