import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { strToU8, zipSync } from 'fflate';
import { parse, stringify } from 'smol-toml';

const toml = `format_version = 1
template = "russian-vocabulary"
template_version = 1

[[notes]]
id = "ru:книга:general"
source = "Lesson 1"
category = "podstatné meno; ženský rod"
word = "кни́га"

[[notes.meanings]]
sk = "kniha"
en = "book"
sentence = "Э́то моя́ кни́га."
translation = "Toto je moja kniha."
`;

test('exports locally, downloads verified packages, retries, and clears on reload', async ({
  page,
  context,
}, testInfo) => {
  const externalRequests: string[] = [];
  const pageErrors: string[] = [];
  const baseURL = testInfo.project.use.baseURL!;
  context.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('blob:') && new URL(url).origin !== new URL(baseURL).origin) {
      externalRequests.push(url);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'TOML', exact: true })).toBeVisible();
  await page.getByLabel('Paste the completed TOML batch').fill(toml);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('Batch valid', { exact: true })).toBeVisible();
  await expect(page.getByText('Ruština::Vocabulary::Lesson 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate .apkg' }).click();
  await expect(page.getByRole('button', { name: 'Generate .apkg' })).toBeEnabled({
    timeout: 90_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download .apkg' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download .apkg' })).toHaveAttribute(
    'download',
    'lesson_1__russian_vocabulary.apkg',
  );
  const firstDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download .apkg' }).click();
  await (await firstDownload).saveAs(testInfo.outputPath('first.apkg'));

  await page.getByLabel('Paste the completed TOML batch').fill(toml.replace('kniha"', 'knižka"'));
  await page.getByRole('button', { name: 'Generate .apkg' }).click();
  await expect(page.getByRole('link', { name: 'Download .apkg' })).toBeVisible();
  const secondDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download .apkg' }).click();
  await (await secondDownload).saveAs(testInfo.outputPath('updated.apkg'));
  execFileSync('python3', [
    'tests/inspect_package.py',
    testInfo.outputPath('first.apkg'),
    testInfo.outputPath('updated.apkg'),
  ]);
  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  if (process.env.UPDATE_SCREENSHOT && testInfo.project.name === 'chromium') {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
    await page.locator('#toml').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({ path: 'docs/screenshot.png', animations: 'disabled' });
  }
  await page.reload();
  await expect(page.getByLabel('Paste the completed TOML batch')).toHaveValue('');
});

test('reports invalid fields without losing input and recovers', async ({ page }) => {
  await page.goto('./');
  const editor = page.getByLabel('Paste the completed TOML batch');
  const invalid = toml.replace('word = "кни́га"', 'word = 42');
  await editor.fill(invalid);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('notes.0.word');
  await expect(editor).toHaveValue(invalid);
  await editor.fill(toml);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('Batch valid')).toBeVisible();
});

test('copies the selected schema-derived prompt and offers a clipboard fallback', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          (window as any).copiedPrompt = text;
        },
      },
      configurable: true,
    });
  });
  await page.goto('./');
  await page.getByLabel('Note type').selectOption('basic');
  await page.getByRole('button', { name: 'Copy LLM prompt' }).click();
  const copied = await page.evaluate(() => (window as any).copiedPrompt as string);
  expect(copied).toContain('## Queue');
  expect(copied).toContain('question');
  expect(copied).toMatch(/template = "basic"/);
  expect(copied).toMatch(/```$/);

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Denied');
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Copy LLM prompt' }).click();
  await expect(page.getByLabel('LLM instructions')).toHaveValue(copied);
});

test('opens plain TOML files and accepts a single outer fence only on paste', async ({ page }) => {
  await page.goto('./');
  const upload = page.getByLabel('Open TOML', { exact: true });
  await upload.setInputFiles({
    name: 'notes.toml',
    mimeType: 'text/plain',
    buffer: Buffer.from(toml),
  });
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('Batch valid', { exact: true })).toBeVisible();

  const fenced = `\`\`\`toml\n${toml}\n\`\`\``;
  await upload.setInputFiles({
    name: 'notes.toml',
    mimeType: 'text/plain',
    buffer: Buffer.from(fenced),
  });
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Paste the completed TOML batch').fill(fenced);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('Batch valid', { exact: true })).toBeVisible();
});

