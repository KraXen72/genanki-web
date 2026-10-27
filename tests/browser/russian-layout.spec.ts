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
      const fields: Record<string, string> = { Word: 'авантю́ра', Category: 'podstatné meno' };
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
      Category: 'podstatné meno',
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
