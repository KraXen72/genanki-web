import { expect, test, type Page } from '@playwright/test';

// development asset URLs have no content hash, so persistent caching is production-only
test.skip(!process.env.E2E_PRODUCTION, 'Dictionary caching uses production content-hashed URLs.');

const CACHE_NAME = 'genanki-web:dictionary-assets:v1';
const dictionaryAsset = /\/(?:aspects\.tsv|dictionary\.txt)(?:-[^/]+)?\.zst$/;
const toml = `format_version = 1
template = "russian-vocabulary"
template_version = 2
[[notes]]
id = "ru:сделать:general"
kind = "slov"
aspect = "pf"
word = "сде́лать"
[[notes.meanings]]
sk = "urobiť"
en = "to do"
`;

async function validate(page: Page) {
  await page.getByLabel('Paste the completed TOML batch').fill(toml);
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('Batch valid', { exact: true })).toBeVisible();
}

test('reuses both hashed dictionaries across reloads when dictionary downloads are blocked', async ({
  page,
}) => {
  const requested: string[] = [];
  let blockDownloads = false;
  await page.route(dictionaryAsset, async (route) => {
    requested.push(route.request().url());
    if (blockDownloads) await route.abort();
    else await route.continue();
  });
  await page.goto('./');

  await validate(page);
  const firstDownloads = [...requested];
  blockDownloads = true;
  await page.reload();
  await validate(page);

  expect(firstDownloads).toHaveLength(2);
  for (const url of firstDownloads) {
    expect(new URL(url).pathname).toMatch(/\/(?:aspects\.tsv|dictionary\.txt)-[\w-]+\.zst$/);
  }
  expect(requested).toEqual(firstDownloads);
  await page
    .getByLabel('Paste the completed TOML batch')
    .fill(toml.replace('aspect = "pf"', 'aspect = "impf"'));
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'aspect is "impf", but the dictionary has "сде́лать" as "pf"',
  );
});

test('downloads current hashes when persistent storage contains older dictionary URLs', async ({
  page,
}) => {
  const requested: string[] = [];
  await page.route(dictionaryAsset, async (route) => {
    requested.push(route.request().url());
    await route.continue();
  });
  await page.goto('./docs.html');
  await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    for (const asset of ['aspects.tsv', 'dictionary.txt']) {
      const oldUrl = new URL(`assets/${asset}-outdated.zst`, location.href).href;
      await cache.put(oldUrl, new Response('outdated dictionary bytes'));
    }
  }, CACHE_NAME);

  await page.goto('./');
  await validate(page);

  expect(requested).toHaveLength(2);
  expect(requested.every((url) => !url.includes('-outdated.zst'))).toBe(true);
  const cached = await page.evaluate(async (urls) => {
    return Promise.all(urls.map(async (url) => (await caches.match(url))?.ok === true));
  }, requested);
  expect(cached).toEqual([true, true]);
});

for (const failure of ['unavailable', 'read-denied', 'write-denied'] as const) {
  test(`validates through normal downloads when cache storage is ${failure}`, async ({ page }) => {
    const requested: string[] = [];
    await page.addInitScript((mode) => {
      if (mode === 'unavailable') {
        Object.defineProperty(window, 'caches', { value: undefined });
      } else if (mode === 'read-denied') {
        Cache.prototype.match = async () => {
          throw new DOMException('Storage access denied', 'SecurityError');
        };
      } else {
        Cache.prototype.put = async () => {
          throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        };
      }
    }, failure);
    await page.route(dictionaryAsset, async (route) => {
      requested.push(route.request().url());
      await route.continue();
    });
    await page.goto('./');

    await validate(page);
    await page.reload();
    await validate(page);

    expect(requested).toHaveLength(4);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('allows a later download when a dictionary server returned an error', async ({ page }) => {
  let failDownload = true;
  const requested: string[] = [];
  await page.route(/\/aspects\.tsv-[\w-]+\.zst$/, async (route) => {
    requested.push(route.request().url());
    if (failDownload) await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
    else await route.continue();
  });
  await page.goto('./');
  await page.getByLabel('Paste the completed TOML batch').fill(toml);

  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not load the Russian aspect dictionary: 503',
  );
  const cachedFailure = await page.evaluate(
    async (url) => Boolean(await caches.match(url)),
    requested[0],
  );
  failDownload = false;
  await page.reload();
  await validate(page);

  expect(cachedFailure).toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
