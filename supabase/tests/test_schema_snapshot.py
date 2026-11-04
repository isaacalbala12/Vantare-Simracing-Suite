"""Characterize the read-only schema snapshot split before its implementation."""
import importlib.util
import pathlib
import tempfile
import unittest

MODULE = pathlib.Path(__file__).with_name('generate_schema_snapshot.py')


class SchemaSnapshotTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('generate_schema_snapshot', MODULE)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def test_table_prefix_routes_acl_rls_trigger_and_index_together(self):
        dump = '''--
-- Name: testing_contributions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.testing_contributions (id uuid);
--
-- Name: testing_contributions_read; Type: POLICY; Schema: public; Owner: -
--
CREATE POLICY testing_contributions_read ON public.testing_contributions USING (true);
--
-- Name: testing_contributions testing_contributions_acl; Type: ACL; Schema: public; Owner: -
--
GRANT SELECT ON TABLE public.testing_contributions TO authenticated;
--
-- Name: billing_orders; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.billing_orders (id uuid);
'''
        groups = self.module.partition_dump(dump)
        self.assertIn('CREATE POLICY', groups['testing'])
        self.assertIn('GRANT SELECT', groups['testing'])
        self.assertNotIn('billing_orders', groups['testing'])
        self.assertIn('billing_orders', groups['billing'])

    def test_catalog_rows_are_stable_and_include_buckets_cron_policy_seeds(self):
        rows = {
            'storage.buckets': [{'name': 'z', 'id': 'b'}, {'id': 'a', 'name': 'a'}],
            'cron.job': [{'jobname': 'sample', 'schedule': '0 * * * *'}],
            'public.policy_seeds': [{'key': 'sample', 'enabled': True}],
            'private.billing_compensation_policy': [{'environment': 'sandbox', 'enabled': False}],
        }
        rendered = self.module.render_catalog_rows(rows)
        self.assertIn('storage.buckets', rendered['storage'])
        self.assertIn('cron.job', rendered['shared'])
        self.assertIn('policy_seeds', rendered['shared'])
        self.assertIn('billing_compensation_policy', rendered['billing'])
        self.assertLess(rendered['storage'].index('"id": "a"'), rendered['storage'].index('"id": "b"'))

    def test_check_mode_detects_drift_without_rewriting(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            (root / 'testing.sql').write_text('old\n')
            self.assertEqual(['testing.sql'], self.module.write_or_check(root, {'testing': 'new\n'}, check=True))
            self.assertEqual('old\n', (root / 'testing.sql').read_text())
            self.assertEqual([], self.module.write_or_check(root, {'testing': 'new\n'}, check=False))
            self.assertEqual('new\n', (root / 'testing.sql').read_text())


if __name__ == '__main__':
    unittest.main()
