"""Regresión de E/S UTF-8 independiente del locale de Windows (GitHub #1427)."""
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'temas_migrar', Path(__file__).with_name('temas-migrar.py'))
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class Utf8MigrationTest(unittest.TestCase):
    def test_write_and_check_preserve_unicode(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'home.rs'
            original = '// 工程师 😀\nfn a() { rgb(orbit::INK); }'
            source.write_bytes(original.encode('utf-8'))
            with patch.object(tool, 'ROOT', root), contextlib.redirect_stdout(io.StringIO()):
                for flag in ['--write', '--check']:
                    with patch.object(sys, 'argv', ['temas-migrar.py', flag]):
                        self.assertEqual(tool.main(), 0)
            self.assertEqual(source.read_text(encoding='utf-8'),
                             original.replace('orbit::INK', 'orbit::ink(cx)'))


if __name__ == '__main__':
    unittest.main()
