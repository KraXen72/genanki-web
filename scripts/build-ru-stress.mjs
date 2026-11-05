/**
 * Builds the dictionary used by the ru-stress validator.
 *
 * The output has one sorted stressed word form per line. Each line starts with one base-36
 * character: how many leading characters it shares with the previous form. This keeps the file
 * small enough to bundle while staying plain text.
 */
import { readFile, writeFile } from 'node:fs/promises';

// pinned so that rebuilding only changes the dictionary on purpose
const SOURCE_COMMIT = '50e210c4803237779cb562bc1abcea529066031c';
const SOURCE_URL = `https://raw.githubusercontent.com/Badestrand/russian-dictionary/${SOURCE_COMMIT}`;
const SOURCE_FILES = ['adjectives.csv', 'nouns.csv', 'others.csv', 'verbs.csv'];
const DIRECTORY = 'src/validators/ru-stress';
const STRESS_MARK = '\u0301';
const MAX_SHARED_LENGTH = 35;
const TRANSLATION_COLUMNS = new Set(['translations_en', 'translations_de']);

async function downloadTable(file) {
  const response = await fetch(`${SOURCE_URL}/${file}`);
  if (!response.ok) throw new Error(`Could not download ${file}: ${response.status}`);

  return await response.text();
}

/** Cells can hold several comma-separated forms, such as "ко'фтой, ко'фтою". */
function stressedForms(table) {
  const [header, ...rows] = table.split('\n').map((row) => row.split('\t'));
  const formColumns = header.flatMap((name, index) => {
    return TRANSLATION_COLUMNS.has(name) || name === 'bare' ? [] : [index];
  });

  return rows.flatMap((row) => {
    return formColumns.flatMap((index) => (row[index] ?? '').toLowerCase().split(/[,;/\s]+/));
  });
}

/** Keeps forms with exactly one stress mark; ё is left out because it already shows the stress. */
function isUsableForm(form) {
  return /^[а-я]*[аеиоуыэюя]'[а-я]*$/.test(form);
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

function parseSupplement(text) {
  const entries = text.split('\n').filter((line) => !line.startsWith('#'));
  return entries.join(' ').toLowerCase().split(/\s+/);
}

const tables = await Promise.all(SOURCE_FILES.map(downloadTable));
const supplement = await readFile(`${DIRECTORY}/supplement.txt`, 'utf8');

const allForms = [...tables.flatMap(stressedForms), ...parseSupplement(supplement)];
const usableForms = allForms.filter(isUsableForm);
const stressMarkedForms = usableForms.map((form) => form.replace("'", STRESS_MARK));
const forms = [...new Set(stressMarkedForms)].sort();

await writeFile(`${DIRECTORY}/dictionary.txt`, `${frontCode(forms).join('\n')}\n`);
console.log(`Wrote ${forms.length} forms.`);
