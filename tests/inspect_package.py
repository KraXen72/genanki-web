"""Inspect browser downloads independently with Python's ZIP and SQLite standard libraries."""

import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import tomllib
import zipfile


def inspect(path):
    """Check exact persisted pack templates, field layout, note identity, and card ordinals."""
    root = Path(__file__).resolve().parents[1]
    pack_root = root / 'templates/russian-vocabulary'
    manifest = tomllib.loads((pack_root / 'template.toml').read_text())
    model_id = manifest['model']['id']

    with zipfile.ZipFile(path) as archive, tempfile.TemporaryDirectory() as directory:
        assert archive.testzip() is None
        assert set(archive.namelist()) == {'collection.anki2', 'media'}
        assert json.loads(archive.read('media')) == {}
        database = Path(directory) / 'collection.sqlite'
        database.write_bytes(archive.read('collection.anki2'))
        connection = sqlite3.connect(database)
        try:
            assert connection.execute('PRAGMA integrity_check').fetchone() == ('ok',)
            models, decks = connection.execute('SELECT models, decks FROM col').fetchone()
            model = json.loads(models)[str(model_id)]
            assert [field['name'] for field in model['flds']] == [field['name'] for field in manifest['fields']]
            assert model['css'] == (pack_root / manifest['css']).read_text()
            for stored, card in zip(model['tmpls'], manifest['cards'], strict=True):
                assert stored['name'] == card['name']
                assert stored['qfmt'] == (pack_root / card['front']).read_text()
                assert stored['afmt'] == (pack_root / card['back']).read_text()

            notes = connection.execute('SELECT id, guid, mid, mod, flds FROM notes').fetchall()
            assert len(notes) == 1
            note_id, guid, stored_model, modified, fields = notes[0]
            assert stored_model == model_id
            assert modified > 0
            fields = fields.split('\x1f')
            assert len(fields) == 11
            assert fields[0] == 'ru:книга:general'
            assert fields[2] == 'кни́га'
            assert fields[5:7] == ['Э́то моя́ кни́га.', 'Toto je moja kniha.']
            assert fields[7:] == ['', '', '', '']
            cards = connection.execute('SELECT ord, did FROM cards WHERE nid=? ORDER BY ord', (note_id,)).fetchall()
            assert [card[0] for card in cards] == [0, 1]
            assert cards[0][1] == cards[1][1]
            assert json.loads(decks)[str(cards[0][1])]['name'] == 'Ruština::Vocabulary::Lesson 1'
            return {'guid': guid, 'fields': fields, 'modified': modified}
        finally:
            connection.close()


def compare_exports(first_path, updated_path):
    """Assert corrections retain identity while changing the requested content."""
    first = inspect(first_path)
    updated = inspect(updated_path)
    assert first['guid'] == updated['guid']
    assert first['fields'][3] != updated['fields'][3]
    assert updated['modified'] >= first['modified']
    print(f'ZIP/SQLite verified; GUID preserved: {first["guid"]}')


if __name__ == '__main__':
    compare_exports(*sys.argv[1:])