test('cancels, retains input, and retries with a fresh worker', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Paste the completed TOML batch').fill(toml);
  await page.getByRole('button', { name: 'Generate .apkg' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cancelled');
  await expect(page.getByLabel('Paste the completed TOML batch')).toHaveValue(toml);
  await page.getByRole('button', { name: 'Generate .apkg' }).click();
  await expect(page.getByRole('button', { name: 'Generate .apkg' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download .apkg' })).toBeVisible();
});

test('keeps runtime lazy and recovers from unavailable runtime assets', async ({
  page,
  context,
}, testInfo) => {
  const runtimeRequests: string[] = [];
  const base = testInfo.project.use.baseURL!.replace(/\/$/, '');
  const runtimePrefix = `${base}/runtime/`;
  context.on('request', (request) => {
    if (request.url().startsWith(runtimePrefix)) runtimeRequests.push(request.url());
  });
  await context.route('**/runtime/pyodide.asm.wasm', (route) => route.abort('failed'));
  await page.goto('./');
  await page.getByLabel('Paste the completed TOML batch').fill(toml);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('Batch valid', { exact: true })).toBeVisible();
  expect(runtimeRequests).toEqual([]);
  await page.getByRole('button', { name: 'Generate .apkg' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Paste the completed TOML batch')).toHaveValue(toml);
  await context.unroute('**/runtime/pyodide.asm.wasm');
  await page.getByRole('button', { name: 'Generate .apkg' }).click();
  await expect(page.getByRole('button', { name: 'Generate .apkg' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download .apkg' })).toBeVisible();
});

test('shows fixed build metadata and remains readable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const metadata = await page.getByTestId('build-info').innerText();
  expect(metadata).toMatch(/^build .+ · genanki 0\.13\.1 · .+ UTC$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('genanki web');
  const layout = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    contentWidth: document.documentElement.scrollWidth,
    bodySize: Number.parseFloat(getComputedStyle(document.body).fontSize),
    selectAppearance: getComputedStyle(document.querySelector('select')!).appearance,
    editorWidth: document.querySelector('textarea')!.getBoundingClientRect().width,
    buttonSize: Number.parseFloat(getComputedStyle(document.querySelector('label.btn')!).fontSize),
  }));
  expect(layout.contentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.bodySize).toBeGreaterThanOrEqual(15);
  expect(layout.selectAppearance).toBe('none');
  expect(layout.editorWidth).toBeGreaterThanOrEqual(layout.viewportWidth - 40);
  expect(layout.buttonSize).toBe(17);
  await page.reload();
  await expect(page.getByTestId('build-info')).toHaveText(metadata);
});

test('imports a local pack, exports without renderer changes, and forgets it on reload', async ({
  page,
}) => {
  const members: Record<string, Uint8Array> = {};
  for (const name of await readdir('templates/basic', { recursive: true })) {
    if (!name.includes('.')) continue;
    members[name] = new Uint8Array(await readFile(`templates/basic/${name}`));
  }
  const manifest = parse(new TextDecoder().decode(members['template.toml'])) as any;
  manifest.key = 'local-basic';
  manifest.name = 'Local question & answer';
  manifest.model.id = 1759797713;
  members['template.toml'] = strToU8(stringify(manifest));
  const schema = JSON.parse(new TextDecoder().decode(members['input.schema.json']));
  schema.properties.template.const = manifest.key;
  members['input.schema.json'] = strToU8(JSON.stringify(schema));
  members['cards/front.html'] = strToU8('<div id="pack-dom-sentinel">{{Question}}</div>');

  await page.goto('./');
  await page.getByLabel('Import template ZIP', { exact: true }).setInputFiles({
    name: 'local-basic.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(members)),
  });
  await expect(page.getByLabel('Note type')).toHaveValue('local-basic');
  await expect(page.locator('#pack-dom-sentinel')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  const input =
    'format_version = 1\ntemplate = "local-basic"\ntemplate_version = 1\n[[notes]]\nid = "study:one"\nquestion = "What?"\nanswer = "This."';
  await page.getByLabel('Paste the completed TOML batch').fill(input);
  await page.getByRole('button', { name: 'Generate .apkg' }).click();
  await expect(page.getByRole('button', { name: 'Generate .apkg' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Download .apkg' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Note type').locator('option')).toHaveCount(2);
});

test('follows system appearance, persists explicit choices, and stores no user content', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'flexoki-dark');
  await expect(page.getByRole('button', { name: 'System theme' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'flexoki-light');

  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'flexoki-dark');
  await page.getByLabel('Paste the completed TOML batch').fill(toml);
  const stored = await page.evaluate(() => ({ ...localStorage }));
  expect(stored).toEqual({ 'genanki-web:theme': 'dark' });
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'flexoki-dark');
  await expect(page.getByLabel('Paste the completed TOML batch')).toHaveValue('');

  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(root).toHaveAttribute('data-theme', 'flexoki-light');
  await page.getByRole('button', { name: 'System theme' }).click();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'flexoki-dark');
});

test('theme controls still work when local storage is disabled', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Disabled');
      },
    });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'flexoki-light');
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'flexoki-dark');
});

