import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const pack = new URL('../../templates/russian-vocabulary/', import.meta.url);
const css = readFileSync(new URL('style.css', pack), 'utf8');

/** Resolve the field replacements and conditionals used by this pack for layout checks. */
function render(template: string, fields: Record<string, string>): string {
  return template
    .replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, field, content) =>
      fields[field] ? content : '',
    )
    .replace(/\{\{tts [^}]+\}\}/g, '')
    .replace(/\{\{(\w+)\}\}/g, (_, field) => fields[field] || '');
}

for (const width of [360, 720]) {
  for (const count of [1, 2, 3]) {
    test(`Russian answer aligns ${count} meaning pairs at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const fields: Record<string, string> = { Word: 'авантю́ра', Kind: 'podst. meno, ženský rod' };
      for (let index = 1; index <= count; index++) {
        fields[`SlovakMeaning${index}`] =
          index === 1 ? 'riskantné dobrodružstvo, odvážny podnik '.repeat(3) : 'pochybný podnik';
        fields[`EnglishGloss${index}`] =
          index === 2 ? 'risky scheme '.repeat(8) : 'risky adventure';
      }
      const template = readFileSync(new URL('cards/answer.html', pack), 'utf8');
      await page.setContent(
        `<style>${css}</style><div class="card">${render(template, fields)}</div>`,
      );
      const slovak = page.locator('.meanings .slovak-meaning');
      const english = page.locator('.meanings .english-gloss');
      await expect(slovak).toHaveCount(count);
      await expect(english).toHaveCount(count);
      let previousBottom = 0;
      for (let index = 0; index < count; index++) {
        const left = (await slovak.nth(index).boundingBox())!;
        const right = (await english.nth(index).boundingBox())!;
        expect(left.y).toBeCloseTo(right.y, 1);
        expect(right.x).toBeGreaterThan(left.x + left.width);
        expect(left.y).toBeGreaterThan(previousBottom);
        previousBottom = Math.max(left.y + left.height, right.y + right.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(page.locator('.example')).toHaveCount(0);
    });
  }
}

test('Russian reverse shows only populated Slovak meanings without gaps', async ({ page }) => {
  const template = readFileSync(new URL('cards/reverse.html', pack), 'utf8');
  await page.setContent(
    `<style>${css}</style><div class="card">${render(template, {
      Kind: 'podst. meno, ženský rod',
      SlovakMeaning1: 'riskantné dobrodružstvo',
      SlovakMeaning3: 'pochybný podnik',
      EnglishGloss1: 'risky adventure',
      Word: 'авантю́ра',
    })}</div>`,
  );
  await expect(page.locator('.slovak-meaning')).toHaveText([
    'riskantné dobrodružstvo',
    'pochybný podnik',
  ]);
  await expect(page.locator('.english-gloss')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('risky adventure');
  await expect(page.locator('body')).not.toContainText('авантю́ра');
  const boxes = await page.locator('.slovak-meaning').evaluateAll((elements) =>
    elements.map((element) => ({
      x: element.getBoundingClientRect().x,
      y: element.getBoundingClientRect().y,
    })),
  );
  expect(boxes[0].x).toBe(boxes[1].x);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
});

test('Russian card sides share the updated meaning and translation styles', async ({ page }) => {
  const fields = {
    Kind: 'podst. meno, ženský rod',
    Word: 'кни́га',
    SlovakMeaning1: 'kniha',
    EnglishGloss1: 'book',
    Sentence1: 'Э́to кни́га.',
    Translation1: 'To je kniha.',
  };
  const reverse = readFileSync(new URL('cards/reverse.html', pack), 'utf8');
  const answer = readFileSync(new URL('cards/answer.html', pack), 'utf8');
  await page.setContent(
    `<style>${css}</style><div id="reverse" class="card">${render(reverse, fields)}</div><div id="answer" class="card">${render(answer, fields)}</div>`,
  );

  await expect(page.locator('#reverse')).toHaveCSS('font-family', 'Arial, sans-serif');
  await expect(page.locator('#reverse .grammar')).toHaveCSS('font-size', '18px');
  await expect(page.locator('#answer .grammar')).toHaveCSS('font-size', '18px');
  await expect(page.locator('#reverse .slovak-meaning')).toHaveCSS('font-size', '22px');
  await expect(page.locator('#answer .slovak-meaning')).toHaveCSS('font-size', '22px');
  await expect(page.locator('#reverse .translation-prompt')).toHaveCSS(
    'color',
    'rgb(119, 119, 119)',
  );
  await expect(page.locator('#answer .translation')).toHaveCSS('color', 'rgb(119, 119, 119)');
});

for (const side of ['forward', 'reverse', 'answer']) {
  test(`Russian ${side} shows verb grammar and keeps the partner on the answer`, async ({
    page,
  }, testInfo) => {
    const fields = {
      Word: 'ходи́ть',
      Kind: 'sloveso',
      Aspect: 'impf.',
      Motion: 'multidir.',
      Usage: 'hovorové',
      Partner: 'сходи́ть',
      SlovakMeaning1: 'chodiť',
      EnglishGloss1: 'to walk',
    };
    const template = readFileSync(new URL(`cards/${side}.html`, pack), 'utf8');
    await page.setViewportSize({ width: 360, height: 700 });

    await page.setContent(
      `<style>${css}</style><div class="card">${render(template, fields)}</div>`,
    );

    await expect(page.locator('.grammar')).toHaveText(
      /sloveso\s*·\s*impf\.\s*·\s*multidir\.\s*·\s*hovorové/,
    );
    await expect(page.locator('.partner')).toHaveCount(side === 'answer' ? 1 : 0);
    if (side === 'answer') {
      await expect(page.locator('.partner')).toHaveText('pár: сходи́ть');
      const grammar = await page.locator('.grammar').boundingBox();
      const partner = await page.locator('.partner').boundingBox();
      expect(partner!.y).toBeLessThan(grammar!.y + grammar!.height / 2);
      expect(partner!.x + partner!.width).toBeCloseTo(grammar!.x + grammar!.width, 0);
    } else await expect(page.locator('body')).not.toContainText('сходи́ть');
    if (side === 'reverse') await expect(page.locator('body')).not.toContainText('ходи́ть');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    await page.screenshot({ path: testInfo.outputPath(`${side}-grammar.png`) });
  });
}
