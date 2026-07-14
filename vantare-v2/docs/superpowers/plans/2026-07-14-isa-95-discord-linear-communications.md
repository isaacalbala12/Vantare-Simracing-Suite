# ISA-95 Discord and Linear Communications Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task by task.

**Goal:** Replace noisy, stale Discord progress posts with four explicit communication lanes and a tested, auditable generator.

**Architecture:** GitHub Actions remains the only publisher. Testers receive structured changelog fragments only after changes reach `develop`; public beta builds and public releases remain explicit workflows; the repurposed development channel receives a daily, read-only digest of active Linear projects. A standard-library Python module owns validation, rendering, channel verification, Linear reads, and Discord delivery, while workflows only provide triggers and secrets.

**Tech Stack:** GitHub Actions YAML, Python 3 standard library, `unittest`, Linear GraphQL, Discord webhooks.

**Execution status:** Core routing completed on the issue branch. On 2026-07-15 all four lanes were extended with accessible native embeds and dedicated HTML-rendered cards built from one Vantare visual language. Automated checks and local Chrome rendering cover Release, Testers, Development and Build; real attachment POSTs and integration remain behind Isaac's manual approval.

---

## Channel contract

| Secret | Audience | Trigger | Content |
|---|---|---|---|
| `DISCORD_RELEASE_WEBHOOK_URL` | Public releases | Version tag whose commit belongs to `master`, or explicit dispatch | Public release summary |
| `DISCORD_PROGRESS_WEBHOOK_URL` | Testers | Structured fragment merged/pushed to `develop` | Plain-language summary, technical details, test checklist, limitations |
| `DISCORD_KNOWN_ISSUES_WEBHOOK_URL` | Active development | Daily schedule or explicit dispatch | Active Linear project digest; no issue/comment firehose |
| `DISCORD_BUILD_WEBHOOK_URL` | Public beta changelog | Explicit dispatch after a validated build exists | Download, checksum and beta changelog |

## Task 1: Characterize and lock the contracts

- [ ] Record the channel contract and authoring rules in `vantare-v2/docs/discord-communications.md`.
- [ ] Add JSON Schema `vantare-v2/docs/changelog/fragments/schema.json` and a real ISA-95 fragment.
- [ ] Document the fragment obligation in `vantare-v2/docs/agent-workflow.md`.

## Task 2: Build the tested generator (TDD)

**Files:**
- Create: `.github/scripts/discord_communications.py`
- Create: `.github/scripts/tests/test_discord_communications.py`

- [ ] Write failing tests for schema validation, changed-fragment collection, stable ordering, empty inputs, duplicate issue rejection, Discord-safe rendering, public Linear marker parsing, project filtering, channel mismatch and dry-run.
- [ ] Run `python -m unittest discover -s .github/scripts/tests -v` and confirm RED.
- [ ] Implement the smallest standard-library module that passes.
- [ ] Re-run the suite and confirm GREEN.

## Task 3: Replace beta progress with canonical tester changes

**File:** `.github/workflows/discord-beta-progress.yml`

- [ ] Restrict automatic push execution to `develop` and fragment paths.
- [ ] Preserve `workflow_dispatch` with an explicit base revision.
- [ ] Collect only fragments changed in the current revision range.
- [ ] Skip empty ranges and reruns; use `DISCORD_PROGRESS_WEBHOOK_URL` only.
- [ ] Validate destination channel `1519752249977340168` before POST.

## Task 4: Repurpose known issues as active development

**File:** `.github/workflows/discord-known-issues.yml` (se conserva el nombre físico para mantener su ID de GitHub Actions; el nombre visible pasa a `Discord active development`)

- [ ] Run daily plus manual dispatch; never trigger from arbitrary documentation pushes.
- [ ] Query Linear read-only with `LINEAR_API_KEY`.
- [ ] Include only active projects and only public text explicitly marked `<!-- discord:development -->`.
- [ ] Publish through `DISCORD_KNOWN_ISSUES_WEBHOOK_URL` after validating channel `1519752544753291305`.
- [ ] Do not publish raw issues, comments, descriptions, PII or secret values.

## Task 5: Harden release and beta-build lanes

**Files:**
- Modify: `.github/workflows/discord-release.yml`
- Modify: `.github/workflows/discord-build-available.yml`

- [ ] Release: verify the announced tag commit is contained in `origin/master` and read its matching changelog section.
- [ ] Build: keep dispatch-only and clearly label it as the public beta changelog lane.
- [ ] Remove legacy fallback webhook variables so a misconfigured dedicated secret fails closed.

## Task 6: Verify and deliver without publishing

- [ ] Run unit tests and dry-runs with fixture data; no real webhook POST.
- [ ] Parse every modified workflow as YAML using the repository/runtime tooling available; run `actionlint` if installed.
- [ ] Run `git diff --check` and scan the diff for webhook URLs/tokens.
- [ ] Review trigger, branch, secret and channel mappings adversarially.
- [ ] Commit in small conventional commits, push the issue branch, create a draft PR against `refactor`, and move ISA-95 to `In Review`.
- [ ] Do not merge. Manual validation in Discord remains an explicit Isaac gate before `develop`.

## Task 7: Shared visual communication system

- [x] Keep native embeds as the accessible source of truth.
- [x] Generate dedicated 1200×630 HTML cards for Release, Testers, Development and Build.
- [x] Reuse the Vantare black/red material, typography, grid and Chrome capture contract.
- [x] Attach a stable PNG filename per audience and keep download/project/release links in the embed.
- [x] Fail before publishing when Chrome or the PNG artifact is unavailable.
- [x] Cover renderer escaping, Discord attachment names, workflow wiring and payload contracts with unit tests.
- [ ] Execute one real manual dispatch per lane and obtain Isaac's visual approval.

## Rollback

Revert the workflow/module/docs commits together. The previous workflows are self-contained and no database, Discord configuration or Linear data is mutated by this change.
