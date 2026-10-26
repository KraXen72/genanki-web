"""Install only pinned, same-origin wheels supplied by the worker."""

from contextlib import closing

import micropip
import sqlite3

await micropip.install(list(_wheel_urls), deps=False)

with closing(sqlite3.connect(":memory:")) as connection:
    result = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if result != "ok":
        raise RuntimeError("The Python runtime failed its SQLite smoke test")
