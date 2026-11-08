Create Russian vocabulary notes for a Slovak learner. Follow the supplied queue rules and TOML structure.

- WORD
  - use the dictionary form: infinitive for verbs, nominative singular for nouns, masculine singular for adjectives. Keep fixed expressions and plural-only words intact.
  - mark stress on Russian words with 2+ syllables in the headword only.
  - place a combining acute accent (U+0301) after the stressed Cyrillic vowel. 
  - preserve ё: ё already indicates stress; do not accent it.
  - examples: кни́га, хорошо́, краси́вый, идёт, за́мок.
  - use ordinary Cyrillic, no transliteration.

- CATEGORY
  - write in Slovak, beginning with the part of speech.
  - always include noun gender or verb aspect when applicable.
  - examples: "podstatné meno; ženský rod", "sloveso; nedokonavý vid", "prídavné meno".
  - add short usage labels when useful, e.g. "slang", "hrubšie", "vulgárne". Avoid unnecessary grammar terminology.
  - use only part of speech, gender or aspect, and usage labels. Do not add topic labels such as "farba" or "kalendárny mesiac".

- MEANINGS
  - include 1–3 common, distinct meanings, ordered by relevance to the supplied context and everyday usage.
  - each meaning has a concise Slovak translation (`sk`) and matching English gloss (`en`).
  - group close synonyms in one meaning; separate genuinely different senses into different rows.
  - example for тупо́й:
    - sk: "hlúpy"; en: "stupid"
    - sk: "tupý"; en: "blunt"
  - do not add obscure meanings just to fill all three rows.
  - make Slovak translations precise enough to distinguish the word from similar Russian words during reverse recall.
  - when Russian separates what Slovak merges, make the difference explicit, e.g. голубо́й: "svetlomodrý, belasý"; си́ний: "modrý, tmavomodrý". List the most common Slovak word first.

- EXAMPLES
  - every meaning must have one Russian sentence and its Slovak translation.
  - keep sentences short, natural, and easy for a beginner to understand. Prefer simple constructions, but use longer sentences when they better demonstrate the meaning.
  - include the target word, inflected as needed, and clearly demonstrate that specific meaning.
  - example for тупо́й:
    - "Э́то тупо́й вопро́с." / "To je hlúpa otázka."
    - "Нож тупо́й." / "Nôž je tupý."
  - use different contexts to distinguish different meanings, not interchangeable or generic examples.
  - across a batch, do not repeat a sentence or sentence frame, even with one word swapped. Use something specific to this word, so that its sentence still identifies it if the word is hidden.
  - use what a native speaker would actually say. If a sentence is correct but sounds odd, replace it.
  - translate naturally into Slovak, preserving the original meaning, tense, person, and tone.
  - use the everyday Slovak word for the context, such as "obloha" for the sky you see, not a literal cognate of the Russian.
  - prefer the supplied source context when useful, but do not invent quotations.

- IDS
  - use ru:<unstressed Russian lemma>:general by default.
  - keep multiple meanings of the same word in one note.
  - use distinct IDs for unrelated homonyms, e.g. ru:замок:castle and ru:замок:lock.
  - preserve existing IDs and sources when correcting cards.

- OUTPUT
  - field values must be plain text: no HTML, Markdown, Anki syntax, audio references, or em dashes.
  - check every note for correct Russian, Slovak, English, stress marks, meaning/example alignment, and valid TOML before output.
