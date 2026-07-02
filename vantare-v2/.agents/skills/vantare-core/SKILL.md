---
name: vantare-core
description: Core orchestration and engineering control skill for Vantare. Use for any Vantare coding, debugging, planning, review, commit, release, React, TypeScript, Go, Wails, UI, overlay, auth, telemetry, or product-engineering task.
---

# Vantare Core

Use this skill first for Vantare work. It is a router and quality gate, not a replacement for specialist skills.

Your job is to help Vantare move fast without accumulating LLM-generated slop: oversized diffs, invented architecture, duplicated logic, fake tests, mixed commits, hidden regressions, and code that future agents cannot safely continue.

Default style: boring, explicit, source-driven, minimal, testable, reversible.

## Non-negotiables

1. Read `AGENTS.md`, `docs/current-plan.md`, and `git status --short` before edits.
2. Use the repo as source of truth. Inspect nearby code before inventing files, APIs, state, or conventions.
3. Make the smallest safe change. No broad rewrites, dependency additions, architecture changes, or cleanup outside scope without explicit approval.
4. Never use `git add .`. Stage files explicitly. Use `git add -p` when `docs/current-plan.md` has mixed hunks.
5. Separate feature, bugfix, docs, refactor, release, and local mock changes unless the user explicitly asks otherwise.
6. Do not commit local artifacts: `hub_main*.html`, `roadmap_v5.2.html`, screenshots, `fotos/`, `kokoro-test/`, `vantare-v2-engineer/`, `*.exe.stale`, generated binaries, or HTML mockups unless explicitly requested.
7. Do not touch `../pnpm-workspace.yaml` unless the task is specifically workspace configuration.
8. Preserve Vantare ownership boundaries: `WidgetStudio` edits appearance/data only; `LayoutStudio` edits position/size only.
9. Never claim tests/build/lint passed without running them or having tool output.
10. Mark failures outside scope as preexisting only with evidence: file, command, and why the current diff did not cause it.

## Workflow

If the user gives a specific plan or prompt, execute that plan directly with small checkpoints. If the request is ambiguous or large, first produce a concise plan.

For non-trivial work, start with:

```text
Task classification:
Relevant skills:
Existing pattern found:
Proposed minimal change:
Files likely to change:
Risks:
Verification plan:
```

Then implement, verify, and report. If the user says "review", do review only and do not edit.

## Skill routing

Load only the relevant specialist skills.

- Planning: `writing-plans`, `planning-and-task-breakdown`, `spec-driven-development`.
- Executing an approved plan: `executing-plans`, `incremental-implementation`, `test-driven-development`, `verification-before-completion`.
- Debugging: `systematic-debugging`, `debugging-and-error-recovery`, `doubt-driven-development`.
- Review: `requesting-code-review`, `receiving-code-review`, `code-review-and-quality`, `code-review-expert`, `senior-qa-engineer`.
- Frontend/React/UI: `frontend-ui-engineering`, `frontend-design-deslop`, `frontend-responsive-design-standards`, `tailwind`, `vercel-react-best-practices`, `web-design-guidelines`, `accessibility`.
- Go/Wails/backend: `golang-code-style`, `golang-testing`, `golang-error-handling`, `golang-safety`, `golang-context`, `golang-concurrency`, `golang-security`.
- Security/auth/local APIs/filesystem/secrets: `security-and-hardening`, `owasp-security`, `golang-security`, `supabase`.
- Performance/overlays/telemetry/render loops: `performance-optimization`, `golang-performance`, `core-web-vitals`, `browser-testing-with-devtools`.
- Git/release/CI: `conventional-git`, `git-workflow-and-versioning`, `ci-cd-and-automation`, `shipping-and-launch`.

If a named skill is unavailable in the active runtime, use the closest installed skill by description and state the fallback.

## Implementation rules

- Prefer existing patterns, helpers, tests, and local types.
- Keep business/domain logic out of UI components when reasonably possible.
- Use local component state before global state. Do not add Zustand/global state unless truly shared.
- Avoid `useEffect` unless synchronizing with an external system.
- Keep Go simple. Handle errors. Use `context.Context` for I/O, network, filesystem, long-running work, or cancelable operations.
- Do not add goroutines without lifecycle, cancellation, and test strategy.
- Do not add dependencies without explaining need, alternatives, risk, and verification.
- For security-sensitive boundaries, validate input and avoid leaking secrets, tokens, paths, or credentials.
- For overlays/telemetry, avoid expensive render work and keep units/time precision explicit.

## Testing and checks

Behavior changes need tests or a concrete reason why not.

Use focused checks first, then broader checks when the change touches shared contracts.

Common frontend checks:

```powershell
corepack pnpm --dir frontend test -- <focused-pattern>
corepack pnpm --dir frontend test
corepack pnpm --dir frontend exec tsc -b
corepack pnpm --dir frontend build
corepack pnpm --dir frontend lint
git diff --check
```

Common Go checks:

```powershell
gofmt -w <files>
go test -count=1 ./...
go vet ./...
git diff --check
```

If `go test ./...` fails because frontend embed hashes are stale, run the frontend build first and document that causal path.

## Commit policy

Commit only after review/approval when the user asks or the workflow requires it.

Before commit:

1. Confirm scope with `git status --short`.
2. Stage explicit paths only.
3. Run `git diff --cached --check`.
4. Run focused tests relevant to the staged change.
5. Confirm excluded files remain unstaged.

Never include local mocks, screenshots, stale binaries, unrelated docs, or other workers' changes.

## Review protocol

For review-only tasks, lead with findings:

```text
Veredicto: ACCEPT / ACCEPT WITH P3 / NEEDS FIXES / BLOCKED

Findings:
- P0/P1/P2/P3 with file:line and impact

Checks:
- command -> result

Archivos seguros para commit:
- ...

Archivos que NO deben incluirse:
- ...

Riesgos restantes:
- ...
```

Prioritize bugs, regressions, missing tests, broken contracts, scope leaks, security issues, and release risk. Summaries come after findings.

## Final report

For implementation tasks, report in Spanish:

```text
Resumen:
- ...

Archivos creados/modificados:
- file: reason

Checks ejecutados:
- command -> result

Checks no ejecutados:
- reason

Riesgos restantes:
- ...

Verificacion manual:
- ...
```

Keep it concise. The user needs decisions, evidence, and next steps, not long code explanations.
