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

    def test_dump_does_not_preserve_trailing_space_inside_function_body(self):
        dump = '''-- Name: example; Type: FUNCTION; Schema: private; Owner: -
CREATE FUNCTION private.example() RETURNS void AS $$
BEGIN\x20
  RETURN;\x20
END;
$$ LANGUAGE plpgsql;
'''
        self.assertFalse(any(line.endswith(' ') for line in
                             self.module.partition_dump(dump)['shared'].splitlines()))

    def test_disposable_dblink_helper_is_not_product_schema(self):
        dump = '''-- Name: vantare_test_dblink_connect(text, text); Type: FUNCTION; Schema: extensions; Owner: -
CREATE FUNCTION extensions.vantare_test_dblink_connect(a text, b text) RETURNS text AS $$ select a $$ LANGUAGE sql;
-- Name: FUNCTION vantare_test_dblink_connect(a text, b text); Type: ACL; Schema: extensions; Owner: -
GRANT ALL ON FUNCTION extensions.vantare_test_dblink_connect(a text, b text) TO postgres;
-- Name: real_function(); Type: FUNCTION; Schema: public; Owner: -
CREATE FUNCTION public.real_function() RETURNS void AS $$ select null $$ LANGUAGE sql;
'''
        result = self.module.partition_dump(dump)['shared']
        self.assertIn('real_function', result)
        self.assertNotIn('vantare_test_dblink_connect', result)

    def test_mail_and_operations_include_comments_and_acl(self):
        dump = '''-- Name: mail_campaigns; Type: TABLE; Schema: private; Owner: -
CREATE TABLE private.mail_campaigns (id uuid);
-- Name: TABLE mail_campaigns; Type: COMMENT; Schema: private; Owner: -
COMMENT ON TABLE private.mail_campaigns IS 'campaign';
-- Name: TABLE mail_campaigns; Type: ACL; Schema: private; Owner: -
GRANT SELECT ON TABLE private.mail_campaigns TO service_role;
-- Name: operational_access_set(); Type: FUNCTION; Schema: public; Owner: -
CREATE FUNCTION public.operational_access_set() RETURNS void AS $$ select null $$ LANGUAGE sql;
-- Name: FUNCTION operational_access_set(); Type: COMMENT; Schema: public; Owner: -
COMMENT ON FUNCTION public.operational_access_set() IS 'owner';
-- Name: FUNCTION operational_access_set(); Type: ACL; Schema: public; Owner: -
GRANT EXECUTE ON FUNCTION public.operational_access_set() TO service_role;
'''
        groups = self.module.partition_dump(dump)
        self.assertIn('mail_campaigns', groups['mail'])
        self.assertIn('COMMENT ON TABLE', groups['mail'])
        self.assertIn('GRANT SELECT', groups['mail'])
        self.assertIn('operational_access_set', groups['operations'])
        self.assertIn('COMMENT ON FUNCTION', groups['operations'])
        self.assertIn('GRANT EXECUTE', groups['operations'])

    def test_comment_and_acl_follow_testing_table(self):
        dump = '''-- Name: testing_contributions; Type: TABLE; Schema: public; Owner: -
CREATE TABLE public.testing_contributions (id uuid);
-- Name: TABLE testing_contributions; Type: COMMENT; Schema: public; Owner: -
COMMENT ON TABLE public.testing_contributions IS 'report';
-- Name: TABLE testing_contributions; Type: ACL; Schema: public; Owner: -
GRANT SELECT ON TABLE public.testing_contributions TO authenticated;
'''
        groups = self.module.partition_dump(dump)
        self.assertIn('COMMENT ON TABLE', groups['testing'])
        self.assertIn('GRANT SELECT', groups['testing'])
        self.assertNotIn('testing_contributions', groups.get('shared', ''))


if __name__ == '__main__':
    unittest.main()
