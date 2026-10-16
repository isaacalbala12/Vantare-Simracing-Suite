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
        self.assertIn("name: Prepare marketing PostgreSQL image", job)
        self.assertIn("--mail-e2e", job)
        self.assertIn("--test marketing_mail_erasure_retention.test.sql", job)
        self.assertNotIn("continue-on-error", job)
        self.assertIn("name: Preserve marketing E2E failure diagnostics", job)
        self.assertIn("if: failure() && steps.docker.outputs.available == 'true'", job)
        self.assertIn("${{ runner.temp }}/marketing-sql/marketing-mail-e2e.log", job)
        self.assertIn("retention-days: 3", job)
        self.assertIn("python -m unittest discover -s supabase/tests -p test_run_admin_local.py", workflow)
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

    def run_image_preparation(self, state):
        workflow = WORKFLOW.read_text()
        name = "Prepare marketing PostgreSQL image"
        if name not in workflow:
            # Reproduce the original acquisition, before its SQL child starts.
            name = "Test marketing SQL and end-to-end consent locally"
        block = workflow.split("      - name: " + name, 1)[1].split("      - name:", 1)[0]
        shell = textwrap.dedent(block.split("        run: |", 1)[1]).split("python3 supabase/tests/run-admin-local.py", 1)[0]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            docker = root / "docker"
            docker.write_text("""#!/bin/bash
printf '%s\n' "$*" >> "$CALLS"
if [ "$1" = pull ]; then
  count=0
  if [ -f "$COUNT" ]; then read -r count < "$COUNT"; fi
  count=$((count+1))
  printf '%s\n' "$count" > "$COUNT"
  if [ "$STATE" = permanent ] || { [ "$STATE" = limited ] && [[ "$*" = *public.ecr.aws* ]]; }; then
    echo 'toomanyrequests: Data limit exceeded' >&2
    exit 1
  fi
  if { [ "$STATE" = transient ] || [ "$STATE" = timeout ]; } && [ "$count" -le 2 ]; then
    if [ "$STATE" = timeout ]; then exit 124; fi
    exit 1
  fi
fi
if [ "$1" = tag ] && [ "$STATE" = tag_failure ]; then exit 73; fi
""")
            docker.chmod(0o700)
            timeout = root / "timeout"
            timeout.write_text("""#!/bin/bash
printf '%s %s\n' "$1" "$2" >> "$TIMEOUTS"
shift 2
exec "$@"
""")
            timeout.chmod(0o700)
            sleep = root / "sleep"
            sleep.write_text('#!/bin/bash\nprintf "%s\\n" "$*" >> "$SLEEPS"\n')
            sleep.chmod(0o700)
            calls, sleeps = root / "calls", root / "sleeps"
            env = dict(os.environ, PATH=tmp+os.pathsep+os.defpath, HOME=tmp,
                       STATE=state, CALLS=str(calls), COUNT=str(root/"count"), SLEEPS=str(sleeps), TIMEOUTS=str(root/"timeouts"))
            result = subprocess.run(["/bin/bash", "-e", "-c", shell], env=env, capture_output=True, text=True, timeout=10)
            self.assertTrue(calls.exists(), result.stderr)
            commands = [line.split() for line in calls.read_text().splitlines()]
            bounds = (root/"timeouts").read_text().splitlines()
            self.assertEqual(bounds, ["--kill-after=10s 80s"] * sum(c[0] == "pull" for c in commands))
            waits = sleeps.read_text().splitlines() if sleeps.exists() else []
        return result, commands, waits

    def assert_pinned_sources(self, commands):
        digest = "sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518"
        pulls = [command for command in commands if command[0] == "pull"]
        for index, command in enumerate(pulls):
            registry = ("public.ecr.aws/supabase/postgres", "docker.io/supabase/postgres")[index % 2]
            self.assertEqual(command, ["pull", registry+"@"+digest])
        for command in commands:
            if command[0] == "tag":
                self.assertIn(command[1], [c[-1] for c in pulls])
                self.assertEqual(command[2], "public.ecr.aws/supabase/postgres:17.6.1.165")
        return pulls

    def test_registry_rate_limit_uses_identical_digest_on_official_mirror(self):
        result, commands, waits = self.run_image_preparation("limited")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("toomanyrequests: Data limit exceeded", result.stderr)
        self.assertEqual(len(self.assert_pinned_sources(commands)), 2)
        self.assertEqual(commands[-1][0], "tag")
        self.assertEqual(waits, [])

    def test_transient_or_timed_out_registries_recover_after_wait(self):
        for state in ("transient", "timeout"):
            with self.subTest(state=state):
                result, commands, waits = self.run_image_preparation(state)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(len(self.assert_pinned_sources(commands)), 3)
                self.assertEqual(commands[-1][0], "tag")
                self.assertEqual(waits, ["15"])

    def test_permanent_registry_failure_is_bounded_and_fails(self):
        result, commands, waits = self.run_image_preparation("permanent")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(self.assert_pinned_sources(commands)), 6)
        self.assertFalse(any(c[0] == "tag" for c in commands))
        self.assertEqual(waits, ["15", "45"])
        self.assertIn("::error::", result.stdout)

    def test_primary_success_and_retag_failure_are_not_masked(self):
        for state, code in (("ready", 0), ("tag_failure", 73)):
            with self.subTest(state=state):
                result, commands, waits = self.run_image_preparation(state)
                self.assertEqual(result.returncode, code, result.stderr)
                self.assertEqual(len(self.assert_pinned_sources(commands)), 1)
                self.assertEqual(commands[-1][0], "tag")
                self.assertEqual(waits, [])

if __name__ == "__main__":
    unittest.main()
