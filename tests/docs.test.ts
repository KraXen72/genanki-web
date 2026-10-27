import { expect, it } from 'vitest';
import { parse, stringify } from 'smol-toml';
import { strFromU8, unzipSync } from 'fflate';
import { starterFiles, starterZip } from '../src/docs/starter';
import { bundledPacks, importPack } from '../src/core/packs';
import { compileBatch } from '../src/core/compiler';
import { assemblePrompt, schemaExample } from '../src/core/prompt';

it('ships an importable starter with identities distinct from the bundled packs', () => {
  const pack = importPack(starterZip());
  for (const bundled of bundledPacks()) {
    expect(pack.manifest.key).not.toBe(bundled.manifest.key);
    expect(pack.manifest.model.id).not.toBe(bundled.manifest.model.id);
  }
  const downloaded = unzipSync(starterZip());
  expect(Object.keys(downloaded).sort()).toEqual(Object.keys(starterFiles).sort());
  for (const [path, text] of Object.entries(starterFiles)) {
    expect(strFromU8(downloaded[path])).toBe(text);
  }
});

it('compiles the documented sample, including missing optional fields and line breaks', async () => {
  const pack = importPack(starterZip());
  const result = await compileBatch(starterFiles['sample.toml'], [...bundledPacks(), pack]);
  expect(result.payload.deck.name).toBe('Languages::Vocabulary::Lesson 1');
  expect(result.cardCount).toBe(4);
  expect(result.payload.notes.map((note) => note.fields)).toEqual([
    ['ru:книга', 'кни́га', 'book', 'Э́то моя́ кни́га.<br>This is my book.'],
    ['ru:дом', 'дом', 'house; home', ''],
  ]);
  expect(result.payload.model.fields).toEqual(['ID', 'Word', 'Meaning', 'Example']);
  expect(result.payload.model.cards.map((card) => card.qfmt.trim())).toEqual([
    '<div class="word">{{Word}}</div>',
    '<div class="word">{{Meaning}}</div>',
  ]);
});

it('generates a valid, self-contained LLM prompt from the downloadable schema', async () => {
  const pack = importPack(starterZip());
  const prompt = assemblePrompt(pack);
  expect(prompt).toContain(starterFiles['prompt.md'].trim());
  expect(prompt).toContain('INPUT CONTRACT: vocabulary-starter, version 1');
  const toml = prompt.match(/```toml\n([\s\S]*?)\n```$/)![1];
  expect(parse(toml)).toEqual(schemaExample(pack));
  const result = await compileBatch(toml, [pack]);
  expect(result.cardCount).toBe(2);
});

it('enforces the example contract and routes missing or mixed sources as documented', async () => {
  const pack = importPack(starterZip());
  const document = parse(starterFiles['sample.toml']) as any;
  document.template_version = 2;
  await expect(compileBatch(stringify(document), [pack])).rejects.toThrow('expected 1');
  document.template_version = 1;
  delete document.notes[0].word;
  await expect(compileBatch(stringify(document), [pack])).rejects.toThrow('word');
  document.notes[0].word = 'кни́га';
  document.notes[1].source = 'Lesson 2';
  expect((await compileBatch(stringify(document), [pack])).payload.deck.name).toBe(
    'Languages::Vocabulary::Mix',
  );
  delete document.notes[1].source;
  expect((await compileBatch(stringify(document), [pack])).payload.deck.name).toBe(
    'Languages::Vocabulary::Mix',
  );
});
