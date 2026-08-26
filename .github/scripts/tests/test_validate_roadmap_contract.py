import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(SCRIPTS))

import roadmap_digest as digest
import validate_roadmap_contract as contract


BASE_PLAN = """# Plan

## Fases

### Beta

- id: beta
- estado: in-progress
- progreso: 50

## Areas

### Base

- id: base
- estado: in-progress
- progreso: 50

## Hitos

### Base

- id: base
- tipo: feature
- cuerpo: Existe.
"""

CANDIDATE_PLAN = BASE_PLAN.replace(
    "\n## Hitos\n",
    """
### Plataforma

- id: platform
- estado: planned
- progreso: 25

## Hitos
""",
) + """

### Contrato por issue

- id: roadmap-issue-contract
- tipo: plan
- cuerpo: Queda pendiente de promocion.
"""


def run(repo: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return completed.stdout.strip()


def write(repo: Path, relative: str, text: str) -> None:
    path = repo / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def roadmap_for(plan_text: str, last_commit: str | None, generated_at: str = "2020-01-01T00:00:00Z") -> dict:
    return digest.build_document(digest.parse_plan(plan_text), [], last_commit, generated_at)


class GitFixture:
    def __init__(self, root: Path) -> None:
        self.root = root
        run(root, "init")
        run(root, "config", "user.name", "Roadmap Test")
        run(root, "config", "user.email", "roadmap@example.invalid")
        write(root, contract.PLAN_PATH, BASE_PLAN)
        write(root, contract.ROADMAP_PATH, json.dumps(roadmap_for(BASE_PLAN, None), ensure_ascii=False, indent=2) + "\n")
        run(root, "add", contract.PLAN_PATH, contract.ROADMAP_PATH)
        run(root, "commit", "-m", "chore: base")
        self.base = run(root, "rev-parse", "HEAD")

    def commit_required(self, declared_plan: str = CANDIDATE_PLAN) -> str:
        write(self.root, contract.PLAN_PATH, declared_plan)
        candidate = contract.expected_candidate_document(
            self.root,
            self.base,
            digest.parse_plan(declared_plan),
            {"generatedAt": "2020-01-02T00:00:00Z"},
        )
        write(self.root, contract.ROADMAP_PATH, json.dumps(candidate, ensure_ascii=False, indent=2) + "\n")
        run(self.root, "add", contract.PLAN_PATH, contract.ROADMAP_PATH)
        run(self.root, "commit", "-m", "feat(roadmap): contrato por issue")
        return run(self.root, "rev-parse", "HEAD")

    def commit_file(self, path: str, text: str = "evidence") -> str:
        write(self.root, path, text)
        run(self.root, "add", path)
        run(self.root, "commit", "-m", "test: evidencia")
        return run(self.root, "rev-parse", "HEAD")


def issue(
    *,
    label: str = contract.REQUIRED_LABEL,
    ids: str = "`areas:platform`, `milestones:roadmap-issue-contract`",
    exempt_paths: str = "`vantare-v2/internal/example/example_test.go`",
) -> dict:
    return {
        "number": 860,
        "state": "open",
        "labels": [{"name": label}],
        "body": f"""## Objetivo
Cerrar el contrato.

## Tipo de trabajo
tooling

## Alcance aprobado
Validador y tests focales.

## Impacto en roadmap
Si.

## IDs de roadmap afectados
{ids}

## Cambio publico esperado
Mostrar el plan pendiente.

## Justificacion de la exencion
Solo evidencia interna.

## Rutas previstas
{exempt_paths}

## Criterios de aceptacion
Los checks focales pasan.

## Contrato
- [x] La decision de roadmap es explicita.
- [x] La evidencia corresponde al diff.
""",
    }


class IssueParsingTest(unittest.TestCase):
    def test_extracts_issue_number_from_canonical_branches(self) -> None:
        self.assertEqual(contract.issue_number_from_branch("vantareapp/isa-860-roadmap-contract"), 860)
        self.assertEqual(contract.issue_number_from_branch("vantareapp/hotfix-isa-860-roadmap-contract"), 860)
        self.assertIsNone(contract.issue_number_from_branch("feature/isa-860"))

    def test_requires_exactly_one_roadmap_label(self) -> None:
        payload = issue()
        payload["labels"] = [{"name": contract.REQUIRED_LABEL}, {"name": contract.EXEMPT_LABEL}]
        with self.assertRaisesRegex(contract.ContractError, "exactamente una label"):
            contract.declared_roadmap_ids(payload, 860)

    def test_rejects_closed_issue_and_pull_request(self) -> None:
        closed = issue()
        closed["state"] = "closed"
        with self.assertRaisesRegex(contract.ContractError, "abierta"):
            contract.declared_roadmap_ids(closed, 860)
        pull_request = issue()
        pull_request["pull_request"] = {"url": "example"}
        with self.assertRaisesRegex(contract.ContractError, "no a una issue"):
            contract.declared_roadmap_ids(pull_request, 860)

    def test_required_ids_must_be_typed_and_backticked(self) -> None:
        with self.assertRaisesRegex(contract.ContractError, "declarar IDs"):
            contract.declared_roadmap_ids(issue(ids="platform"), 860)

    def test_rejects_duplicate_sections(self) -> None:
        payload = issue()
        payload["body"] += "\n## Objetivo\nOtro objetivo.\n"
        with self.assertRaisesRegex(contract.ContractError, "repite la seccion"):
            contract.declared_roadmap_ids(payload, 860)

    def test_api_issue_must_keep_the_authoritative_form_fields(self) -> None:
        payload = issue()
        payload["body"] = payload["body"].replace("## Tipo de trabajo\ntooling\n\n", "")
        with self.assertRaisesRegex(contract.ContractError, "Tipo de trabajo"):
            contract.declared_roadmap_ids(payload, 860)


class ContractValidationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        self.fixture = GitFixture(self.repo)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_required_accepts_exact_semantic_ids_and_trusted_generation(self) -> None:
        head = self.fixture.commit_required()
        result = contract.validate_issue_contract(self.repo, self.fixture.base, head, issue(), 860)
        self.assertIn("areas:platform", result)
        self.assertIn("milestones:roadmap-issue-contract", result)

    def test_required_rejects_unrelated_declared_id(self) -> None:
        head = self.fixture.commit_required()
        with self.assertRaisesRegex(contract.ContractError, "IDs de roadmap incoherentes"):
            contract.validate_issue_contract(
                self.repo,
                self.fixture.base,
                head,
                issue(ids="`milestones:base`"),
                860,
            )

    def test_required_rejects_manipulated_digest_state(self) -> None:
        head = self.fixture.commit_required()
        payload = json.loads(contract.read_blob(self.repo, head, contract.ROADMAP_PATH))
        payload["digest"]["lastCommit"] = "f" * 40
        write(self.repo, contract.ROADMAP_PATH, json.dumps(payload, indent=2) + "\n")
        run(self.repo, "add", contract.ROADMAP_PATH)
        run(self.repo, "commit", "-m", "docs: manipular digest")
        manipulated = run(self.repo, "rev-parse", "HEAD")
        with self.assertRaisesRegex(contract.ContractError, "estado base confiable"):
            contract.validate_issue_contract(self.repo, self.fixture.base, manipulated, issue(), 860)

    def test_required_rejects_stale_generated_timestamp(self) -> None:
        head = self.fixture.commit_required()
        payload = json.loads(contract.read_blob(self.repo, head, contract.ROADMAP_PATH))
        payload["generatedAt"] = "2020-01-01T00:00:00Z"
        write(self.repo, contract.ROADMAP_PATH, json.dumps(payload, indent=2) + "\n")
        run(self.repo, "add", contract.ROADMAP_PATH)
        run(self.repo, "commit", "-m", "docs: conservar timestamp viejo")
        stale = run(self.repo, "rev-parse", "HEAD")
        with self.assertRaisesRegex(contract.ContractError, "debe ser posterior"):
            contract.validate_issue_contract(self.repo, self.fixture.base, stale, issue(), 860)

    def test_required_rejects_generated_timestamp_far_in_the_future(self) -> None:
        head = self.fixture.commit_required()
        payload = json.loads(contract.read_blob(self.repo, head, contract.ROADMAP_PATH))
        payload["generatedAt"] = "9999-12-31T23:59:59Z"
        write(self.repo, contract.ROADMAP_PATH, json.dumps(payload, indent=2) + "\n")
        run(self.repo, "add", contract.ROADMAP_PATH)
        run(self.repo, "commit", "-m", "docs: timestamp futuro")
        future = run(self.repo, "rev-parse", "HEAD")
        with self.assertRaisesRegex(contract.ContractError, "cinco minutos"):
            contract.validate_issue_contract(self.repo, self.fixture.base, future, issue(), 860)

    def test_not_required_accepts_only_test_files(self) -> None:
        head = self.fixture.commit_file("vantare-v2/internal/example/example_test.go", "package example\n")
        result = contract.validate_issue_contract(
            self.repo,
            self.fixture.base,
            head,
            issue(label=contract.EXEMPT_LABEL),
            860,
        )
        self.assertIn("allowlist cerrada", result)

    def test_not_required_rejects_product_code(self) -> None:
        head = self.fixture.commit_file("vantare-v2/internal/example/example.go", "package example\n")
        with self.assertRaisesRegex(contract.ContractError, "rutas rechazadas"):
            contract.validate_issue_contract(
                self.repo,
                self.fixture.base,
                head,
                issue(
                    label=contract.EXEMPT_LABEL,
                    exempt_paths="`vantare-v2/internal/example/example.go`",
                ),
                860,
            )

    def test_not_required_rejects_product_to_test_rename(self) -> None:
        write(self.repo, "vantare-v2/frontend/src/product.ts", "export const product = true\n")
        run(self.repo, "add", "vantare-v2/frontend/src/product.ts")
        run(self.repo, "commit", "-m", "feat: producto")
        base = run(self.repo, "rev-parse", "HEAD")
        run(
            self.repo,
            "mv",
            "vantare-v2/frontend/src/product.ts",
            "vantare-v2/frontend/src/product.test.ts",
        )
        run(self.repo, "commit", "-m", "test: disfrazar producto")
        head = run(self.repo, "rev-parse", "HEAD")
        with self.assertRaisesRegex(contract.ContractError, "rutas rechazadas"):
            contract.validate_issue_contract(
                self.repo,
                base,
                head,
                issue(
                    label=contract.EXEMPT_LABEL,
                    exempt_paths=(
                        "`vantare-v2/frontend/src/product.ts`, "
                        "`vantare-v2/frontend/src/product.test.ts`"
                    ),
                ),
                860,
            )

    def test_not_required_requires_exact_declared_paths(self) -> None:
        head = self.fixture.commit_file("vantare-v2/internal/example/example_test.go", "package example\n")
        with self.assertRaisesRegex(contract.ContractError, "Rutas previstas"):
            contract.validate_issue_contract(
                self.repo,
                self.fixture.base,
                head,
                issue(
                    label=contract.EXEMPT_LABEL,
                    exempt_paths="`vantare-v2/internal/example/other_test.go`",
                ),
                860,
            )

    def test_not_required_rejects_any_roadmap_edit(self) -> None:
        head = self.fixture.commit_required()
        with self.assertRaisesRegex(contract.ContractError, "no puede modificar"):
            contract.validate_issue_contract(
                self.repo,
                self.fixture.base,
                head,
                issue(label=contract.EXEMPT_LABEL),
                860,
            )

    def test_bot_accepts_only_exact_generated_artifact(self) -> None:
        candidate = contract.expected_candidate_document(
            self.repo,
            self.fixture.base,
            digest.parse_plan(BASE_PLAN),
            {"generatedAt": "2020-01-03T00:00:00Z"},
        )
        write(self.repo, contract.ROADMAP_PATH, json.dumps(candidate, ensure_ascii=False, indent=2) + "\n")
        run(self.repo, "add", contract.ROADMAP_PATH)
        run(self.repo, "commit", "-m", "chore(roadmap): actualizar el digest")
        head = run(self.repo, "rev-parse", "HEAD")
        self.assertIn("artefacto derivado", contract.validate_bot_contract(self.repo, self.fixture.base, head))

    def test_bot_rejects_an_extra_file(self) -> None:
        candidate = contract.expected_candidate_document(
            self.repo,
            self.fixture.base,
            digest.parse_plan(BASE_PLAN),
            {"generatedAt": "2020-01-03T00:00:00Z"},
        )
        write(self.repo, contract.ROADMAP_PATH, json.dumps(candidate, ensure_ascii=False, indent=2) + "\n")
        write(self.repo, "extra.txt", "no")
        run(self.repo, "add", contract.ROADMAP_PATH, "extra.txt")
        run(self.repo, "commit", "-m", "chore: ampliar bot")
        head = run(self.repo, "rev-parse", "HEAD")
        with self.assertRaisesRegex(contract.ContractError, "solo puede modificar"):
            contract.validate_bot_contract(self.repo, self.fixture.base, head)


class RepositoryContractTest(unittest.TestCase):
    def test_forms_and_template_are_versioned(self) -> None:
        required = (REPO_ROOT / ".github/ISSUE_TEMPLATE/roadmap-required.yml").read_text(encoding="utf-8")
        exempt = (REPO_ROOT / ".github/ISSUE_TEMPLATE/roadmap-not-required.yml").read_text(encoding="utf-8")
        self.assertIn("roadmap:required", required)
        self.assertIn("IDs de roadmap afectados", required)
        self.assertIn("roadmap:not-required", exempt)
        self.assertIn("allowlist cerrada", exempt)
        self.assertTrue((REPO_ROOT / ".github/PULL_REQUEST_TEMPLATE.md").exists())
        self.assertTrue((REPO_ROOT / ".github/CODEOWNERS").exists())

    def test_channel_workflow_runs_read_only_contract_without_path_filters(self) -> None:
        workflow = (REPO_ROOT / ".github/workflows/branch-channel-gates.yml").read_text(encoding="utf-8")
        self.assertIn("issues: read", workflow)
        self.assertIn("validate_roadmap_contract.py", workflow)
        self.assertIn('ROADMAP_CONTRACT_MODE: "audit"', workflow)
        self.assertIn("continue-on-error: ${{ env.ROADMAP_CONTRACT_MODE != 'enforce' }}", workflow)
        self.assertNotIn("pull_request_target", workflow)
        self.assertNotIn("paths:", workflow.split("jobs:", 1)[0])

    def test_digest_actions_are_pinned_and_commit_is_not_public_delivery(self) -> None:
        workflow = (REPO_ROOT / ".github/workflows/roadmap-digest.yml").read_text(encoding="utf-8")
        self.assertIn("actions/checkout@11d5960a326750d5838078e36cf38b85af677262", workflow)
        self.assertIn("peter-evans/create-pull-request@22a9089034f40e5a961c8808d113e2c98fb63676", workflow)
        self.assertIn("chore(roadmap): actualizar el digest", workflow)
        self.assertNotIn("docs(roadmap): actualizar el digest", workflow)


if __name__ == "__main__":
    unittest.main()
