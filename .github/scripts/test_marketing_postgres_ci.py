"""Keep Docker optional for infrastructure policy, mandatory once capability is present."""
from pathlib import Path
import os
import subprocess
import tempfile
import textwrap
import unittest

WORKFLOW = Path(__file__).resolve().parents[1] / "workflows/branch-channel-gates.yml"

class MarketingPostgresCI(unittest.TestCase):
    def test_docker_job_is_hosted_and_independent_of_product_and_policy(self):
        workflow = WORKFLOW.read_text()
        policy = workflow.split("  policy:", 1)[1].split("  marketing-postgres:", 1)[0]
        self.assertNotIn("run-admin-local.py", policy)
        job = workflow.split("  marketing-postgres:", 1)[1].split("  product:", 1)[0]
        self.assertIn("runs-on: ubuntu-latest", job)
        self.assertIn("vars.MARKETING_POSTGRES_CI == 'true'", job)
        self.assertIn("!github.event.repository.private", job)
        self.assertIn("steps.docker.outputs.available == 'true'", job)
        self.assertIn("docker pull public.ecr.aws/supabase/postgres:17.6.1.165", job)
        self.assertIn("--mail-e2e", job)
        self.assertIn("--test marketing_mail_erasure_retention.test.sql", job)
        self.assertNotIn("continue-on-error", job)
        self.assertIn("name: Preserve marketing E2E failure diagnostics", job)
        self.assertIn("if: failure() && steps.docker.outputs.available == 'true'", job)
        self.assertIn("${{ runner.temp }}/marketing-sql/marketing-mail-e2e.log", job)
        self.assertIn("retention-days: 3", job)
        runner = (WORKFLOW.parents[2] / "supabase/tests/run-admin-local.py").read_text()
        self.assertIn("print(result.stdout+result.stderr,file=sys.stderr,flush=True)", runner)
        product = workflow.split("  product:", 1)[1]
        self.assertIn("needs: policy", product)
        self.assertNotIn("needs: [policy, marketing-postgres]", product)

    def test_absent_or_inaccessible_docker_is_visible_and_supported_runner_executes(self):
        workflow = WORKFLOW.read_text()
        block = workflow.split("      - name: Check Docker capability", 1)[1].split("      - name:", 1)[0]
        shell = textwrap.dedent(block.split("        run: |", 1)[1])
        for state in ("absent", "denied", "ready"):
            with self.subTest(state=state), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                if state != "absent":
                    docker = root / "docker"
                    docker.write_text("#!/bin/bash\nexit " + ("0" if state == "ready" else "1") + "\n")
                    docker.chmod(0o700)
                output = root / "output"
                summary = root / "summary"
                env = dict(os.environ, PATH=tmp, GITHUB_OUTPUT=str(output), GITHUB_STEP_SUMMARY=str(summary))
                result = subprocess.run(["/bin/bash", "-e", "-c", shell], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(output.read_text().strip(), "available=" + ("true" if state == "ready" else "false"))
                if state != "ready":
                    self.assertIn("::warning::", result.stdout)
                    self.assertIn("Docker", summary.read_text())

if __name__ == "__main__":
    unittest.main()
