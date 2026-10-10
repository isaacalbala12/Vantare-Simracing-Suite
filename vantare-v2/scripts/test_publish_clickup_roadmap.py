import copy
import json
from pathlib import Path
import unittest
from publish_clickup_roadmap import publication, publication_sql, WORKSPACE, source


class PublicRoadmapTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = json.loads(Path(__file__).with_name('testdata').joinpath('clickup-roadmap.json').read_text(encoding='utf-8'))
        self.snapshot['workspaceId'] = WORKSPACE
        for task in self.snapshot['tasks']:
            if ' · ' not in task['name']:
                task['name'] = 'Hub · ' + task['name']

    def test_publication_preserves_ids_dates_and_explicit_versions_without_private_data(self):
        task = self.snapshot['tasks'][0]
        task.update(due_date='1791590400000', tags=[{'name':'v1.2.3'}, {'name':'private-tag'}],
                    description='PRIVATE', assignees=[{'email':'PRIVATE'}], custom_fields=[{'value':'PRIVATE'}])
        result = publication(self.snapshot, '2026-10-10T00:00:00Z')
        item = result['document']['items'][0]
        self.assertEqual(result['document']['schemaVersion'], 2)
        self.assertEqual(item['version'], 'v1.2.3')
        self.assertEqual(item['dueDate'], '2026-10-10')
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertNotIn('private-tag', json.dumps(result))
        self.assertEqual(item['id'], source.document(self.snapshot)['items'][0]['id'])
        self.assertEqual(result['id'], publication(self.snapshot, '2026-10-11T00:00:00Z')['id'])

    def test_absent_date_and_version_stay_absent_and_unknown_status_aborts(self):
        result = publication(self.snapshot, '2026-10-10T00:00:00Z')
        self.assertIsNone(result['document']['items'][0]['version'])
        self.assertIsNone(result['document']['items'][0]['dueDate'])
        self.snapshot['tasks'][0]['status']['status'] = 'invented'
        with self.assertRaises(source.SyncError): publication(self.snapshot, 'date')

    def test_ambiguous_version_bad_format_workspace_and_overflow_reject(self):
        cases = [copy.deepcopy(self.snapshot) for _ in range(4)]
        cases[0]['tasks'][0]['tags'] = [{'name':'v1.0.0'},{'name':'v2.0.0'}]
        cases[1]['tasks'][0]['name'] = 'Missing type'
        cases[2]['workspaceId'] = 'other'
        cases[3]['tasks'][0]['due_date'] = '999999999999999999999999999999'
        for case in cases:
            with self.assertRaises((ValueError, OverflowError, OSError)): publication(case, 'date')

    def test_ci_sql_uses_only_dedicated_sync_and_quotes_public_text(self):
        sql = publication_sql({'schemaVersion':2, 'items':[{'title':"'); drop table x; --"}]})
        self.assertIn("''); drop table x; --", sql)
        self.assertIn('public.visual_roadmap_sync', sql)
        self.assertNotIn('visual_roadmap_publish', sql)
        self.assertNotIn('lock table', sql) # lock belongs to the restricted function
        self.assertTrue(sql.startswith('begin;'))
        self.assertTrue(sql.endswith('commit;\n'))


if __name__ == '__main__': unittest.main()
