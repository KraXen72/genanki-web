import { strToU8, zipSync } from 'fflate';

const files = import.meta.glob('../../examples/vocabulary-starter/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** The docs and downloaded ZIP share these exact, tested pack files. */
export const starterFiles = Object.fromEntries(
  Object.entries(files).map(([path, text]) => [
    path.slice('../../examples/vocabulary-starter/'.length),
    text,
  ]),
);

/** Creates a local starter pack, including a sample batch ready to paste into the app. */
export function starterZip(): Uint8Array<ArrayBuffer> {
  return zipSync(
    Object.fromEntries(Object.entries(starterFiles).map(([path, text]) => [path, strToU8(text)])),
  );
}
