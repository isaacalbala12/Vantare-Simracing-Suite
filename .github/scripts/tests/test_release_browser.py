from pathlib import Path
import unittest


class ReleaseBrowserTest(unittest.TestCase):
    def test_retired_release_has_no_build_or_publish_effect(self):
        workflow = (Path(__file__).resolve().parents[2] / 'workflows/release.yml').read_text(encoding='utf-8')
        self.assertIn('exit 1', workflow)
        self.assertIn('contents: read', workflow)
        for command in ('go install', 'pnpm', 'wails3', 'gh release', 'contents: write', 'upload-artifact'):
            self.assertNotIn(command, workflow)


if __name__ == '__main__':
    unittest.main()
