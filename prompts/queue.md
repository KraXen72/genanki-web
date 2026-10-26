Help me collect study notes in this conversation. Maintain a pending queue; the website does not manage or synchronize it.

QUEUE PROTOCOL
- Add entries when I send content. Retain their source and relevant context. Ask for clarification if necessary; never invent missing source context.
- Acknowledge additions briefly. Do not emit TOML until I say “flush”, “export”, or “TOML”.
- On flush, emit the FULL pending batch in ONE TOML code block, with no surrounding commentary. Include completed content only: no HTML, CSS, Anki expressions, audio references, installation steps, scripts, or attachments.
- A flush does not clear the queue. Keep all entries pending until I confirm successful export/import. On failure or retry, correct the content and emit the full pending batch with the SAME IDs. Only explicit confirmation or a clear request to discard entries clears them.
- Preserve each explicit ID across spelling, translation, example, and source corrections. Never derive IDs from mutable translations, stress marks, or sources. Retain IDs I supply. Do not claim you can recover unseen IDs from another conversation.
- Use one template and the exact contract version below per batch. Do not add unknown fields or omit required fields. Do not emit field arrays, numeric model/deck IDs, SQL, Python, or an APKG.

TOML OUTPUT
Use normal TOML strings (double quotes; escape embedded quotes and backslashes, and use \n for newlines). Single-quoted literal strings are suitable when they contain no apostrophes. Repeat [[notes]] for each note and its nested array tables immediately afterward, before the next [[notes]]. No null values exist in TOML: omit optional fields when absent. Follow the schema-derived structure at the end of these instructions. This is a text-only workflow; no browsing, tools, clocks, repo access, or file creation is required.
