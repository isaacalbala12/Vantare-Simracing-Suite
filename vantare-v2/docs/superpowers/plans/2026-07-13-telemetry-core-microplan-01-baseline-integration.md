# Telemetry Core Microplan 01 Baseline and Integration Implementation Plan

> **Estado: COMPLETADO.** ISA-23, ISA-24, ISA-25, ISA-96 e ISA-97 están integradas en `develop@f492007`. Este archivo se conserva como trazabilidad histórica y no debe volver a ejecutarse. La evidencia actual vive en `docs/telemetry-core/`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una base integrada y auditable de `refactor` + `codex/engineer-release` sin perder Overlay ni funcionalidad Engineer.

**Architecture:** Primero se genera evidencia sin merge; después se autoriza un merge real en la rama de integración. Conflictos se resuelven por ownership: `refactor` manda en Overlay/runtime V3; Engineer Release manda en monitores/tests; infraestructura de telemetría queda marcada para sustitución, no “fusionada” a mano.

**Tech Stack:** Git worktrees, Go tests, Vitest/Playwright, PowerShell, Wails smoke.

---

## Issue TC-01A — Baseline de refs y simulación

**Files:**
- Create: `docs/telemetry-core/baseline-refs.md`
- Create: `docs/telemetry-core/merge-conflicts.md`
- Create: `docs/telemetry-core/engineer-rescue-matrix.md`

- [ ] **Step 1: registrar refs inmutables**

```powershell
$refactor = git rev-parse refactor
$engineer = git rev-parse codex/engineer-release
$develop = git rev-parse develop
$mergeBase = git merge-base refactor codex/engineer-release
$refactor
$engineer
$develop
$mergeBase
```

Expected: cuatro SHA completos. Crear `docs/telemetry-core/baseline-refs.md` con `apply_patch` y pegar exactamente esos cuatro valores bajo `refactor`, `engineer-release`, `develop` y `merge-base`. No usar redirección shell para editar el repo.

- [ ] **Step 2: simular el merge sin modificar la rama**

```powershell
git merge-tree (git merge-base refactor codex/engineer-release) refactor codex/engineer-release > $env:TEMP\telemetry-core-merge-tree.txt
Select-String -Path $env:TEMP\telemetry-core-merge-tree.txt -Pattern '<<<<<<<|changed in both|added in both'
```

Documentar cada conflicto con owner `OVERLAY`, `ENGINEER`, `SHARED` o `DOCS`; no usar “resolver después”.

- [ ] **Step 3: construir la matriz Engineer**

La matriz contiene todos los directorios de `internal/engineer` y columnas:

```markdown
| Module | Branch paths | Tests | Class | Real input | Decision evidence | Target package |
|---|---|---:|---|---|---|---|
| spotter | internal/engineer/spotter | yes | KEEP | spatial LMU | replay + geometry tests | internal/engineer/spotter |
| telemetry/service | internal/engineer/telemetry/service | yes | ADAPT | duplicate | second orchestration | remove after cutover |
```

No clasificar `REPLACE/DELETE` para lógica funcional sin comentario de Isaac.

- [ ] **Step 4: gates documentales**

```powershell
git diff --check
rg -n "PLACEHOLDER|PENDING_DECISION" docs/telemetry-core
```

Expected: `git diff --check` PASS y búsqueda sin placeholders.

- [ ] **Step 5: commit**

```powershell
git add docs/telemetry-core/baseline-refs.md docs/telemetry-core/merge-conflicts.md docs/telemetry-core/engineer-rescue-matrix.md
git commit -m "docs(telemetry): baseline integration and engineer rescue"
```

**Pause:** Isaac aprueba matriz y ownership antes de TC-01B.

## Issue TC-01B — Caracterización antes del merge

**Files:**
- Create: `docs/telemetry-core/current-runtime-baseline.md`
- Create: `docs/telemetry-core/test-baseline.md`
- Create: `internal/telemetry/testdata/live-session/README.md`
- Test: suites existentes; no producción.

- [ ] **Step 1: ejecutar baseline `refactor`**

```powershell
go test ./internal/telemetry/... ./internal/app/... ./internal/server/... -count=1
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend visual:overlay-studio
```

Registrar PASS/FAIL exacto, duración y fallos preexistentes.

- [ ] **Step 2: ejecutar baseline Engineer en su worktree/ref**

```powershell
git worktree list
git -C C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer status --short
Push-Location C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer\vantare-v2
go test ./internal/engineer/... -count=1
Pop-Location
```

Expected: worktree `codex/engineer-release` limpio y suite Engineer ejecutada desde su subproyecto Go. No modificar ese worktree.

- [ ] **Step 3: caracterizar runtime dinámico**

Con LMU apagado y después encendido, documentar:

- source kind/name;
- número de attaches `LMU_Data` en logs;
- REST polling;
- payload Wails y SSE;
- Engineer source/connected;
- mock/synthetic notifications;
- shutdown sin goroutines colgadas.

No añadir instrumentación permanente. Si falta observabilidad, crear una issue de test/tooling separada.

- [ ] **Step 4: commit**

```powershell
git add docs/telemetry-core/current-runtime-baseline.md docs/telemetry-core/test-baseline.md internal/telemetry/testdata/live-session/README.md
git commit -m "test(telemetry): capture live runtime baseline"
```

**Pause:** Isaac revisa resultados reales.

## Issue TC-01C — Merge controlado en rama de integración

**Files:** todos los conflictos listados en `merge-conflicts.md`; no añadir features.

- [ ] **Step 1: verificar rama y limpieza**

```powershell
git status --short
git branch --show-current
```

Expected: rama de integración declarada en Linear y working tree limpio.

- [ ] **Step 2: realizar merge sin commit**

```powershell
git merge --no-ff --no-commit codex/engineer-release
git status --short
```

- [ ] **Step 3: resolver con ownership aprobado**

- Overlay/Studio/telemetry público: conservar `refactor` hasta TC-02/03.
- Monitores/tests/docs Engineer: conservar Engineer Release.
- `main.go`, app/server y telemetry shared: integración mínima que compile; no diseñar core todavía.
- No activar simulator/replay como fallback nuevo.

- [ ] **Step 4: verificar compilación y suites focalizadas**

```powershell
gofmt -w internal cmd
go test ./internal/engineer/... ./internal/telemetry/... ./internal/app/... ./internal/server/... -count=1
pnpm --dir frontend test
pnpm --dir frontend build
git diff --check
```

- [ ] **Step 5: commit de merge**

```powershell
Push-Location ..
git add -u -- vantare-v2
git diff --cached --name-only
git commit
Pop-Location
```

Expected: la lista staged coincide exactamente con el merge y sus resoluciones catalogadas; si aparece una ruta ajena, restaurarla del index antes de continuar. El mensaje de merge conserva los parents. No squash.

**Stop conditions:** pérdida de tests Engineer, cambio visual Overlay, más conflictos que los inventariados o necesidad de modificar funcionalidad para compilar.

**Pause final:** code review y aprobación de la base integrada.
