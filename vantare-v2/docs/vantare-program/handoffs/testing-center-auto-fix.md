# Handoff vivo — Testing Center Auto-Fix

Última actualización: 2026-08-12, ISA-317, Codex (documentación).

## Resultado del proyecto

Convertir una incidencia enviada desde Testing Center en una corrección pequeña
y verificable sobre `nightly`, ejecutada en cloud y gobernada por TDD, gates
deterministas, review independiente, CI real, smoke post-merge y rollback por
PR. `testers` y `master` quedan fuera de la automatización.

## Autoridad y lectura obligatoria

1. `AGENTS.md`.
2. `docs/vantare-program/README.md` y contratos del programa.
3. Este handoff, único para el proyecto.
4. `docs/adr/0008-testing-center-hybrid-agent-autofix.md`.
5. `docs/superpowers/plans/2026-08-12-testing-center-hybrid-agent-autofix.md`.
6. `docs/branch-channels.md` y `docs/agent-workflow.md`.
7. Issue y dependencias vigentes en Linear.

ADR 0007 y los documentos del 2026-08-03 siguen siendo historia útil para
privacidad, saneamiento y rechazo. Su ruta `Supabase -> Linear -> Codex Cloud`
está superada como arquitectura de ejecución.

## Estado real

- Fase: documentación y replanificación TDD.
- Issue activa: ISA-317 / CCAF-02.
- Rama:
  `vantareapp/isa-317-ccaf-02-adr-de-arquitectura-y-handoff-vivo`.
- Base de creación:
  `origin/nightly@5069cbb1c0fb9ab2765093ebb1572f71a90ad5b5`; antes de ejecutar
  cualquier issue se debe registrar el SHA remoto Nightly vigente y rebasar de
  forma controlada si cambió.
- Último `origin/nightly` observado durante el review:
  `234794d238a59fa14be53431065bf88eca46459a`; sus cambios no alteran este ADR,
  pero `docs/current-plan.md` deberá reconciliarse antes del commit.
- Worktree: `C:\tmp\vantare-isa317`.
- Integración: ninguna; sin commit, push, PR, CI, merge o promoción al crear
  este handoff.
- Runtime: apagado. El workflow existente
  `.github/workflows/testing-center-codex-inert.yml` conserva `if: false`.
- Linear: espejo/proyecto de planificación; ya no es dependencia técnica de la
  arquitectura aprobada.

## Decisiones cerradas

- Supabase es autoridad del job y de la máquina de estados.
- GitHub es autoridad de código, PR, checks, merge queue, tag y release.
- Linear es opcional y asíncrono.
- OpenCode con `deepseek-v4-flash` clasifica, deduplica y propone aceptación en
  modo read-only.
- Claude Code con la suscripción Max produce RED y GREEN en sesiones separadas.
- DeepSeek no se anida por MCP dentro de Claude en la primera versión.
- Una sesión nueva Claude Code con `claude-opus-5 --effort high` revisa sin
  escribir.
- El agente nunca hace push directo a `nightly`; usa PR y merge queue.
- El tag automático usa el formato de cuatro componentes
  `vX.Y.Z.R-nightly.N` compatible con el sincronizador de versión.
- La metadata automática usa `TC-<12 HEX>` y amplía el contrato de fragmentos
  sin exigir una issue Linear.
- Smoke ocurre después del merge y antes del tag.
- Un fallo post-merge impide el tag y abre un PR automático de revert.
- Solo `rama automática -> nightly` puede llegar a preautorizarse. `testers` y
  `master` conservan autorización humana.
- Rollout: observe, draft, pilot, automatic y expanded.

## Arquitectura y ownership

```text
Testing Center
  -> Supabase: sanitize + job/outbox/lease/fencing
  -> OpenCode/DeepSeek: triage JSON read-only
  -> policy gate: eligible/ineligible
  -> Claude RED: test-only commit
  -> RED gate: expected behavioral failure
  -> Claude GREEN: minimal product fix
  -> diff gate: scope, ancestry, TDD and secrets
  -> Claude Opus reviewer: independent read-only verdict
  -> GitHub CI + merge_group
  -> merge queue (single PR) -> nightly
  -> smoke -> Nightly tag/release or revert PR
  -> Supabase callback and tester-visible state
```

Dependencias prohibidas para una issue auto-elegible: migraciones, auth,
billing, secretos, permisos, workflows, releases, dependencias/lockfiles,
arquitectura, borrado de datos, más de cinco archivos productivos o un test no
determinista.

