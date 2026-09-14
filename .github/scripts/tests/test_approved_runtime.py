from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'vantare-v2/build/windows/telemetry-reader/extract-approved-runtime.ps1'


class ApprovedRuntimeTests(unittest.TestCase):
    def test_changed_archive_is_rejected_before_destination_creation(self):
        self.assertTrue(SCRIPT.is_file())
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'changed.zip'
            archive.write_bytes(b'untrusted archive')
            output = Path(directory) / 'runtime'
            result = subprocess.run(['pwsh', '-NoProfile', '-File', str(SCRIPT),
                                     '-ArchivePath', str(archive), '-OutputDirectory', str(output)],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Approved runtime archive checksum mismatch', result.stderr)
            self.assertFalse(output.exists())

    def test_release_selects_approved_runtime_and_keeps_verification(self):
        task = (ROOT / 'vantare-v2/build/windows/Taskfile.yml').read_text(encoding='utf-8')
        self.assertIn('-UsePublishedRuntime', task)
        prepare = (SCRIPT.parent / 'prepare-runtime.ps1').read_text(encoding='utf-8')
        self.assertLess(prepare.index('& $verifyScript -RuntimeDirectory $builtRuntime'),
                        prepare.index('& $smokeScript -RuntimeDirectory $builtRuntime'))
        self.assertNotIn('-UpdateTrustSource', prepare)


if __name__ == '__main__':
    unittest.main()
