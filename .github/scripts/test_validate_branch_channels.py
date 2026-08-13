from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
import unittest

import validate_branch_channels as vbc
from validate_branch_channels import main, validate


class ValidateBranchChannelsTest(unittest.TestCase):
    def test_accepts_only_nightly_merge_group_refs(self) -> None:
        self.assertEqual(
            validate(
                "merge_group",
                "refs/heads/gh-readonly-queue/nightly/pr-217-deadbeef",
                "",
                "",
            ),
            "nightly merge group accepted",
        )
        for ref in (
            "refs/heads/gh-readonly-queue/testers/pr-1-deadbeef",
            "refs/heads/gh-readonly-queue/master/pr-1-deadbeef",
            "refs/heads/nightly",
            "refs/heads/gh-readonly-queue/nightly",
            "refs/heads/gh-readonly-queue/nightly/../master",
            "refs/heads/gh-readonly-queue/nightly/..",
            "refs/heads/gh-readonly-queue/nightly/.",
        ):
            with self.subTest(ref=ref), self.assertRaisesRegex(
                ValueError, "not a nightly merge group"
            ):
                validate("merge_group", ref, "", "")

    def test_channel_workflow_runs_pinned_gates_for_merge_group(self) -> None:
        workflow = (
            Path(__file__).resolve().parents[1] / "workflows" / "branch-channel-gates.yml"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "merge_group:\n    branches: [nightly]\n    types: [checks_requested]",
            workflow,
        )
        self.assertIn("EVENT_NAME: ${{ github.event_name }}", workflow)
        self.assertIn("EVENT_REF: ${{ github.ref }}", workflow)
        self.assertIn("EVENT_HEAD: ${{ github.head_ref }}", workflow)
        self.assertIn('--event "$EVENT_NAME"', workflow)
        self.assertNotIn('--event "${{ github.event_name }}"', workflow)
        self.assertNotIn('--head "${{ github.head_ref }}"', workflow)
        self.assertIn("ref: ${{ github.sha }}", workflow)
        self.assertIn(
            "AUTOMATIC_TC_SCOPE: ${{ startsWith(github.head_ref, 'vantareapp/tc-') }}",
            workflow,
        )
        self.assertNotIn("github.event_name == 'merge_group' ||", workflow)
        self.assertIn('if [ "$AUTOMATIC_TC_SCOPE" != "true" ]; then', workflow)
        self.assertIn('DIFF_BASE_SHA="$(git rev-parse "$GITHUB_SHA^1")"', workflow)
        self.assertIn(
            'git diff --name-only --diff-filter=ACMR -z "$DIFF_BASE_SHA" "$GITHUB_SHA"',
            workflow,
        )
        self.assertNotIn("github.event.pull_request.base.sha", workflow)
        self.assertIn(
            "if ($paths.Count -gt 0) {\n"
            "            & pnpm exec eslint -- @paths\n"
            "            if ($LASTEXITCODE -ne 0) { throw \"changed frontend lint failed\" }\n"
            "          }",
            workflow,
        )
        for line in workflow.splitlines():
            if "uses:" in line:
                self.assertRegex(line, r"uses: [^@]+@[0-9a-f]{40}$")
        for required in (
            "Frontend build",
            "Go tests",
            "Frontend tests",
            "Changed frontend lint",
            "Windows Wails build",
            "Testing Center visual gate",
        ):
            self.assertIn(required, workflow)
        self.assertNotIn(
            "- name: Changed frontend lint\n        continue-on-error: true", workflow
        )
        self.assertNotIn(
            "- name: Testing Center visual gate\n        continue-on-error: true", workflow
        )
        self.assertNotIn(
            "- name: Windows Wails build\n        continue-on-error: true", workflow
        )
        self.assertIn(
            "- name: Test inert Testing Center merge queue policy\n"
            "        run: python .github/scripts/test_testing_center_merge_queue.py",
            workflow,
        )

    def test_accepts_issue_branch_into_nightly(self) -> None:
        self.assertEqual(
            validate("pull_request", "refs/pull/1/merge", "nightly", "vantareapp/isa-121"),
            "promotion accepted: vantareapp/isa-121 -> nightly",
        )
        self.assertEqual(
            validate(
                "pull_request",
                "refs/pull/218/merge",
                "nightly",
                "vantareapp/isa-322-haf-08-ci-merge_group-bootstrap-y-merge-queue-serializada",
            ),
            "promotion accepted: vantareapp/isa-322-haf-08-ci-merge_group-bootstrap-y-merge-queue-serializada -> nightly",
        )
        for head in (
            "vantareapp/isa-322-_merge-group",
            "vantareapp/isa-322-merge__group",
            "vantareapp/isa-322-merge_group_",
        ):
            with self.subTest(head=head), self.assertRaises(ValueError):
                validate("pull_request", "refs/pull/218/merge", "nightly", head)

    def test_accepts_only_nightly_into_testers(self) -> None:
        self.assertEqual(
            validate("pull_request", "refs/pull/2/merge", "testers", "nightly"),
            "promotion accepted: nightly -> testers",
        )
        with self.assertRaisesRegex(ValueError, "must come from 'nightly'"):
            validate("pull_request", "refs/pull/3/merge", "testers", "feature/x")

    def test_accepts_only_testers_into_master(self) -> None:
        self.assertEqual(
            validate("pull_request", "refs/pull/4/merge", "master", "testers"),
            "promotion accepted: testers -> master",
        )
        with self.assertRaisesRegex(ValueError, "must come from 'testers'"):
            validate("pull_request", "refs/pull/5/merge", "master", "nightly")

    def test_accepts_only_linear_hotfix_branches_as_master_exception(self) -> None:
        self.assertEqual(
            validate(
                "pull_request",
                "refs/pull/8/merge",
                "master",
                "vantareapp/hotfix-isa-175-critical-license-fix",
            ),
            "emergency hotfix accepted: "
            "vantareapp/hotfix-isa-175-critical-license-fix -> master",
        )
        self.assertEqual(
            validate(
                "pull_request",
                "refs/pull/9/merge",
                "master",
                "vantareapp/hotfix-isa-175-merge_group-fix",
            ),
            "emergency hotfix accepted: "
            "vantareapp/hotfix-isa-175-merge_group-fix -> master",
        )
        for head in (
            "hotfix/isa-175",
            "vantareapp/hotfix-175",
            "vantareapp/hotfix-isa-0-invalid",
            "vantareapp/hotfix-isa-175_Invalid",
            "vantareapp/hotfix-isa-175-_merge-group",
            "vantareapp/hotfix-isa-175-merge__group",
            "vantareapp/hotfix-isa-175-merge_group_",
        ):
            with self.subTest(head=head), self.assertRaisesRegex(
                ValueError, "must come from 'testers'"
            ):
                validate("pull_request", "refs/pull/9/merge", "master", head)

    def test_rejects_non_issue_branches_into_nightly(self) -> None:
        for head in ("testers", "master", "develop", "feature/x", "codex/isa-121"):
            with self.subTest(head=head), self.assertRaisesRegex(ValueError, "Linear issue branch"):
                validate("pull_request", "refs/pull/6/merge", "nightly", head)

    def test_push_is_limited_to_channel_branches(self) -> None:
        for ref in ("refs/heads/nightly", "refs/heads/testers"):
            with self.subTest(ref=ref):
                self.assertIn("accepted", validate("push", ref, "", ""))
        with self.assertRaisesRegex(ValueError, "not a channel branch"):
            validate("push", "refs/heads/develop", "", "")

    def test_rejects_unknown_events_and_targets(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported event"):
            validate("schedule", "", "", "")
        with self.assertRaisesRegex(ValueError, "unsupported event"):
            validate("workflow_dispatch", "refs/heads/nightly", "", "")
        with self.assertRaisesRegex(ValueError, "unsupported promotion target"):
            validate("pull_request", "refs/pull/7/merge", "develop", "feature/x")

    def test_no_test_is_carved_out_of_the_blocking_runs(self) -> None:
        """The frontend debt allowlist is empty and must stay that way.

        ISA-118, ISA-172, ISA-173 and ISA-174 were excluded from the blocking
        runs and repeated as advisory steps, which painted every gate red. Their
        causes are fixed and the suites run whole again. This used to pin the
        allowlist to those exact entries; it now pins it to nothing, so carving
        a test out again is a deliberate edit here rather than a quiet one.
        """
        workflows = Path(__file__).resolve().parents[1] / "workflows"
        channel_gate = (workflows / "branch-channel-gates.yml").read_text(encoding="utf-8")
        release_gate = (workflows / "release.yml").read_text(encoding="utf-8")

        for workflow, gate in (("channel", channel_gate), ("release", release_gate)):
            with self.subTest(workflow=workflow):
                self.assertNotIn("--exclude", gate)
                self.assertNotIn("-skip '^TestConcurrentSavesDontCorruptFile$'", gate)

        self.assertNotIn(
            "- name: Frontend tests\n        continue-on-error: true",
            channel_gate,
        )

    def test_release_build_embeds_the_real_testing_channel(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        release_gate = (
            repo_root / ".github" / "workflows" / "release.yml"
        ).read_text(encoding="utf-8")
        taskfile = (
            repo_root / "vantare-v2" / "build" / "windows" / "Taskfile.yml"
        ).read_text(encoding="utf-8")

        self.assertIn("VANTARE_BUILD_CHANNEL:", release_gate)
        self.assertIn("github.ref_type == 'branch'", release_gate)
        self.assertIn("-X main.buildChannel={{.VANTARE_BUILD_CHANNEL}}", taskfile)

    def test_runbook_never_reuses_tags_or_commits_to_master(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        runbook = (
            repo_root / "vantare-v2" / "docs" / "release-beta-operations-runbook.md"
        ).read_text(encoding="utf-8")

        self.assertNotIn("git push origin --delete", runbook)
        self.assertNotIn("Commitea el fix en `master`", runbook)
        self.assertIn("No borres, muevas ni reutilices el tag distribuido", runbook)
        self.assertIn(
            "`vantareapp/hotfix-isa-<número>-<descripción>` desde `master`",
            runbook,
        )


class TcBranchPreauthorizationTest(unittest.TestCase):
    """The automatic Testing Center fix branch is preauthorized to nightly only.

    The route is inert: the CLI rejects the branch because it cannot receive a
    trusted attestation. The pure policy API requires one and still never
    accepts testers/master or a direct push.
    """

    def test_accepts_tc_branch_into_nightly(self) -> None:
        for head in (
            "vantareapp/tc-0123456789ab-slug-fix",
            "vantareapp/tc-0123456789ab-slug-fix-revert",
        ):
            with self.subTest(head=head):
                attestation = valid_attestation()
                attestation["head"] = head
                self.assertIn(
                    "accepted",
                    validate(
                        "pull_request",
                        "refs/pull/50/merge",
                        "nightly",
                        head,
                        tc_attestation=attestation,
                    ),
                )

    def test_rejects_tc_branch_without_trusted_attestation(self) -> None:
        with self.assertRaisesRegex(ValueError, "trusted attestation required"):
            validate(
                "pull_request",
                "refs/pull/50/merge",
                "nightly",
                "vantareapp/tc-0123456789ab-slug-fix",
            )

    def test_rejects_automatic_attestation_on_human_branch(self) -> None:
        with self.assertRaisesRegex(ValueError, "non-automatic branch"):
            validate(
                "pull_request",
                "refs/pull/50/merge",
                "nightly",
                "vantareapp/isa-318",
                tc_attestation=valid_attestation(),
            )
        for event, base, head in (
            ("pull_request", "testers", "nightly"),
            ("pull_request", "master", "vantareapp/hotfix-isa-9-fix"),
            ("push", "", ""),
        ):
            with self.subTest(event=event, base=base, head=head), self.assertRaisesRegex(
                ValueError, "non-automatic branch"
            ):
                validate(
                    event,
                    "refs/heads/nightly" if event == "push" else "refs/pull/50/merge",
                    base,
                    head,
                    tc_attestation=valid_attestation(),
                )

    def test_rejects_malformed_tc_branches_into_nightly(self) -> None:
        for head in (
            "vantareapp/tc-0123456789AB-slug",
            "vantareapp/tc-0123456789ab-slug_",
            "vantareapp/tc-0123456789ab-Slug",
            "vantareapp/tc-0123456789ab-",
            "vantareapp/tc-0123456789ab",
            "vantareapp/tc-0123456789ab-slug/revert",
            "vantareapp/tc-0123456789ab-slug-revert-extra",
            "vantareapp/tc-0123456789ab-slug-revert-revert",
            "vantareapp/tc-0123456789ab-revert-fix",
        ):
            with self.subTest(head=head), self.assertRaisesRegex(
                ValueError, "Linear issue branch"
            ):
                validate("pull_request", "refs/pull/51/merge", "nightly", head)

    def test_tc_branch_never_targets_testers_or_master(self) -> None:
        for base, expected in (("testers", "nightly"), ("master", "testers")):
            with self.subTest(base=base):
                with self.assertRaisesRegex(ValueError, f"must come from '{expected}'"):
                    validate(
                        "pull_request",
                        "refs/pull/52/merge",
                        base,
                        "vantareapp/tc-0123456789ab-slug-fix",
                    )

    def test_tc_branch_never_pushes_directly(self) -> None:
        with self.assertRaisesRegex(ValueError, "not a channel branch"):
            validate(
                "push",
                "refs/heads/vantareapp/tc-0123456789ab-slug-fix",
                "",
                "",
            )

    def test_manifest_flag_is_not_an_accepted_cli_input(self) -> None:
        with redirect_stderr(StringIO()), self.assertRaises(SystemExit):
            main([
                "--event",
                "pull_request",
                "--ref",
                "refs/pull/53/merge",
                "--base",
                "nightly",
                "--head",
                "vantareapp/tc-0123456789ab-slug-fix",
                "--manifest",
                "attacker.json",
            ])

    def test_cli_rejects_tc_branch_without_attestation(self) -> None:
        with redirect_stderr(StringIO()) as error_output:
            self.assertEqual(
                main([
                    "--event",
                    "pull_request",
                    "--base",
                    "nightly",
                    "--head",
                    "vantareapp/tc-0123456789ab-slug-fix",
                ]),
                1,
            )
        self.assertIn("trusted attestation required", error_output.getvalue())


def valid_attestation() -> dict:
    return {
        "attestation_version": 2,
        "contract": "testing-center-attestation/v2",
        "repo": "isaacalbala12/Vantare-Simracing-Suite",
        "base": "nightly",
        "base_sha": "d" * 40,
        "head": "vantareapp/tc-0123456789ab-slug-fix",
        "head_sha": "a" * 40,
        "digest": "sha256:" + "b" * 64,
        "job_key": "0123456789ab" + "c" * 52,
        "policy_version": "testing-center.autofix-policy.v2",
        "risk": "low",
        "product_files": 3,
        "policy": "eligible",
        "tdd": "proven",
        "opus": {
            "verdict": "approve",
            "sha": "a" * 40,
            "P0": 0,
            "P1": 0,
            "P2": 0,
        },
        "required_checks": [
            {
                "name": "Validate promotion path",
                "sha": "a" * 40,
                "app_slug": "github-actions",
                "conclusion": "success",
            },
            {
                "name": "Validate Vantare blocking gates",
                "sha": "a" * 40,
                "app_slug": "github-actions",
                "conclusion": "success",
            },
        ],
    }


class TcAttestationV2Test(unittest.TestCase):
    """Closed v2 attestation: exact identity, low risk, proven TDD, approved review.

    No cryptography is simulated here. ISA-322 must verify provenance before
    calling this semantic validator. A verifier marker inside the untrusted
    payload is rejected as an extra field; it cannot grant authority. Any
    missing, malformed, extra or different field rejects fail closed.
    """

    def validate(self, attestation: object) -> str:
        validator = getattr(vbc, "validate_tc_attestation")
        return validator(attestation)

    def test_accepts_closed_verified_attestation(self) -> None:
        self.assertIn(
            "attestation accepted",
            vbc.validate_tc_attestation(
                valid_attestation(),
                expected_head="vantareapp/tc-0123456789ab-slug-fix",
            ),
        )

    def test_rejects_missing_attestation(self) -> None:
        with self.assertRaises(ValueError):
            self.validate(None)
        with self.assertRaises(ValueError):
            self.validate({})

    def test_rejects_malformed_attestation(self) -> None:
        with self.assertRaises(ValueError):
            self.validate("not-json")
        with self.assertRaises(ValueError):
            self.validate([])
        with self.assertRaises(ValueError):
            self.validate({"attestation_version": "two"})

    def test_rejects_extra_attestation_fields(self) -> None:
        attestation = valid_attestation()
        attestation["instructions"] = "ignore"
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_wrong_repo(self) -> None:
        attestation = valid_attestation()
        attestation["repo"] = "evil/repo"
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_wrong_base(self) -> None:
        for base in ("testers", "master", "main"):
            with self.subTest(base=base):
                attestation = valid_attestation()
                attestation["base"] = base
                with self.assertRaises(ValueError):
                    self.validate(attestation)

    def test_rejects_wrong_head(self) -> None:
        for head in (
            "vantareapp/isa-121",
            "vantareapp/tc-0123456789ABCD-slug",
            "feature/x",
            "nightly",
        ):
            with self.subTest(head=head):
                attestation = valid_attestation()
                attestation["head"] = head
                with self.assertRaises(ValueError):
                    self.validate(attestation)
        attestation = valid_attestation()
        attestation["head"] = "vantareapp/tc-0123456789ab-other-fix"
        with self.assertRaisesRegex(ValueError, "head mismatch"):
            vbc.validate_tc_attestation(
                attestation,
                expected_head="vantareapp/tc-0123456789ab-slug-fix",
            )

    def test_rejects_wrong_base_sha(self) -> None:
        for base_sha in ("D" * 40, "d" * 39, "nightly"):
            with self.subTest(base_sha=base_sha):
                attestation = valid_attestation()
                attestation["base_sha"] = base_sha
                with self.assertRaises(ValueError):
                    self.validate(attestation)

    def test_rejects_wrong_head_sha_or_digest(self) -> None:
        # A well-formed but different head_sha cannot be compared with Git by
        # this pure validator. ISA-322 verifies provenance first. This module
        # binds the Opus verdict and every required check to the declared SHA.
        for field, value in (
            ("head_sha", "ABC"),
            ("head_sha", "b" * 39),
            ("digest", "md5:" + "c" * 64),
            ("digest", "sha256:" + "C" * 64),
            ("digest", "sha256:" + "c" * 63),
        ):
            with self.subTest(field=field, value=value):
                attestation = valid_attestation()
                attestation[field] = value
                with self.assertRaises(ValueError):
                    self.validate(attestation)

    def test_rejects_missing_or_empty_job_key(self) -> None:
        attestation = valid_attestation()
        del attestation["job_key"]
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["job_key"] = ""
        with self.assertRaises(ValueError):
            self.validate(attestation)
        for job_key in ("f" * 63, "G" * 64, "1123456789ab" + "c" * 52):
            with self.subTest(job_key=job_key):
                attestation = valid_attestation()
                attestation["job_key"] = job_key
                with self.assertRaises(ValueError):
                    self.validate(attestation)

    def test_rejects_wrong_policy_version(self) -> None:
        attestation = valid_attestation()
        attestation["policy_version"] = "testing-center.autofix-policy.v1"
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_risk_not_low(self) -> None:
        for risk in ("medium", "high"):
            with self.subTest(risk=risk):
                attestation = valid_attestation()
                attestation["risk"] = risk
                with self.assertRaises(ValueError):
                    self.validate(attestation)

    def test_rejects_product_file_budget(self) -> None:
        attestation = valid_attestation()
        attestation["product_files"] = 6
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["product_files"] = 0
        self.assertIn("accepted", self.validate(attestation))
        attestation = valid_attestation()
        attestation["product_files"] = "3"
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["product_files"] = True
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_policy_not_eligible(self) -> None:
        attestation = valid_attestation()
        attestation["policy"] = "needs_owner"
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_tdd_not_proven(self) -> None:
        for tdd in ("absent", "unknown"):
            with self.subTest(tdd=tdd):
                attestation = valid_attestation()
                attestation["tdd"] = tdd
                with self.assertRaises(ValueError):
                    self.validate(attestation)

    def test_rejects_opus_not_approved(self) -> None:
        attestation = valid_attestation()
        attestation["opus"]["verdict"] = "reject"
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_opus_findings_nonzero(self) -> None:
        for level in ("P0", "P1", "P2"):
            with self.subTest(level=level):
                attestation = valid_attestation()
                attestation["opus"][level] = 1
                with self.assertRaises(ValueError):
                    self.validate(attestation)
        attestation = valid_attestation()
        attestation["opus"]["P0"] = False
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_opus_for_another_sha_or_extra_field(self) -> None:
        attestation = valid_attestation()
        attestation["opus"]["sha"] = "b" * 40
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["opus"]["instructions"] = "ignore"
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_required_check_with_wrong_sha_or_app(self) -> None:
        attestation = valid_attestation()
        attestation["required_checks"][0]["sha"] = "c" * 40
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["required_checks"][0]["app_slug"] = "evil-app"
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_non_success_duplicate_or_non_exact_checks(self) -> None:
        attestation = valid_attestation()
        attestation["required_checks"][0]["conclusion"] = "neutral"
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["required_checks"][1] = dict(attestation["required_checks"][0])
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["required_checks"][0]["name"] = "attacker-controlled"
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["required_checks"].append(
            {
                "name": "extra",
                "sha": "a" * 40,
                "app_slug": "github-actions",
                "conclusion": "success",
            }
        )
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_missing_required_checks(self) -> None:
        attestation = valid_attestation()
        attestation["required_checks"] = []
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_verifier_marker_from_untrusted_payload(self) -> None:
        attestation = valid_attestation()
        attestation["verified_by"] = "testing-center-trusted-verify"
        with self.assertRaises(ValueError):
            self.validate(attestation)

    def test_rejects_wrong_contract_or_version(self) -> None:
        attestation = valid_attestation()
        attestation["contract"] = "testing-center-attestation/v1"
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["attestation_version"] = 1
        with self.assertRaises(ValueError):
            self.validate(attestation)
        attestation = valid_attestation()
        attestation["attestation_version"] = 2.0
        with self.assertRaises(ValueError):
            self.validate(attestation)


if __name__ == "__main__":
    unittest.main()
