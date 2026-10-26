import { readFile, readdir, writeFile } from 'node:fs/promises';
import { parse } from 'smol-toml';

const envelope = JSON.parse(await readFile('schemas/envelope.schema.json', 'utf8'));
const packDirectories = await readdir('templates', { withFileTypes: true });

for (const directory of packDirectories.filter((entry) => entry.isDirectory())) {
  const root = `templates/${directory.name}`;
  const manifest = parse(await readFile(`${root}/template.toml`, 'utf8'));
  const content = JSON.parse(await readFile(`${root}/note.schema.json`, 'utf8'));
  const schema = structuredClone(envelope);
  const note = schema.properties.notes.items;

  schema.$schema = 'http://json-schema.org/draft-07/schema#';
  schema.title = manifest.name;
  schema.additionalProperties = false;
  schema.properties.template = { const: manifest.key };
  schema.properties.template_version = { const: manifest.input_version };
  note.additionalProperties = false;
  for (const [key, property] of Object.entries(content.properties)) {
    note.properties[key] = { ...note.properties[key], ...property };
  }
  note.required = [...note.required, ...content.required];
  if (content.dependencies) note.dependencies = content.dependencies;

  const json = `${JSON.stringify(schema, null, 2)}\n`;
  await writeFile(`${root}/${manifest.schema}`, json);
}
