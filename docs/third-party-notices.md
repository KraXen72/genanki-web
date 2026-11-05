# Interface assets

The background uses **Topography** from [Hero Patterns](https://heropatterns.com/) by Steve Schoger, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The original SVG was recolored gray; CSS changes its scale, opacity, and visible area. The original pattern is distributed at https://heropatterns.com/js/app.js.

Icons are from [Lucide](https://lucide.dev/), distributed by `@iconify-json/lucide` under ISC. Iconify embeds their SVG data in the built CSS; the app makes no icon-service requests. The [upstream license](https://github.com/lucide-icons/lucide/blob/main/LICENSE) includes the Lucide and Feather copyright notices.

# Russian stress dictionary

`src/validators/ru-stress/dictionary.txt` is adapted from the [OpenRussian dictionary data](https://github.com/Badestrand/russian-dictionary), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). `scripts/build-ru-stress.mjs` keeps only stressed word forms, adds `supplement.txt`, and compresses the list. The dictionary and supplement are distributed under the same license.

# Runtime

Python runtime notices and license texts are shipped with `runtime/`; see [runtime-notices.md](runtime-notices.md).
