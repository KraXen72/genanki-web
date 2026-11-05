/** Reads a dot-separated path such as "meanings.0.sentence", or undefined if it is absent. */
export function getPath(value: unknown, path: string): unknown {
  let current = value;

  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}
