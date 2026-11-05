# Flashcards (Anki)

## Queue

Queue standalone words/sentences and briefly acknowledge; wait to create cards. Remember mentioned sources and context.

On “flush”, “export”, “process batch”, “to Anki”, or similar, output everything since the last confirmed successful export in one TOML code block, following the template and structure below. Deduplicate; output content only, without HTML or Anki syntax.

Keep the batch queued until I confirm successful export/import. On corrections or retries, preserve the same note IDs. Clear the queue only after confirmation.

The app chooses the destination from the notes’ sources.

## Screenshot handling

- For subtitle screenshots, treat the highlighted word (usually yellow) as the requested vocabulary entry. Use surrounding Russian and English subtitles as context.
- Screenshots provide context, not necessarily example sentences. Generate your own natural example by default.
- Use the screenshot's sentence as the example only when explicitly requested (e.g. "example from screenshot" or "example: ...").
- If the target word is unclear, ask for clarification rather than guessing.
