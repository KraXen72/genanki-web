# Interface assets

The background uses **Topography** from [Hero Patterns](https://heropatterns.com/) by Steve Schoger, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The original SVG was recolored gray; CSS changes its scale, opacity, and visible area. The original pattern is distributed at https://heropatterns.com/js/app.js.

Icons are from [Lucide](https://lucide.dev/), distributed by `@iconify-json/lucide` under ISC. Iconify embeds their SVG data in the built CSS; the app makes no icon-service requests. The [upstream license](https://github.com/lucide-icons/lucide/blob/main/LICENSE) includes the Lucide and Feather copyright notices.

# Russian dictionary data

`src/validators/ru-stress/dictionary.txt.zst`, `src/validators/ru-aspect/aspects.tsv.zst`, and `data/ru-aspect.tsv` are adapted from two sources, both licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/):

- [English Wiktionary](https://en.wiktionary.org/), as extracted by [wiktextract](https://github.com/tatuylonen/wiktextract) and published on [kaikki.org](https://kaikki.org/dictionary/rawdata.html). Wiktionary text is also available under the GFDL.
- The [OpenRussian dictionary data](https://en.openrussian.org/dictionary-data), exported from its [public TogetherDB database](https://app.togetherdb.com/db/fwoedz5fvtwvq03v/openrussian_public/words).

`scripts/build-ru-stress.mjs` keeps stressed word forms. `scripts/build-ru-aspect.mjs` extracts verb aspects and partners, keeps Wiktionary's facts per stressed headword, and adds OpenRussian headwords. Both apply their manual supplements and compress the results. The derived dictionaries and supplements are distributed under CC BY-SA 4.0. Aspect source dates and counts are recorded in `data/ru-aspect.sources.json`.

The committed aspect data uses Wiktionary `Last-Modified: Fri, 30 Oct 2026 20:48:24 GMT` and OpenRussian's newest-word date `2026-01-06 02:27:55`. The build produced 200,986 rows and kept Wiktionary's values in 104 source conflicts. It skipped 2,034 Wiktionary verb entries and 28 OpenRussian verbs whose aspect was missing.

# Runtime

Python runtime notices and license texts are shipped with `runtime/`; see [runtime-notices.md](runtime-notices.md).
