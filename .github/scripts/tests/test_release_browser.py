from pathlib import Path
import unittest


class ReleaseBrowserTest(unittest.TestCase):
    def test_release_installs_required_browser_before_tests(self):
        workflow = (Path(__file__).resolve().parents[2] / 'workflows' / 'release.yml').read_text(encoding='utf-8')
        steps = workflow.split('      - name: ')
        deps = next(i for i, step in enumerate(steps) if step.startswith('Gate - Frontend deps\n'))
        tests = next(i for i, step in enumerate(steps) if step.startswith('Gate - Frontend tests\n'))
        installs = [(i, step) for i, step in enumerate(steps) if 'pnpm exec playwright install chromium' in step]
        self.assertEqual(len(installs), 1, 'Release must provision the browser required by visual tests')
        index, install = installs[0]
        self.assertLess(deps, index)
        self.assertLess(index, tests)
        self.assertIn('working-directory: ${{ env.VANTARE_DIR }}/frontend', install)
        self.assertIn('if ($LASTEXITCODE -ne 0)', install)
        self.assertNotIn('continue-on-error:', install)
        self.assertNotIn('\n        if:', install)


if __name__ == '__main__':
    unittest.main()
