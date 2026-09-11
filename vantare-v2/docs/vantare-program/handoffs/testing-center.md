# Handoff vivo — Testing Center

Última actualización: 2026-09-10, ISA-728 integrada en Nightly, Codex con verificación de Muse Spark 1.3 Contributor.

## Autoridad y alcance

Testing Center mantiene su proyecto separado de los módulos de producto.
GitHub Issues contiene el estado operativo; `../execution-policy.md`,
`../../branch-channels.md` y `../../../AGENTS.md` fijan las autorizaciones.
ISA-318 y ISA-322 corresponden a las issues migradas [#607](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/607)
y [#611](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/611).

## ISA-728 — validación del workflow inerte

- Base: `nightly` en `a9b8dd3695c66856e931d73650d54c4f6cb9e828`.
- Rama: `vantareapp/isa-728-inert-workflow-validation`.
- Código corregido: `5798d5eb4d7752d79c1708480266b6689b415ff2`.
- Worktree: `C:/tmp/vantare-isa728`; Muse usa otro worktree para verificar.
- Estado: integrada en `nightly` mediante la PR [#1108](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/1108).
  SHA de integración de código: `a2958ea1c26e4e74dbaad3827382c36cb8d7de37`.
- Corrección, regresión y revisión independiente aprobadas. SHA publicado,
  PR y resultados remotos se registran en
  [#728](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/728).
- Sin promoción a Testers o Master ni release. Este corte es independiente del
  candidato de widgets #1098 / PR #1107.

GitHub rechazaba el workflow antes de crear trabajos. La [anotación del run](https://github.com/isaacalbala12/Vantare-Simracing-Suite/actions/runs/34500227769)
identifica `runner.temp` en las líneas 156 y 219: ese contexto no está
disponible en `jobs.<job_id>.env`, incluso si el trabajo está desactivado.
Las dos declaraciones de `MANIFEST_PATH` pasan al entorno de los cinco pasos
que consumen el manifiesto, conservando su ruta bajo la carpeta temporal del
ejecutor. La [tabla de contextos de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)
admite `runner` en `steps.env`.

## Evidencia y límites

- Muse confirmó el fallo estructural y que el contrato anterior pasaba sus
  14 pruebas sin detectarlo. Logs locales en su `.task/isa-728-evidence/`.
- La nueva regresión falla con el workflow original; el candidato pasa las
  15 pruebas Deno, formato y `git diff --check`.
- Muse revisó `5798d5eb`: APROBADO, sin hallazgos P0, P1 o P2, y confirmó las
  15 pruebas. Codex revisa los cambios documentales posteriores; el código
  permanece idéntico al SHA revisado.
- Comprobación local con PyYAML ya instalado: YAML válido y los cinco
  consumidores conservan la misma variable en el entorno de su paso. Esto no
  sustituye al validador remoto de GitHub Actions.
- Evidencia local de implementación en `vantare-v2/.task/isa-728-evidence/`.
- No hay cambios de Go, frontend o contratos de telemetría; no se repiten sus
  suites locales para este arreglo. Los gates oficiales se verifican en la PR.

## Decisiones y siguiente acción

Se conservan los dos disparadores, la fixture manual `small-frontend-bug`,
permisos de lectura, acciones fijadas por SHA y todos los trabajos productivos
desactivados. No se configura ningún proveedor, secreto, ruleset ni auto-merge.

La integración de Nightly quedó registrada con el merge de la PR #1108 y el
SHA `a2958ea1`. El resultado del CI postmerge y la punta vigente se cierran en
la issue de integración [#1109](https://github.com/isaacalbala12/Vantare-Simracing-Suite/issues/1109).
La siguiente promoción a Testers requiere feedback Pro Plus y la aprobación
reservada a Isaac.
No reenviar eventos
`repository_dispatch` ni activar correcciones automáticas.
