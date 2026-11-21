import { readFile } from 'node:fs/promises';

// the app fetches bundled assets by URL; under Node those URLs point to local files
const networkFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith('file:')) return networkFetch(input, init);

  return new Response(await readFile(new URL(url)));
};
