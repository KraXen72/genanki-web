/**
 * Reads stressed word forms from OpenRussian's public database on TogetherDB.
 *
 * The GitHub CSVs from 2020 lack newer words and the declined forms of participles. The
 * TogetherDB export is newer but stopped updating on 2026-01-06, although the website itself
 * still receives new words.
 */

const SOURCE_URL =
  'https://worker.togetherdb.com/connections/fwoedz5fvtwvq03v/databases/openrussian_public';

async function downloadTable(table) {
  const exportUrl = `${SOURCE_URL}/tables/${table}/export?expand=false&filter=&separator=%2C`;
  const exportResponse = await fetch(exportUrl, { method: 'POST' });
  if (!exportResponse.ok) throw new Error(`Could not export ${table}: ${exportResponse.status}`);
  const { result } = await exportResponse.json();

  const response = await fetch(`https://worker.togetherdb.com/exports/${result.exportKey}`);
  if (!response.ok) throw new Error(`Could not download ${table}: ${response.status}`);

  return await response.text();
}

/** Parses CSV with quoted fields, which can contain commas, quotes and line breaks. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') field += text[++i];
      else inQuotes = false;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || row.length) rows.push([...row, field]);

  return rows;
}

/** Turns CSV rows into objects keyed by the header names. */
function parseTable(text) {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ''));
  return rows.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index]])));
}

/**
 * Cells can hold several comma-separated forms, such as "ко'фтой, ко'фтою". OpenRussian marks
 * stress with an apostrophe after the stressed vowel.
 */
export function splitApostropheForms(cell) {
  return (cell ?? '').toLowerCase().split(/[,;/\s]+/);
}

/**
 * Downloads the headwords and inflected forms of all words that are not disabled.
 *
 * Forms keep OpenRussian's apostrophe stress marks. `newestWord` is the date the newest word was
 * added, to record which state of the database the dictionary was built from.
 */
export async function downloadOpenRussianForms() {
  const [wordsCsv, wordFormsCsv] = await Promise.all([
    downloadTable('words'),
    downloadTable('words_forms'),
  ]);
  const words = parseTable(wordsCsv);
  const wordForms = parseTable(wordFormsCsv);

  const enabledWords = words.filter((word) => word.disabled !== '1');
  const enabledIds = new Set(enabledWords.map((word) => word.id));
  const enabledForms = wordForms.filter((wordForm) => enabledIds.has(wordForm.word_id));

  const forms = new Set([
    ...enabledWords.flatMap((word) => splitApostropheForms(word.accented)),
    ...enabledForms.flatMap((wordForm) => splitApostropheForms(wordForm.form)),
  ]);
  const newestWord = words.map((word) => word.created_at ?? '').reduce((a, b) => (a > b ? a : b));

  return { forms: [...forms], newestWord };
}
