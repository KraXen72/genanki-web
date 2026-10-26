import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';

const lock = JSON.parse(await readFile('runtime.lock.json', 'utf8'));
await mkdir('public/runtime', { recursive: true });
for (const asset of [...lock.assets, ...lock.wheels]) {
  const target = `public/runtime/${asset.file}`;
  let bytes;
  try {
    bytes = await readFile(target);
  } catch {
    /* first build */
  }
  if (!bytes || hash(bytes) !== asset.sha256) {
    if (asset.source === 'npm') {
      bytes = await readFile(`node_modules/pyodide/${asset.file}`);
    } else {
      const response = await fetch(asset.url);
      if (!response.ok)
        throw new Error(`Runtime download failed: ${asset.file} (${response.status})`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (hash(bytes) !== asset.sha256) throw new Error(`Runtime hash mismatch: ${asset.file}`);
    await writeFile(target, bytes);
  }
}
await copyFile('runtime.lock.json', 'public/runtime/runtime.lock.json');
const runtimeNotices = await readFile('docs/runtime-notices.md', 'utf8');
const interfaceNotices = await readFile('docs/third-party-notices.md', 'utf8');
const iconLicense = await readFile('docs/lucide-license.txt', 'utf8');
await writeFile(
  'public/runtime/NOTICE.md',
  `${runtimeNotices}\n${interfaceNotices}\n${iconLicense}`,
);
console.log(`Verified ${lock.assets.length + lock.wheels.length} pinned runtime files.`);

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
