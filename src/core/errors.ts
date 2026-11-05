/** Reads the message of a caught value, which JavaScript does not guarantee is an Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
