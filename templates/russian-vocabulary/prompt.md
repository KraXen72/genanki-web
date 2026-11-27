Create Russian vocabulary notes for a Slovak learner. Follow the supplied queue rules and TOML structure.

- WORD
  - use the dictionary form: infinitive for verbs, nominative singular for nouns, masculine singular for adjectives. Keep fixed expressions and plural-only words intact.
  - mark stress on Russian words with 2+ syllables in `word` and `partner`.
  - place a combining acute accent (U+0301) after the stressed Cyrillic vowel. 
  - preserve ё: ё already indicates stress; do not accent it.
  - examples: кни́га, хорошо́, краси́вый, идёт, за́мок.
  - use ordinary Cyrillic, no transliteration.

- KIND
  - set `kind` to exactly one of the allowed values. Noun gender is part of the kind: `pod.m:m`, `pod.m:ž`, `pod.m:s`, `pod.m:oboj` for common gender like сирота́, `pod.m:pomn` for plural-only like но́жницы.
  - write the enum slug, e.g. `kind = "pod.m:ž"`. The app supplies its Slovak display label.
  - use `slov` for verbs, including reflexive -ся verbs; use `fráza` only for fixed multi-word expressions not headed by a single verb or noun.

- ASPECT (verbs only)
  - every `slov` note has `aspect`: `impf` (nedokonavý), `pf` (dokonavý), or `both` (obojvidový, e.g. испо́льзовать, жени́ться).
  - use the headword's aspect.
  - add `partner` with the stressed aspect partner(s) when one exists: де́лать → `partner = "сде́лать"`. For several common partners separate them with ", ". Omit `partner` if there is no standard partner.
  - for the unprefixed paired verbs of motion (идти́/ходи́ть, е́хать/е́здить, бежа́ть/бе́гать, лете́ть/лета́ть, плыть/пла́вать, нести́/носи́ть, вести́/води́ть, везти́/вози́ть, тащи́ть/таска́ть, кати́ть/ката́ть, гнать/гоня́ть, ползти́/по́лзать, лезть/ла́зить, брести́/броди́ть) also set `motion`: `unidir` for the first verb in each pair, `multidir` for the second. Prefixed motion verbs (прийти́, приходи́ть) get no `motion`.
  - never set `aspect`, `partner`, or `motion` on non-verbs.
  - the app checks aspect against a dictionary. If it reports an error, correct only the flagged fields and keep IDs.

- USAGE
  - optional `usage` in Slovak for register or usage labels: "slang", "hovorové", "hrubšie", "vulgárne", "knižné", "zastarané". Keep part of speech, gender, and aspect in their structured fields. Omit topic labels.

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
  - write lived-in, grounded sentences from real everyday life, casual conversation, or vivid scenes; never sterile "textbook filler" or bland third-person exposition.
  - favor first- and second-person perspectives (я, ты, мы, мой, наш), concrete details (specific objects, named pets, relatable situations), and natural conversational framing (e.g., «Говорю тебе...», «Говорят, что...», «Блин...») when it fits the register.
  - cut redundant modifier padding; do not stack unnecessary adjectives or genitives just to lengthen a sentence (e.g., prefer «новую чёрную» or «своего размера», not both; «с крыши», not «с крыши дома»).
  - match the register and rawness of the word: for slang, anatomical, or vulgar terms, use authentic contexts where native speakers actually say them (attraction, blunt banter, parenting, messing up)—never sanitize them into safe, clinical excuses.
  - keep sentences natural and digestible, using punchy clauses or simple cause-and-effect actions rather than stiff, overly formal phrasing.
  - include the target word, inflected as needed, and clearly demonstrate that specific meaning.
  - example for тупо́й:
    - "Э́то тупо́й вопро́с." / "To je hlúpa otázka."
    - "Нож тупо́й." / "Nôž je tupý."
  - use different contexts to distinguish different meanings, not interchangeable or generic examples.
  - across a batch, do not repeat a sentence or sentence frame, even with one word swapped. Use something specific to this word, so that its sentence still identifies it if the word is hidden.
  - translate into idiomatic, spoken Slovak rather than mirroring Russian syntax—use natural Slovak dative/reflexive constructions (e.g., "hodí sa ti k očiam", not "hodí k tvojim očiam") and drop words that sound redundant in Slovak (e.g., "už sme sa dlho nevideli", not "už sme sa spolu dlho nevideli").
  - use the everyday Slovak word for the context, such as "obloha" for the sky you see, not a literal cognate of the Russian.
  - prefer the supplied source context when useful, but do not invent quotations.

- IDS
  - use ru:<unstressed Russian lemma>:general by default.
  - keep multiple meanings of the same word in one note.
  - use distinct IDs for unrelated homonyms, e.g. ru:замок:castle and ru:замок:lock.
  - preserve existing IDs and sources when correcting cards.
  - aspect partners are separate notes with their own IDs, e.g. `ru:делать:general` and `ru:сделать:general`.

- OUTPUT
  - field values must be plain text: no HTML, Markdown, Anki syntax, audio references, or em dashes.
  - check every note for correct Russian, Slovak, English, stress marks, meaning/example alignment, and valid TOML before output.
