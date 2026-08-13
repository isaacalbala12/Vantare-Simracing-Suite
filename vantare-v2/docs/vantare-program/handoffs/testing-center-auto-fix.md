# Handoff vivo — Testing Center Auto-Fix

Última actualización: 2026-08-13, ISA-318, Codex (HAF-03–HAF-07 entregadas).

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

- Fase: gobierno inerte, contratos, persistencia, triage, dispatch, TDD cloud,
  diff gate y review independiente entregados en ramas aisladas; runtime
  apagado.
- Issues de ejecución: ISA-318, ISA-319, ISA-320, ISA-321 e ISA-323 entregadas
  para revisión; ISA-322 queda como siguiente corte.
- Rama:
  `vantareapp/isa-317-ccaf-02-adr-de-arquitectura-y-handoff-vivo`.
- Base de creación:
  `origin/nightly@5069cbb1c0fb9ab2765093ebb1572f71a90ad5b5`.
- Base actual reconciliada:
  `origin/nightly@234794d238a59fa14be53431065bf88eca46459a`.
- Worktree: `C:\tmp\vantare-isa317`.
- Integración: rama remota publicada y PR draft #209 hacia `nightly`; los gates
  del PR pasan y siempre deben verificarse contra su HEAD remoto vigente. Sin
  merge, tag, release o promoción.
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

- ISA-319 / HAF-04: commit remoto `02a784c3`, PR draft #213 hacia `nightly`;
  policy/dossier v2 con suites Deno 147/147, 11/11 y 10/10, checks GitHub en
  verde y review independiente GO. Entregada, no integrada.
- ISA-320 / HAF-05: commit remoto `842da34e`, PR draft #214 hacia `nightly`;
  job_key canónico, máquina de estados, outbox por fase, lease/fencing,
  reservas, callbacks, RLS y rollback fail-closed. TDD RED→GREEN cerró la
  revalidación terminal entre claim y reserve. Evidencia fresca: pgTAP 71/71,
  rollback/reapply 71/71, carrera real de dos workers, cinco guards por tabla,
  guard terminal y reapply final. Qwen 3.7 Plus y Qwen 3.8 Max: GO; el último
  con P0/P1/P2=0. Entregada, no integrada.
- ISA-321 / HAF-06: commits remotos `0dbcce7` y `58f55ef`, PR draft #215 hacia
  `nightly`, apilado temporalmente sobre ISA-320. Entrega triage DeepSeek
  read-only con parser/schema cerrados y dispatch GitHub App con credencial JIT,
  repo/event/base fijos, timeouts, lease/fencing, revocación best-effort y
  endpoint service-role. Deno 53/53; el PostgreSQL heredado repite 71/71,
  reapply, carrera real y rollback guards. Review Opus high: GO, P0/P1=0; los
  P2 accionables quedaron corregidos con TDD. GitGuardian y promotion path
  pasan en `58f55ef`. Entregada, no integrada ni activada.
- ISA-323 / HAF-07: HEAD remoto `756e2e26`, PR draft #216 hacia `nightly`,
  apilado temporalmente sobre ISA-321. Entrega sesiones Claude RED/GREEN
  separadas, collector confiable, diff gate ligado a SHA/tree/evidencia y
  revisión Opus read-only con control independiente. Deno 45/45; PostgreSQL
  71/71 con reapply, carrera y rollback guards; gate 24/24; collector 22/22;
  canales 10/10; formato, tipos, lint, sintaxis y diff-check pasan. Opus 5 High:
  GO, P0/P1/P2=0. Los dos checks GitHub pasan en el SHA exacto. Entregada, no
  integrada ni activada.
- ISA-318 / HAF-03: HEAD remoto `30beb873`, PR draft #217 hacia `nightly`,
  apilado temporalmente sobre ISA-323. Conserva los canales humanos y añade el
  contrato cerrado de rama automática y atestación v2; la CLI no puede
  suministrarla, de modo que el bootstrap sigue inerte. Branch channels 41/41,
  gate 24/24, collector 22/22, `py_compile` y diff-check pasan. Opus 5 High:
  GO, P0/P1/P2=0; su precisión documental P3 se cerró antes del HEAD publicado.
  Entregada, no integrada ni activada.
- Las cinco ramas parten, directa o apiladamente, de
  `origin/nightly@b6df494298578ff9a043bbd9b48a66eb1512010f`.
  No existe activación remota, merge, promoción, deploy, tag ni release.