## Evidencia actual

- Supabase ya tiene reportes, fingerprints, outbox, leases, fencing,
  candidatas, callbacks y tests PostgreSQL/Deno.
- El dossier v1 fija repo, base `nightly`, SHA, máximo cinco paths y command IDs,
  pero prohíbe merge/deploy/promoción y está ligado a Codex; v2 debe ser aditivo.
- El workflow Codex está inerte y con permisos `contents: read`.
- `branch-channel-gates.yml` ejecuta Go, frontend y build en Windows, pero lint
  y visuales son advisory.
- `validate_branch_channels.py` solo admite `vantareapp/isa-*` hacia Nightly.
- `release.yml` acepta tags de tres o cuatro componentes, pero el sincronizador
  de versión solo garantiza cuatro; el agente reservará `vX.Y.Z.R-nightly.N`.
  Construye con Wails/NSIS y verifica artefactos; todavía debe exponer
  `workflow_call` y un `source_sha` obligatorio.
- GitHub Merge Queue exige que los required checks escuchen `merge_group`; el
  workflow actual no lo hace.
- La acción oficial Claude Code admite `claude_code_oauth_token`; Claude Code
  permite generar el token de suscripción para CI mediante
  `claude setup-token`.
- OpenCode expone DeepSeek V4 Flash y el proveedor está disponible en el MCP;
  en el entorno local revisado se ofrece como
  `opencode-go/deepseek-v4-flash`.

## Riesgos y deuda

- P0: ninguno introducido; no hay runtime activo.
- P1: una preautorización demasiado amplia permitiría cambios inseguros. Debe
  ser una policy versionada, pequeña y revocable.
- P1: OAuth Max y API DeepSeek son credenciales externas; activación y rotación
  requieren a Isaac y nunca se documentan sus valores.
- P1: un required check omitido o skipped puede aparecer como éxito. El gate
  debe verificar presencia, app emisora, SHA y conclusión.
- P1: no existe todavía smoke post-merge ni reserva atómica de tags Nightly.
- P2: lint global y visuales advisory impiden automatizar esos scopes.
- P2: el validador de ramas y `AGENTS.md` todavía exigen una issue Linear; la
  excepción Supabase debe aprobarse antes del piloto.
- P2: las GitHub Actions externas actuales no están todas fijadas por SHA.
- P2: un OAuth de suscripción puede caducar o revocarse; el fallo debe ser
  `needs_owner`, nunca fallback a otra cuenta/API.
- P3: Linear y los nombres CCAF seguirán mostrando la arquitectura histórica
  hasta completar la replanificación del proyecto.

## Issues

### Terminadas o históricas

- ISA-316: spike Codex Cloud desde Linear, NO-GO; relacionado, no bloqueante.
- ISA-238–253: contratos y piloto humano previos; conservar evidencia, no
  ejecutar su ruta histórica.

### Activa

- ISA-317: ADR, handoff, plan TDD, índice y plan actual. Solo documentación.

### Siguientes cortes propuestos

1. Replanificar ISA-318–325 contra el plan TDD nuevo.
2. Contratos v2 y gate de elegibilidad, todo local/read-only.
3. Outbox/dispatch cloud y callback, dry-run.
4. OpenCode/DeepSeek triage sintético.
5. Claude Max RED/GREEN con PR draft y merge manual.
6. Opus review y diff gate.
7. CI `merge_group`, Wails y gates aplicables estrictos.
8. Smoke, tag Nightly y revert PR.
9. Piloto único con autorización; solo después, preautorización estrecha.

## Siguiente acción exacta

Cerrar ISA-317 con review documental P0/P1/P2=0 y rebasar el documento maestro
de Linear. Después, dividir ISA-318–325 para ejecutar Task 1 del plan: tests de
caracterización de la policy actual y contrato v2, sin red ni secretos.

Checks de ISA-317:

```powershell
git diff --check
python .github/scripts/test_validate_branch_channels.py -v
rg -n "TBD|TODO|implement later|fill in details" vantare-v2/docs/superpowers/plans/2026-08-12-testing-center-hybrid-agent-autofix.md
```

Verificación manual: leer ADR, handoff y plan de principio a fin; confirmar que
ningún paso afirma que un modelo autoriza merge/tag y que no se ha habilitado
ningún workflow.
