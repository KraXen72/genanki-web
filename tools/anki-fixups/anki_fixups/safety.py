"""Version checks, exclusive snapshots, backups, and grouped undo operations."""

import platform
import re
import shutil
import sqlite3
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory

from packaging.version import Version


class FixupError(ValueError):
    """An actionable precondition failure that must prevent collection writes."""


def require_version(expected: str) -> str:
    """Match the installed Anki library to the supplied desktop version."""
    installed = version("anki")
    print(f"Anki library: {installed}")
    if Version(installed) != Version(expected):
        raise FixupError(
            f"Desktop version {expected} differs from library {installed}. "
            f"Install anki=={expected} before opening this collection."
        )
    return installed


@contextmanager
def collection_snapshot(path: Path):
    """Hold the source lock while Anki reads a disposable, WAL-consistent copy.

    SQLite backup includes committed WAL pages. The source is never opened by
    Anki during inspection or dry runs, preventing implicit schema upgrades.
    """
    from anki.collection import Collection

    path = path.expanduser().resolve(strict=True)
    if "microsoft" in platform.release().lower() and re.match(r"^/mnt/[a-z]/", str(path)):
        raise FixupError(
            "Use native Windows Python for a Windows collection. "
            "WSL file locks cannot safely coordinate with desktop Anki; test a Linux-local copy."
        )
    database = sqlite3.connect(f"{path.as_uri()}?mode=rw", uri=True, timeout=0, isolation_level=None)
    try:
        try:
            database.execute("PRAGMA locking_mode=EXCLUSIVE")
            database.execute("BEGIN EXCLUSIVE")
            database.execute("COMMIT")
            database.execute("SELECT count(*) FROM col").fetchone()
        except sqlite3.OperationalError as error:
            raise FixupError(f"Cannot lock the collection; close desktop Anki. ({error})") from error
        with TemporaryDirectory(prefix="anki-fixups-") as temporary:
            pristine = Path(temporary) / "pristine.anki2"
            snapshot = Path(temporary) / "collection.anki2"
            with closing(sqlite3.connect(pristine)) as destination:
                database.backup(destination)
            shutil.copyfile(pristine, snapshot)
            collection = Collection(str(snapshot))
            try:
                yield collection, pristine
            finally:
                collection.close()
    finally:
        database.close()


def create_backup(snapshot: Path, original: Path) -> Path:
    """Copy the untouched snapshot before the official library opens the source."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    backup = original.with_name(f"{original.name}.bak-{stamp}")
    # Exclusive creation also protects an existing backup from being overwritten.
    with snapshot.open("rb") as source, backup.open("xb") as destination:
        shutil.copyfileobj(source, destination)
    print(f"Backup: {backup}")
    return backup


@contextmanager
def undo_operation(collection, name: str):
    """Group backend operations and undo completed work when an operation fails.

    Anki's undo stack belongs to this process and disappears when it closes.
    The adjacent collection backup is the persistent recovery path.
    """
    target = collection.add_custom_undo_entry(name)
    try:
        yield target
    except BaseException:
        collection.merge_undo_entries(target)
        collection.undo()
        raise
    else:
        collection.merge_undo_entries(target)
