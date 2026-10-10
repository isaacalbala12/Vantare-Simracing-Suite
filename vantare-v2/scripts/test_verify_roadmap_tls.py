"""TLS diagnostic must validate CA/hostname and reject a mismatched hostname."""
import subprocess
import unittest
from unittest.mock import patch
from verify_roadmap_tls import verify


class TlsDiagnostic(unittest.TestCase):
    def probe(self, results):
        return patch('verify_roadmap_tls.subprocess.run', side_effect=results)

    def test_correct_ca_and_wrong_hostname(self):
        with self.probe([subprocess.CompletedProcess([], 0, 'Verify return code: 0 (ok)', ''),
                         subprocess.CompletedProcess([], 1, '', 'hostname mismatch')]) as run:
            self.assertIn('PASS', verify('example.supabase.co', 5432, 'ca.crt', 'openssl'))
            self.assertEqual(run.call_count, 2)
            for call in run.call_args_list:
                self.assertEqual(call.kwargs['input'], '')
                self.assertIn('-verify_return_error', call.args[0])
                self.assertEqual(call.args[0][-2:], ['-CAfile', 'ca.crt'])
            self.assertIn('wrong-host.invalid', run.call_args_list[1].args[0])

    def test_untrusted_certificate_stops_before_negative_control(self):
        with self.probe([subprocess.CompletedProcess([], 1, '', 'certificate verify failed')]) as run:
            with self.assertRaises(RuntimeError):
                verify('example.supabase.co', 5432, 'ca.crt', 'openssl')
            self.assertEqual(run.call_count, 1)

    def test_wrong_hostname_must_fail(self):
        with self.probe([subprocess.CompletedProcess([], 0, 'Verify return code: 0 (ok)', ''),
                         subprocess.CompletedProcess([], 0, 'Verify return code: 0 (ok)', '')]):
            with self.assertRaisesRegex(RuntimeError, 'Wrong-host'):
                verify('example.supabase.co', 5432, 'ca.crt', 'openssl')


if __name__ == '__main__':
    unittest.main()
