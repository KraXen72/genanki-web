/** Text that cannot appear in plain note fields: em dashes, HTML, Anki expressions, and audio. */
const PLAIN_TEXT_BANNED = ['—', '<', '>', '{{', '}}', '[sound:'];
/** Text that cannot appear in a source, because it separates deck levels in Anki. */
const SOURCE_BANNED = ['::'];

function escapeForPattern(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

const plainTextAlternatives = PLAIN_TEXT_BANNED.map(escapeForPattern).join('|');
const sourceAlternatives = SOURCE_BANNED.map(escapeForPattern).join('|');

/** Supported JSON Schema patterns, shared by pack validation and the authoring guide. */
export const textPatterns = {
  plainText: `^(?![\\s\\S]*(?:${plainTextAlternatives}))[\\s\\S]*$`,
  source: `^(?!.*${sourceAlternatives})[^\\x00-\\x1f]*$`,
};

/**
 * The only patterns a schema may use, each with the text it bans.
 *
 * The list is deliberately finite: arbitrary uploaded regular expressions can block the main
 * thread. Schemas repeat these patterns word for word, and `checkSchema` rejects any that differ.
 */
export const bannedTextByPattern = new Map([
  [textPatterns.plainText, PLAIN_TEXT_BANNED],
  [textPatterns.source, SOURCE_BANNED],
]);