- Supabase ya tiene reportes, fingerprints, outbox, leases, fencing,
  candidatas, callbacks y tests PostgreSQL/Deno.
- El dossier v1 fija repo, base `nightly`, SHA, máximo cinco paths y command IDs,
  pero prohíbe merge/deploy/promoción y está ligado a Codex; v2 debe ser aditivo.
- El workflow Codex está inerte y con permisos `contents: read`.
- `branch-channel-gates.yml` ejecuta Go, frontend y build en Windows, pero lint
  y visuales son advisory.
- `validate_branch_channels.py` admite ramas humanas `vantareapp/isa-*` y, solo
  mediante su API interna con atestación cerrada, ramas automáticas `tc-*`
  hacia Nightly. La CLI no expone esa entrada y falla cerrada.
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
- P2 de activación: la excepción automática ya está documentada y modelada,
  pero ISA-322 debe verificar firma, procedencia, frescura, digest y estado vivo
  de GitHub antes de que pueda producir efectos.
- P2: las GitHub Actions externas actuales no están todas fijadas por SHA.
- P2: un OAuth de suscripción puede caducar o revocarse; el fallo debe ser
  `needs_owner`, nunca fallback a otra cuenta/API.
- P3 de activación: el contrato Deno comprueba el workflow por contenido; el
  cierre remoto valida el YAML, pero conviene mantener un parse/lint YAML
  explícito en CI antes de activar.
- P3 de activación: `--add-dir` y `--json-schema` se contrastaron con la
  documentación oficial, pero deben probarse también contra la acción y SHA
  pineados en el job real antes de retirar la inercia.
- P1 de activación: el claim genérico de ISA-320 todavía no filtra
  `effect_kind`; antes de activar HAF-06 debe reclamar solo `github_dispatch`.
- P1 de activación: ningún caller programa todavía
  `testing_center_expire_reserved_agent_effect`; un efecto reservado cuya
  completion falle debe reconciliarse a `needs_owner` antes del piloto.
- P3: Linear y los nombres CCAF seguirán mostrando la arquitectura histórica
  hasta completar la replanificación del proyecto.
- Review documental independiente DeepSeek V4 Flash: GO tras dos rondas,
  P0/P1/P2=0. Se corrigieron idempotencia por fase, policy completa, bootstrap
  en rama predeterminada, SHA de release, revert, fixtures, rollback y comandos.

## Issues

### Terminadas o históricas

- ISA-316: spike Codex Cloud desde Linear, NO-GO; relacionado, no bloqueante.
- ISA-238–253: contratos y piloto humano previos; conservar evidencia, no
  ejecutar su ruta histórica.

### Activas

- ISA-317: expediente documental y handoff vivo, PR draft #209.
- ISA-319 / HAF-04: policy v2 entregada, PR draft #213; revisión/integración pendiente.
- ISA-320 / HAF-05: persistencia/outbox entregada, PR draft #214; revisión/integración pendiente.
- ISA-321 / HAF-06: triage/dispatch cloud entregado, PR draft #215; revisión/integración pendiente.
- ISA-323 / HAF-07: TDD/diff gate/review Opus entregado, PR draft #216; revisión/integración pendiente.
- ISA-318 / HAF-03: gobierno/preautorización inerte entregado, PR draft #217; revisión/integración pendiente.

### Siguientes cortes vigentes

1. ISA-322 / HAF-08: verificación criptográfica, bootstrap, CI estricta y `merge_group`.
2. ISA-324 / HAF-09: smoke, reserva/release/callback/revert.
3. ISA-325 / HAF-10: rollout observe→draft→pilot→automatic.

## Siguiente acción exacta

Revisar los PR draft #213–#217 contra sus SHAs remotos y respetar el orden
ISA-319 -> ISA-320 -> ISA-321 -> ISA-323 -> ISA-318. Continuar ISA-322 sin
crear nuevas issues, declarando cualquier apilado temporal y sin
activar red, credenciales o una ruta que salte `nightly`. El claim tipado, el
reconciliador y los dos P3 de activación son condiciones obligatorias antes del
piloto, reutilizando ISA-318–325.

Checks de ISA-317:

```powershell
git diff --check
python .github/scripts/test_validate_branch_channels.py -v
rg -n "TBD|TODO|implement later|fill in details" vantare-v2/docs/superpowers/plans/2026-08-12-testing-center-hybrid-agent-autofix.md
```

Verificación manual: leer ADR, handoff y plan de principio a fin; confirmar que
ningún paso afirma que un modelo autoriza merge/tag y que no se ha habilitado
ningún workflow.
