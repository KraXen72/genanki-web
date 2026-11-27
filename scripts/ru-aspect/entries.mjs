const ACUTE = '\u0301';
export const HEADER = 'key\tstressed\taspect\tpartners\tsources';

/** Normalizes a source's Cyrillic headword, retaining ё and the main stress mark. */
export function normalizeHeadword(value) {
  const word = String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replaceAll("'", ACUTE)
    .replaceAll('\u0300', '')
    .trim();
  return /^[а-яё\u0301]+$/u.test(word) ? word : '';
}

function keyOf(word) {
  return word.replaceAll(ACUTE, '');
}

function stressedForm(word) {
  return word.includes(ACUTE) ||
    word.includes('ё') ||
    (word.match(/[аеиоуыэюя]/g) ?? []).length <= 1
    ? word
    : '';
}

/** Recognizes template suffixes such as impf-intr and the public export's long aspect names. */
export function normalizeAspect(value) {
  const text = String(value ?? '')
    .toLowerCase()
    .trim();
  const aliases = { imperfective: 'impf', perfective: 'pf', biaspectual: 'both' };
  return aliases[text] ?? text.match(/^(impf|pf|both)(?:-|$)/)?.[1];
}

function countUnknown(counts, value) {
  const key = String(value || '(missing)');
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Extracts verb headwords, aspect, and opposite-aspect partners from one modern Russian entry.
 * @returns {import('../../src/validators/ru-aspect/dictionary').AspectEntry[]}
 */
export function wiktionaryAspects(entry, unknownAspects = new Map()) {
  if (entry.pos !== 'verb') return [];
  const templates = (entry.head_templates ?? []).filter((template) => template.name === 'ru-verb');
  const templateAspects = templates
    .map((template) => normalizeAspect(template.args?.['2']))
    .filter(Boolean);
  const tags = new Set([
    ...(entry.tags ?? []),
    ...(entry.senses ?? []).flatMap((sense) => sense.tags ?? []),
  ]);
  const tagAspect =
    tags.has('imperfective') && tags.has('perfective')
      ? 'both'
      : tags.has('imperfective')
        ? 'impf'
        : tags.has('perfective')
          ? 'pf'
          : undefined;
  const aspect =
    templateAspects.includes('both') ||
    (templateAspects.includes('impf') && templateAspects.includes('pf'))
      ? 'both'
      : (templateAspects[0] ?? tagAspect);
  if (!aspect) {
    countUnknown(unknownAspects, templates.map((template) => template.args?.['2']).join(', '));
    return [];
  }

  const forms = entry.forms ?? [];
  const canonical = forms
    .filter((form) => form.tags?.includes('canonical'))
    .map((form) => form.form);
  const headwords = canonical.length
    ? canonical
    : templates.map((template) => template.args?.['1']).filter(Boolean);
  if (!headwords.length) headwords.push(entry.word);
  const partners = forms
    .filter(
      (form) =>
        !form.tags?.includes('canonical') &&
        form.tags?.some((tag) => tag === 'perfective' || tag === 'imperfective'),
    )
    .map((form) => form.form);
  for (const template of templates) {
    for (const [argument, value] of Object.entries(template.args ?? {})) {
      if (/^(?:pf|impf)\d*$/.test(argument)) partners.push(...String(value).split(/[,;]/));
    }
  }
  const normalizedPartners = [...new Set(partners.map(normalizeHeadword).filter(Boolean))].sort();
  return [...new Set(headwords.map(normalizeHeadword).filter(Boolean))].map((word) => ({
    key: keyOf(word),
    stressed: stressedForm(word),
    aspect,
    partners: normalizedPartners.filter((partner) => partner !== word),
    sources: 'wikt',
  }));
}

/**
 * Joins enabled verb words to the verbs table and restores partner stress from word metadata.
 * @returns {import('../../src/validators/ru-aspect/dictionary').AspectEntry[]}
 */
export function openRussianAspects(data, unknownAspects = new Map()) {
  const words = data.words.filter(
    (word) => !['1', 'true'].includes(String(word.disabled).toLowerCase()),
  );
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const stressedByKey = new Map();
  for (const word of words) {
    const accented = normalizeHeadword(word.accented);
    if (accented) stressedByKey.set(keyOf(accented), accented);
  }
  const entries = [];
  for (const verb of data.verbs) {
    const word = wordsById.get(verb.word_id);
    if (word?.type !== 'verb') continue;
    const aspect = normalizeAspect(verb.aspect);
    if (!aspect) {
      countUnknown(unknownAspects, verb.aspect);
      continue;
    }
    const headword = normalizeHeadword(word.accented);
    if (!headword) continue;
    const partners = String(verb.partner ?? '')
      .split(/[,;/\s]+/)
      .map((value) => {
        const reference = wordsById.get(value.trim());
        const form = normalizeHeadword(reference?.accented ?? value);
        return form.includes(ACUTE) || form.includes('ё')
          ? form
          : (stressedByKey.get(keyOf(form)) ?? form);
      })
      .filter(Boolean);
    entries.push({
      key: keyOf(headword),
      stressed: stressedForm(headword),
      aspect,
      partners: [...new Set(partners)].sort(),
      sources: 'or',
    });
  }
  return entries;
}

function headwordId(entry) {
  return `${entry.key}\t${entry.stressed}`;
}

/** Keeps Wiktionary's facts per stressed headword and applies manual overrides last. */
export function mergeAspects(wiktionary, openRussian, supplement = []) {
  const primary = new Map();
  for (const entry of wiktionary) {
    const id = headwordId(entry);
    const entries = primary.get(id) ?? [];
    const sameAspect = entries.find((candidate) => candidate.aspect === entry.aspect);
    if (sameAspect)
      sameAspect.partners = [...new Set([...sameAspect.partners, ...entry.partners])].sort();
    else entries.push({ ...entry, partners: [...entry.partners] });
    primary.set(id, entries);
  }
  const conflicts = [];
  const fallback = new Map();
  for (const entry of openRussian) {
    const id = headwordId(entry);
    const known = primary.get(id);
    if (known) {
      if (!known.some((candidate) => candidate.aspect === entry.aspect))
        conflicts.push({
          word: entry.stressed || entry.key,
          wiktionary: known.map((candidate) => candidate.aspect).join('/'),
          openRussian: entry.aspect,
        });
      for (const candidate of known) candidate.sources = 'wikt,or';
    } else {
      const identity = `${id}\t${entry.aspect}`;
      const previous = fallback.get(identity);
      fallback.set(identity, {
        ...entry,
        partners: [...new Set([...(previous?.partners ?? []), ...entry.partners])].sort(),
      });
    }
  }
  const overridden = new Set(supplement.map(headwordId));
  const entries = [...[...primary.values()].flat(), ...fallback.values()].filter(
    (entry) => !overridden.has(headwordId(entry)),
  );
  entries.push(...supplement);
  entries.sort((left, right) => {
    const a = `${headwordId(left)}\t${left.aspect}`;
    const b = `${headwordId(right)}\t${right.aspect}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return { entries, conflicts };
}

/** Reads manual rows in the same format as the generated dictionary, allowing comments. */
export function parseSupplement(text) {
  const lines = text.split('\n').filter((line) => line && !line.startsWith('#'));
  if (lines.shift() !== HEADER) throw new Error('Invalid aspect supplement header.');
  return lines.map((line) => {
    const [key, stressed, aspect, partners, sources, extra] = line.split('\t');
    if (
      extra !== undefined ||
      !key ||
      key !== keyOf(normalizeHeadword(key)) ||
      !['impf', 'pf', 'both'].includes(aspect) ||
      !/^(wikt|or|wikt,or)$/.test(sources ?? '')
    ) {
      throw new Error(`Invalid aspect supplement row: ${line}`);
    }
    return {
      key,
      stressed,
      aspect,
      partners: partners ? partners.split(',').map((partner) => partner.trim()) : [],
      sources,
    };
  });
}

/** Serializes deterministically so the compressed and Python-facing files contain identical rows. */
export function serializeAspects(entries) {
  return `${HEADER}\n${entries.map((entry) => [entry.key, entry.stressed, entry.aspect, entry.partners.join(','), entry.sources].join('\t')).join('\n')}\n`;
}
