import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { strFromU8, unzipSync } from 'fflate';

// These tests also run against the production /genanki-web/ subpath in CI.
test('footer opens docs in a new tab without losing the batch', async ({ page, context }) => {
  await page.goto('./');
  const editor = page.getByLabel('Paste the completed TOML batch');
  await editor.fill('Work in progress');
  const link = page.getByRole('link', { name: 'Template docs' });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const popupPromise = context.waitForEvent('page');
  await link.click();
  const docs = await popupPromise;
  await expect(docs.getByRole('heading', { name: 'Make your own template' })).toBeVisible();
  await expect(docs).toHaveURL(/\/docs\.html$/);
  await expect(editor).toHaveValue('Work in progress');
  await docs.getByRole('link', { name: 'Back to generator' }).click();
  await expect(docs.getByRole('heading', { name: 'TOML', exact: true })).toBeVisible();
});

for (const width of [360, 1280]) {
  test(`direct docs, anchors, appearance, and code fit at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./docs.html#fields');
    await expect(page.getByRole('heading', { name: 'Map data into Anki fields' })).toBeInViewport();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Map data into Anki fields' })).toBeInViewport();
    await page
      .getByRole('navigation', { name: 'On this page' })
      .getByRole('link', { name: 'Input schema' })
      .click();
    await expect(page).toHaveURL(/docs\.html#schema$/);
    await page.getByText('Complete input.schema.json', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Copy input.schema.json', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'flexoki-dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'flexoki-dark');
    await page.getByRole('button', { name: 'Light theme', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'flexoki-light');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const brokenAnchors = await page
      .locator('a[href^="#"]')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute('href')!)
          .filter((href) => !document.getElementById(href.slice(1))),
      );
    expect(brokenAnchors).toEqual([]);
    expect(requests.filter((url) => url.includes('/runtime/'))).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('copies complete code and selects it when clipboard access is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).copiedCode = text;
        },
      },
    });
  });
  await page.goto('./docs.html');
  await page.getByRole('button', { name: 'Copy template.toml', exact: true }).click();
  const expected = await page
    .getByRole('figure')
    .filter({ has: page.getByRole('button', { name: 'Copy template.toml', exact: true }) })
    .locator('pre')
    .textContent();
  expect((await page.evaluate(() => (window as any).copiedCode)).trimEnd()).toBe(expected);
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toHaveCount(1);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
  });
  await page.getByRole('button', { name: 'Copy template.toml', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Select and copy' })).toHaveCount(1);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(expected);
});

test('downloads the starter, imports it, and exports four verified Anki cards', async ({
  page,
}, testInfo) => {
  await page.goto('./docs.html');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download starter ZIP' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('vocabulary-starter.zip');
  const path = testInfo.outputPath('vocabulary-starter.zip');
  await download.saveAs(path);
  const files = unzipSync(await readFile(path));
  const sample = strFromU8(files['sample.toml']);
  // All displayed files are the files shipped in the ZIP.
  for (const name of ['sample.toml', 'template.toml', 'cards/answer.html', 'prompt.md']) {
    const figure = page
      .getByRole('figure')
      .filter({ has: page.getByRole('button', { name: `Copy ${name}`, exact: true }) });
    expect(await figure.locator('pre').textContent()).toBe(strFromU8(files[name]).trimEnd());
  }
  await page.goto('./');
  await page.getByLabel('Import template ZIP', { exact: true }).setInputFiles(path);
  await expect(page.getByRole('status')).toContainText('Imported Vocabulary starter');
  await page.getByLabel('Paste the completed TOML batch').fill(sample);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('Batch valid', { exact: true })).toBeVisible();
  await expect(page.getByText('Languages::Vocabulary::Lesson 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate .apkg' }).click();
  const result = page.getByRole('link', { name: 'Download .apkg' });
  await expect(result).toBeVisible();
  const packagePromise = page.waitForEvent('download');
  await result.click();
  const packagePath = testInfo.outputPath('starter.apkg');
  await (await packagePromise).saveAs(packagePath);
  execFileSync('python3', [
    '-c',
    `
import json, sqlite3, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    data = archive.read('collection.anki2')
connection = sqlite3.connect(':memory:')
connection.deserialize(data)
assert connection.execute('select count(*) from notes').fetchone()[0] == 2
assert connection.execute('select count(*) from cards').fetchone()[0] == 4
models = json.loads(connection.execute('select models from col').fetchone()[0])
model = models['1760000001']
assert [f['name'] for f in model['flds']] == ['ID', 'Word', 'Meaning', 'Example']
assert len(model['tmpls']) == 2
`,
    packagePath,
  ]);
});
