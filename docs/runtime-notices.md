# Runtime license notices

The deployed runtime contains these unmodified upstream packages. Wheels include their upstream license files in *.dist-info/ (or the package directory).

| Component | Version | License | Source |
| --- | --- | --- | --- |
| Pyodide | 314.0.7 | MPL-2.0 | https://github.com/pyodide/pyodide |
| CPython / standard library | 3.14.2 (Pyodide build) | PSF-2.0 and bundled notices | https://github.com/python/cpython |
| genanki | 0.13.1 | MIT | https://github.com/kerrickstaley/genanki |
| frozendict | 2.4.7 | LGPL-3.0 | https://github.com/Marco-Sulla/python-frozendict |
| cached-property | 2.0.1 | BSD-3-Clause | https://github.com/pydanny/cached-property |
| chevron | 0.14.0 | MIT | https://github.com/noahmorrison/chevron |
| PyYAML | 6.0.3 | MIT | https://github.com/yaml/pyyaml |
| micropip | 0.11.1 | MPL-2.0 | https://github.com/pyodide/micropip |

Pyodide's WebAssembly binary also includes Emscripten and third-party libraries under their respective licenses. See https://github.com/pyodide/pyodide/blob/314.0.7/LICENSE and https://docs.python.org/3.14/license.html. The runtime build verifies every core file and wheel against runtime.lock.json. Source archives and licensing are available at the upstream repositories; only static binaries are redistributed here.
