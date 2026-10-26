import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadPyodide, type PyodideInterface } from 'pyodide';
import { stringify } from 'smol-toml';
import lock from '../runtime.lock.json';
import { bundledPacks } from '../src/core/packs';
import { compileBatch } from '../src/core/compiler';
import { schemaExample } from '../src/core/prompt';
import adapter from '../src/runtime/adapter.py?raw';

let python: PyodideInterface;
const packs = bundledPacks();
const russian = packs.find((pack) => pack.manifest.key === 'russian-vocabulary')!;

beforeAll(async () => {
  python = await loadPyodide({ indexURL: `${resolve('public/runtime')}/` });
  await python.loadPackage('pyyaml');
  // Node's filesystem is separate from Pyodide's; install the exact pure-Python wheel bytes.
  for (const wheel of lock.wheels) {
    python.FS.writeFile('/tmp/package.whl', await readFile(`public/runtime/${wheel.file}`));
    python.runPython(`
import sysconfig, zipfile
with zipfile.ZipFile('/tmp/package.whl') as wheel:
    wheel.extractall(sysconfig.get_path('purelib'))
`);
  }
  python.FS.unlink('/tmp/package.whl');
  python.runPython(adapter);
}, 60_000);

afterAll(() => {
  python?.globals.delete('_test_payload');
});

async function exportExample() {
  const document = schemaExample(russian);
  const result = await compileBatch(stringify(document), packs);
  python.globals.set('_test_payload', JSON.stringify(result.payload));
  const proxy = python.runPython('build_package(_test_payload)');
  try {
    const bytes = proxy.toJs() as Uint8Array;
    expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
  } finally {
    proxy.destroy();
  }
}

it('writes and verifies repeated real packages without accumulating job files', async () => {
  const before = [...python.FS.readdir('/tmp')].sort();
  for (let index = 0; index < 5; index++) await exportExample();
  expect([...python.FS.readdir('/tmp')].sort()).toEqual(before);
});

it('cleans genanki databases after failure and can export again', async () => {
  const before = [...python.FS.readdir('/tmp')].sort();
  python.runPython(`
_original_verify = verify_package

def verify_package(*args):
    raise ValueError('Simulated verification failure')
`);
  try {
    await expect(exportExample()).rejects.toThrow('Simulated verification failure');
    expect([...python.FS.readdir('/tmp')].sort()).toEqual(before);
  } finally {
    python.runPython('verify_package = _original_verify\ndel _original_verify');
  }
  await exportExample();
});

it('exports the configured maximum note count with stable identity and cleanup', async () => {
  const document = schemaExample(russian) as any;
  const original = document.notes[0];
  document.notes = Array.from({ length: 2000 }, (_, index) => ({
    ...original,
    id: `ru:benchmark:${index}`,
  }));
  const compilation = await compileBatch(stringify(document), packs);
  const before = [...python.FS.readdir('/tmp')].sort();
  const started = performance.now();
  python.globals.set('_test_payload', JSON.stringify(compilation.payload));
  const proxy = python.runPython('build_package(_test_payload)');
  let packageBytes: number;
  try {
    packageBytes = proxy.toJs().byteLength;
  } finally {
    proxy.destroy();
  }
  expect(compilation.cardCount).toBe(4000);
  expect([...python.FS.readdir('/tmp')].sort()).toEqual(before);
  if (process.env.MEASURE_RUNTIME) {
    const metrics = {
      notes: compilation.payload.notes.length,
      cards: compilation.cardCount,
      packageBytes,
      packagingMs: Math.round(performance.now() - started),
      processRssBytes: process.memoryUsage().rss,
      processPeakRssKiB: process.resourceUsage().maxRSS,
    };
    const { writeFile } = await import('node:fs/promises');
    await writeFile('/tmp/genanki-runtime-metrics.json', JSON.stringify(metrics, null, 2));
  }
});

it('rejects a package when a conditional front produces fewer cards than the manifest', async () => {
  const compilation = await compileBatch(stringify(schemaExample(russian)), packs);
  compilation.payload.model.cards[1].qfmt = '{{#Sentence3}}{{Sentence3}}{{/Sentence3}}';
  python.globals.set('_test_payload', JSON.stringify(compilation.payload));
  expect(() => python.runPython('build_package(_test_payload)')).toThrow('expected cards');
  await exportExample();
});

it('verifies escaped fields through the independent second note type', async () => {
  const pack = packs.find((pack) => pack.manifest.key === 'basic')!;
  const document = schemaExample(pack) as any;
  document.notes[0].answer = '<b>\"A\" & B</b>\nNext';
  const compilation = await compileBatch(stringify(document), packs);
  python.globals.set('_test_payload', JSON.stringify(compilation.payload));
  const proxy = python.runPython('build_package(_test_payload)');
  try {
    expect(proxy.toJs().byteLength).toBeGreaterThan(0);
  } finally {
    proxy.destroy();
  }
});
