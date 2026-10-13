import io
import json
import os
import pathlib
import re
import tempfile
import unittest
import urllib.error
from unittest import mock

import artifact_budget
from artifact_budget import fits, LIMIT

WORKFLOWS = pathlib.Path(__file__).resolve().parents[1] / 'workflows'


class BudgetTests(unittest.TestCase):
    def test_near_limit_and_oversized_candidate_are_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / 'preview'
            path.write_bytes(b'123')
            self.assertTrue(fits(0, [path]))
            self.assertFalse(fits(LIMIT, [path]))
            self.assertFalse(fits(LIMIT-1024**2, [path]))
            with self.assertRaises(ValueError):
                fits(-1, [path])

    def test_missing_evidence_is_not_approved(self):
        with self.assertRaises(OSError):
            fits(0, [pathlib.Path('missing-1565-evidence')])


class MainTests(unittest.TestCase):
    def run_main(self, opener):
        with tempfile.TemporaryDirectory() as tmp:
            preview = pathlib.Path(tmp) / 'preview.png'
            preview.write_bytes(b'png')
            output = pathlib.Path(tmp) / 'output'
            env = {'GITHUB_REPOSITORY': 'owner/repo', 'GH_TOKEN': 'token', 'GITHUB_OUTPUT': str(output)}
            with mock.patch.dict(os.environ, env), mock.patch('sys.argv', ['artifact_budget.py', str(preview)]), \
                    mock.patch('urllib.request.urlopen', opener), mock.patch('builtins.print'):
                artifact_budget.main()
            return output.read_text(encoding='utf-8')

    def test_paginated_inventory_counts_only_live_artifacts(self):
        pages = {
            1: [{'size_in_bytes': 1024, 'expired': False}] * 99 + [{'size_in_bytes': 10**12, 'expired': True}],
            2: [{'size_in_bytes': 2048, 'expired': False}],
        }
        requested = []

        def opener(request, timeout):
            page = int(request.full_url.rsplit('page=', 1)[1])
            requested.append(page)
            return io.BytesIO(json.dumps({'artifacts': pages[page]}).encode())

        self.assertEqual(self.run_main(opener), 'allowed=true\n')
        self.assertEqual(requested, [1, 2])

    def test_unauthorized_inventory_skips_upload(self):
        def opener(request, timeout):
            raise urllib.error.HTTPError(request.full_url, 403, 'Forbidden', {}, None)

        self.assertEqual(self.run_main(opener), 'allowed=false\n')


class WorkflowContractTests(unittest.TestCase):
    def test_budget_jobs_can_read_private_artifact_inventory(self):
        # En privado el endpoint de artifacts exige actions: read; sin él la
        # preview se omite en silencio aunque haya presupuesto (#1565).
        checked = 0
        for path in WORKFLOWS.glob('*.yml'):
            text = path.read_text(encoding='utf-8')
            if not re.search(r'python3? \.github/scripts/artifact_budget\.py', text):
                continue
            checked += 1
            # Sin PyYAML: cada bloque permissions del workflow, con su sangría.
            blocks = re.findall(r'^( *)permissions:\n((?:\1  .*\n)+)', text, re.MULTILINE)
            scopes = dict(re.findall(r'^\s*([a-z-]+):\s*(\S+)', ''.join(body for _, body in blocks), re.MULTILINE))
            self.assertEqual(scopes.get('actions'), 'read', path.name)
            self.assertNotIn('write', scopes.values(), path.name)
        self.assertGreater(checked, 0)


if __name__ == '__main__':
    unittest.main()
