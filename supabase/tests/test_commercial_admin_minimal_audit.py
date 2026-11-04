"""Exact audit snapshots use the server image client in Docker CI."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from commercial_admin_minimal_audit import audit_schema


class AuditDumpTests(unittest.TestCase):
    conn = ['-X', '-h', '127.0.0.1', '-p', '54329', '-U', 'postgres', '-d', 'commercial', '-At']
    ddl = 'CREATE TABLE private.evidence(id uuid);\nALTER TABLE private.evidence OWNER TO postgres;\nGRANT SELECT ON private.evidence TO service_role;\n'

    def test_local_dump_keeps_owner_and_acl_and_normalizes_only_nonce(self):
        def local(program, *args):
            self.assertEqual(program, 'pg_dump')
            self.assertEqual(args, ('-h', '127.0.0.1', '-p', '54329', '-U', 'postgres', '-d', 'commercial', '--schema-only'))
            return '\\restrict fixture\n' + self.ddl + '\\unrestrict fixture\n'
        self.assertEqual(audit_schema(local, self.conn), self.ddl)

    def test_pg17_container_snapshot_never_calls_pg16_host_client(self):
        def old_client(*_):
            raise RuntimeError('server version 17; pg_dump version 16')
        self.assertEqual(audit_schema(old_client, self.conn,
            lambda: '\\restrict server_nonce\n' + self.ddl + '\\unrestrict server_nonce\n'), self.ddl)


if __name__ == '__main__':
    unittest.main()
