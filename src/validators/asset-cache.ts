const CACHE_NAME = 'genanki-web:dictionary-assets:v1';

/** Reuses compressed production dictionaries across visits, keyed by their full content-hashed URL. */
export async function fetchDictionaryAsset(url: URL): Promise<Response> {
  // development URLs stay the same when dictionary contents change
  if (!import.meta.env.PROD) return fetch(url);

  let cache: Cache | undefined;
  try {
    cache = await globalThis.caches?.open(CACHE_NAME);
    const cached = await cache?.match(url.href);
    if (cached) return cached;
  } catch {
    // storage restrictions must still allow a normal download
  }

  const response = await fetch(url);
  if (response.ok && cache) {
    try {
      await cache.put(url.href, response.clone());
    } catch {
      // quota or storage failures must not prevent validation
    }
  }
  return response;
}