test('shows the shared queue prompt in an accessible modal and links its source', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          (window as any).copiedQueue = text;
        },
      },
      configurable: true,
    });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Queue prompt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Queue prompt' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Included in every copied prompt.');
  await expect(dialog).toContainText('## Queue');
  expect(await dialog.evaluate((element) => element instanceof HTMLDialogElement)).toBe(true);
  const codeBlock = dialog.locator('pre');
  await expect(codeBlock).toHaveClass(/font-mono/);
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).copiedQueue)).toBe(await codeBlock.innerText());
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Denied');
        },
      },
    });
  });
  await dialog.getByRole('button', { name: 'Copied', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('copy the selected text');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    await codeBlock.innerText(),
  );
  const closeButton = dialog.getByRole('button', { name: 'Close queue prompt', exact: true });
  const closeSize = await closeButton.boundingBox();
  expect(closeSize!.width).toBe(44);
  expect(closeSize!.height).toBe(44);
  await expect(closeButton).toHaveClass(/btn-outline/);
  await expect(dialog.getByRole('link', { name: 'Edit on GitHub.' })).toHaveAttribute(
    'href',
    'https://github.com/KraXen72/genanki-web/edit/main/prompts/queue.md',
  );
  await dialog.getByRole('button', { name: 'Close queue prompt', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Queue prompt', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Queue prompt', exact: true }).click();
  await page.mouse.click(5, 5);
  await expect(dialog).not.toBeVisible();
});

test('aligns desktop inputs and footer, with icons at the start of buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('./');
  const layout = await page.evaluate(() => {
    const select = document.querySelector('select')!;
    const editor = document.querySelector('#toml')!;
    const footer = document.querySelector('footer')!;
    const copyButton = document.querySelector('button.btn-primary')!;
    return {
      selectTop: select.getBoundingClientRect().top,
      editorTop: editor.getBoundingClientRect().top,
      editorLeft: editor.getBoundingClientRect().left,
      footerLeft: footer.getBoundingClientRect().left,
      buttonAlignment: getComputedStyle(copyButton).justifyContent,
      buttonSize: getComputedStyle(copyButton).fontSize,
      selectSize: getComputedStyle(select).fontSize,
      backgroundPosition: getComputedStyle(document.body, '::before').position,
    };
  });
  expect(layout.selectTop).toBeCloseTo(layout.editorTop);
  expect(layout.editorLeft).toBeCloseTo(layout.footerLeft);
  expect(layout.buttonAlignment).toBe('flex-start');
  expect(layout.buttonSize).toBe(layout.selectSize);
  expect(layout.backgroundPosition).toBe('absolute');
  const themeButtons = await page
    .getByRole('group', { name: 'Appearance' })
    .locator('button')
    .evaluateAll((buttons) => {
      return buttons.map((button) => ({
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
        radius: getComputedStyle(button).borderRadius,
      }));
    });
  expect(themeButtons).toEqual(Array(3).fill({ width: 44, height: 44, radius: '0px' }));
});
