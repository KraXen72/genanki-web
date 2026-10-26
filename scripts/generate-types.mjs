import { compileFromFile } from 'json-schema-to-typescript';
import { writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';

const formatting = await resolveConfig('src/core/manifest.generated.ts');

for (const name of ['manifest', 'export']) {
  const source = await compileFromFile(`schemas/${name}.schema.json`, {
    ignoreMinAndMaxItems: true,
    bannerComment: '/* Generated from schemas/. Run pnpm types:generate; do not edit. */',
  });
  const formatted = await format(source, { ...formatting, parser: 'typescript' });
  await writeFile(`src/core/${name}.generated.ts`, formatted);
}
