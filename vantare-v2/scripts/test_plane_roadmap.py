"""Offline Plane v1 contract, including complete pages and private-field rejection."""
import copy
import json
import os
import unittest
import uuid
import tempfile
from pathlib import Path
from unittest.mock import patch

from plane_roadmap import document, fetch, Plane, SyncError
from publish_plane_roadmap import publication_sql, main


def uid(n):
    return str(uuid.UUID(int=n))


def snapshot():
    names = ['Por hacer', 'Para Claude', 'En curso', 'Por revisar', 'Por testear', 'Entregado', 'Cancelado']
    return {
        'states': [{'id': uid(100 + n), 'name': name, 'group': 'cancelled' if n == 6 else 'started'}
                   for n, name in enumerate(names)],
        'modules': [{'id': uid(201), 'name': 'Hub'}, {'id': uid(202), 'name': 'Infraestructura'},
                    {'id': uid(203), 'name': 'Negocio'}],
        'tasks': [{'id': uid(n + 1), 'name': f'Rework - Roadmap {n}', 'state': uid(100 + n),
                   'sequence_id': n + 1, 'modules': [uid(201)], 'description_html': 'PRIVATE',
                   'assignees': ['PRIVATE'], 'comments': ['PRIVATE']} for n in range(7)]
    }


class PlaneRoadmapTests(unittest.TestCase):
    def test_cli_fixture_cannot_produce_sql_and_live_preparation_is_repeatable(self):
        with tempfile.TemporaryDirectory() as temporary:
            output, sql = Path(temporary) / 'roadmap.json', Path(temporary) / 'publish.sql'
            fixture = Path(__file__).parent / 'testdata/plane-roadmap.json'
            with patch('sys.argv', ['publisher', '--fixture', str(fixture), '--output', str(output), '--sql-output', str(sql)]):
                with self.assertRaises(SystemExit):
                    main()
            self.assertFalse(sql.exists())
            with patch('sys.argv', ['publisher', '--output', str(output), '--sql-output', str(sql)]), \
                    patch('publish_plane_roadmap.Plane'), patch('publish_plane_roadmap.fetch', return_value=snapshot()):
                main()
                before = output.read_bytes(), sql.read_bytes()
                main()
                self.assertEqual(before, (output.read_bytes(), sql.read_bytes()))
                self.assertLessEqual(len(before[0]), 40000)

    def test_canonical_fixture_shared_with_app_and_web(self):
        root = Path(__file__).parent.parent
        actual = document(json.loads((root / 'scripts/testdata/plane-roadmap.json').read_text(encoding='utf-8')))
        expected = json.loads((root / 'native/hub/reference/fixtures/roadmap-plane-v2-test.json').read_text(encoding='utf-8'))['document']
        self.assertEqual(actual, expected)

    def test_all_states_names_modules_and_privacy(self):
        data = snapshot()
        for n, module in [(20, 202), (21, 203)]:
            task = copy.deepcopy(data['tasks'][0])
            task.update(id=uid(n), modules=[uid(201), uid(module)])
            data['tasks'].append(task)
        task = copy.deepcopy(data['tasks'][0])
        task.update(id=uid(22), modules=[])
        data['tasks'].append(task)
        result = document(data)
        self.assertEqual([x['section'] for x in result['items']], ['next', 'now', 'now', 'now', 'now', 'done'])
        self.assertEqual([x['title']['es'] for x in result['items']], [f'Rework - Roadmap {n}' for n in range(6)])
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertTrue(all(x['area'] == 'Hub' and x['version'] is None and x['dueDate'] is None for x in result['items']))

    def test_identity_order_and_document_are_stable(self):
        data = snapshot()
        before = document(data)
        data['tasks'].reverse()
        self.assertEqual(before, document(data))
        data['tasks'][-1]['name'] = '  Feature - Literal  '
        data['tasks'][-1]['state'] = uid(105)
        after = document(data)
        self.assertEqual(before['items'][0]['id'], after['items'][0]['id'])
        self.assertEqual(after['items'][0]['title']['es'], '  Feature - Literal  ')
        self.assertEqual(after['items'][0]['section'], 'done')

    def test_unknown_or_ambiguous_data_aborts(self):
        mutations = [lambda s: s['tasks'][0].update(state=uid(999)),
                     lambda s: s['states'][0].update(name='Unknown'),
                     lambda s: s['tasks'][0].update(modules=[uid(999)]),
                     lambda s: s['tasks'].append(copy.deepcopy(s['tasks'][0])),
                     lambda s: s['modules'].pop(),
                     lambda s: s['tasks'][0].update(name=''),
                     lambda s: s['tasks'][0].update(id='bad')]
        for mutate in mutations:
            data = snapshot()
            mutate(data)
            with self.subTest(mutate=mutate), self.assertRaises(SyncError):
                document(data)

    def test_limits_reject_without_truncation(self):
        data = snapshot()
        data['tasks'] = [dict(data['tasks'][0], id=uid(n + 1), sequence_id=n + 1) for n in range(40)]
        self.assertEqual(len(document(data)['items']), 40)
        data['tasks'].append(dict(data['tasks'][0], id=uid(50), sequence_id=50))
        with self.assertRaisesRegex(SyncError, '40'):
            document(data)
        data['tasks'].pop()
        # Within the character limit, beyond 40,000 encoded bytes.
        for task in data['tasks']:
            task['name'] = '🚗' * 120
        data['modules'][0]['name'] = '🚗' * 60
        data['states'][0]['name'] = 'Por hacer' + ' ' * 500
        with self.assertRaisesRegex(SyncError, '40'):
            document(data)
        data['tasks'] = []
        with self.assertRaises(SyncError):
            document(data)

    def test_sql_only_uses_dedicated_sync_and_quotes_literal_text(self):
        sql = publication_sql(document(snapshot()))
        self.assertIn('public.visual_roadmap_sync', sql)
        self.assertIn("current_user <> 'vantare_roadmap_publisher'", sql)
        self.assertNotIn('visual_roadmap_publish', sql)
        self.assertTrue(sql.startswith('begin;') and sql.endswith('commit;\n'))
        self.assertIn("''", publication_sql({'literal': "'"}))


