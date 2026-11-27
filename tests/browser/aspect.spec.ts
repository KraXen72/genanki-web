import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { stringify } from 'smol-toml';

const meaning = {
  sk: 'urobiť, spraviť',
  en: 'to do, to make',
  sentence: 'Я сде́лал это сам.',
  translation: 'Urobil som to sám.',
};
const notes = [
  {
    id: 'ru:сделать:general',
    kind: 'slov',
    aspect: 'pf',
    partner: 'де́лать',
    word: 'сде́лать',
    meanings: [meaning],
  },
  {
    id: 'ru:ходить:general',
    kind: 'slov',
    aspect: 'impf',
    motion: 'multidir',
    word: 'ходи́ть',
    meanings: [{ sk: 'chodiť', en: 'to walk' }],
  },
  {
    id: 'ru:тачка:general',
    kind: 'pod.m:ž',
    usage: 'hovorové',
    word: 'та́чка',
    meanings: [{ sk: 'fúrik, auto', en: 'wheelbarrow, car' }],
  },
];
const valid = stringify({
  format_version: 1,
  template: 'russian-vocabulary',
  template_version: 2,
  notes,
});
const invalid = valid.replace('aspect = "pf"', 'aspect = "impf"');
const correction =
  'note "ru:сделать:general": aspect is "impf", but the dictionary has "сде́лать" as "pf" (partner: де́лать). Fix aspect.';

test('exports the v4 specification batch with grammar labels and kind tags', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await page.getByLabel('Paste the completed TOML batch').fill(valid);

  await page.getByRole('button', { name: 'Generate .apkg', exact: true }).click();
  const link = page.getByRole('link', { name: 'Download .apkg' });
  await expect(link).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await link.click();
  const path = testInfo.outputPath('v4.apkg');
  await (await downloaded).saveAs(path);

  execFileSync('python3', [
    '-c',
    `
import json, sqlite3, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None
    data = archive.read('collection.anki2')
with sqlite3.connect(':memory:') as connection:
    connection.deserialize(data)
    models = json.loads(connection.execute('SELECT models FROM col').fetchone()[0])
    model = models['1401682072']
    assert model['name'] == 'Russian vocabulary v4'
    assert [field['name'] for field in model['flds']][:7] == ['ID', 'Word', 'Kind', 'Aspect', 'Partner', 'Motion', 'Usage']
    rows = connection.execute('SELECT flds, tags FROM notes').fetchall()
    notes = {fields.split('\\x1f')[0]: (fields.split('\\x1f')[1:7], set(tags.split())) for fields, tags in rows}
    assert notes == {
        'ru:сделать:general': (['сде́лать', 'sloveso', 'pf.', 'де́лать', '', ''], {'genanki::slov'}),
        'ru:ходить:general': (['ходи́ть', 'sloveso', 'impf.', '', 'multidir.', ''], {'genanki::slov'}),
        'ru:тачка:general': (['та́чка', 'podst. meno, ženský rod', '', '', '', 'hovorové'], {'genanki::pod.m:ž'}),
    }
    assert connection.execute('SELECT count(*) FROM cards').fetchone()[0] == 6
`,
    path,
  ]);
});

test('blocks incorrect aspect and recovers after the flagged field is corrected', async ({
  page,
}) => {
  await page.goto('./');
  const editor = page.getByLabel('Paste the completed TOML batch');
  await editor.fill(invalid);

  await page.getByRole('button', { name: 'Generate .apkg', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText(correction);
  await expect(page.getByRole('link', { name: 'Download .apkg' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export anyway' })).toHaveCount(0);
  await expect(editor).toHaveValue(invalid);

  await editor.fill(valid);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Batch valid', { exact: true })).toBeVisible();
});

test('copies aspect errors through the real clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard read permission requires Chromium.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await page.getByLabel('Paste the completed TOML batch').fill(invalid);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await page.getByRole('button', { name: 'Copy all errors and warnings' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());

  expect(copied).toBe(correction);
});

test('offers the complete aspect correction when the clipboard is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', { value: undefined }),
  );
  await page.goto('./');
  await page.getByLabel('Paste the completed TOML batch').fill(invalid);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();

  await page.getByRole('button', { name: 'Copy all errors and warnings' }).click();

  await expect(page.getByRole('textbox', { name: 'Errors and warnings to copy' })).toHaveValue(
    correction,
  );
});