class Pages:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def get(self, path, **query):
        self.calls.append((path, query))
        return self.responses[(path, query.get('cursor'))]


def page(rows, cursor=None, total=None):
    return {'results': rows, 'next_page_results': cursor is not None, 'next_cursor': cursor,
            'total_results': total if total is not None else len(rows)}


class FetchTests(unittest.TestCase):
    def api(self):
        data = snapshot()
        for n, module in [(20, 202), (21, 203)]:
            data['tasks'].append(dict(data['tasks'][0], id=uid(n), sequence_id=n, modules=[uid(module)]))
        for module in data['modules']:
            module['total_issues'] = sum(module['id'] in task['modules'] for task in data['tasks'])
        prefix = 'workspaces/vantare/projects/' + uid(500) + '/'
        responses = {(prefix + 'states/', None): page(data['states']),
                     (prefix + 'modules/', None): page(data['modules']),
                     (prefix + 'issues/', None): page(data['tasks'][:3], 'next:1', 9),
                     (prefix + 'issues/', 'next:1'): page(data['tasks'][3:], total=9)}
        for module in data['modules']:
            responses[(prefix + 'modules/' + module['id'] + '/module-issues/', None)] = page(
                [task for task in data['tasks'] if module['id'] in task['modules']])
        return prefix, Pages(responses)

    def test_fetch_completes_every_page_and_membership(self):
        prefix, api = self.api()
        result = fetch(api, 'vantare', uid(500))
        self.assertEqual(len(document(result)['items']), 6)
        self.assertIn((prefix + 'issues/', {'per_page': 100, 'cursor': 'next:1'}), api.calls)
        self.assertTrue(all(task['modules'] == [uid(201)] for task in result['tasks'][:7]))

    def assert_preparation_rejected(self, api):
        with tempfile.TemporaryDirectory() as temporary:
            output, sql = Path(temporary) / 'roadmap.json', Path(temporary) / 'publish.sql'
            output.write_bytes(b'previous publication')
            sql.write_bytes(b'previous SQL')
            with patch('sys.argv', ['publisher', '--output', str(output), '--sql-output', str(sql)]), \
                    patch('publish_plane_roadmap.Plane', return_value=api), \
                    patch.dict(os.environ, {'PLANE_WORKSPACE': 'vantare', 'PLANE_PROJECT_ID': uid(500)}):
                with self.assertRaises(SystemExit) as error:
                    main()
            self.assertEqual(error.exception.code, 1)
            self.assertEqual(output.read_bytes(), b'previous publication')
            self.assertEqual(sql.read_bytes(), b'previous SQL')

    def test_private_membership_uncertainty_preserves_publication_and_sql(self):
        for private in [202, 203]:
            for failure in ['empty', 'empty-zero', 'partial', 'missing-count', 'invalid-count']:
                with self.subTest(private=private, failure=failure):
                    prefix, api = self.api()
                    module = api.responses[(prefix + 'modules/', None)]['results'][private - 201]
                    key = (prefix + 'modules/' + uid(private) + '/module-issues/', None)
                    # The private task also belongs to Hub: omission would expose its name.
                    api.responses[(prefix + 'modules/' + uid(201) + '/module-issues/', None)]['results'].append(
                        api.responses[key]['results'][0])
                    hub = api.responses[(prefix + 'modules/' + uid(201) + '/module-issues/', None)]
                    hub['total_results'] = 8
                    api.responses[(prefix + 'modules/', None)]['results'][0]['total_issues'] = 8
                    if failure.startswith('empty'):
                        api.responses[key] = page([])
                        if failure == 'empty-zero':
                            module['total_issues'] = 0
                    elif failure == 'partial':
                        module['total_issues'] = 2
                    elif failure == 'missing-count':
                        del module['total_issues']
                    else:
                        module['total_issues'] = True
                    self.assert_preparation_rejected(api)

    def test_confirmed_private_memberships_are_hidden_even_with_public_module(self):
        prefix, api = self.api()
        hub = api.responses[(prefix + 'modules/' + uid(201) + '/module-issues/', None)]
        for private in [202, 203]:
            hub['results'].extend(api.responses[(prefix + 'modules/' + uid(private) + '/module-issues/', None)]['results'])
        hub['total_results'] = 9
        api.responses[(prefix + 'modules/', None)]['results'][0]['total_issues'] = 9
        result = document(fetch(api, 'vantare', uid(500)))
        self.assertEqual(len(result['items']), 6)
        self.assertEqual({item['id'] for item in result['items']}, {item['id'] for item in document(snapshot())['items']})

    def test_unpaginated_or_missing_metadata_preserves_publication_and_sql(self):
        for endpoint in ['states/', 'modules/', 'issues/', 'modules/' + uid(201) + '/module-issues/',
                         'modules/' + uid(202) + '/module-issues/']:
            for failure in ['bare-list', 'no-total', 'no-next-page', 'no-cursor']:
                with self.subTest(endpoint=endpoint, failure=failure):
                    prefix, api = self.api()
                    key = (prefix + endpoint, None)
                    if failure == 'bare-list':
                        api.responses[key] = api.responses[key]['results']
                    else:
                        del api.responses[key][{'no-total': 'total_results', 'no-next-page': 'next_page_results',
                                               'no-cursor': 'next_cursor'}[failure]]
                    self.assert_preparation_rejected(api)

    def test_incomplete_repeated_cursor_duplicate_and_drift_fail_closed(self):
        for failure in ['incomplete', 'loop', 'duplicate', 'membership']:
            prefix, api = self.api()
            if failure == 'incomplete':
                api.responses[(prefix + 'issues/', 'next:1')]['results'].pop()
            elif failure == 'loop':
                api.responses[(prefix + 'issues/', 'next:1')]['next_page_results'] = True
                api.responses[(prefix + 'issues/', 'next:1')]['next_cursor'] = 'next:1'
            elif failure == 'duplicate':
                api.responses[(prefix + 'issues/', 'next:1')]['results'][0] = snapshot()['tasks'][0]
            else:
                api.responses[(prefix + 'modules/' + uid(201) + '/module-issues/', None)]['results'][0] = {'id': uid(999)}
            with self.subTest(failure=failure), self.assertRaises(SyncError):
                fetch(api, 'vantare', uid(500))

    def test_config_rejects_credentials_in_url_and_untrusted_http(self):
        for url in ['http://public.example.com', 'https://user:pass@example.com', 'https://example.com/?key=x']:
            with self.assertRaises(SyncError):
                Plane(url, 'fixture-key')
        Plane('http://192.168.1.57:8088', 'fixture-key')

    def test_transport_get_only_bounded_and_secret_errors(self):
        api = Plane('https://plane.example.test', 'fixture-key')
        with patch('urllib.request.OpenerDirector.open', side_effect=OSError('PRIVATE fixture-key')):
            with self.assertRaises(SyncError) as error:
                api.get('workspaces/vantare/projects/' + uid(500) + '/states/')
        self.assertNotIn('fixture-key', str(error.exception))


if __name__ == '__main__':
    unittest.main()
