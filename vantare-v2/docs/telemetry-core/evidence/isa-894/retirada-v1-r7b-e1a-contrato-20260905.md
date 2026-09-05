# ISA-894 R7b/E1a — contrato sin snapshot + previews auxiliares/V2

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base E1a `9096beef`.

## Alcance

Solo E1a. Sin E1b/E1c/E1d/E2+.

- `WidgetTypeDefinition` pierde `TelemetrySnapshot` y las firmas
  `buildViewModel`/`buildRuntimeViewModel`/`buildPreviewViewModel`.
- `race-schedule` y `engineer-radio` pierden sus tres firmas snapshot
  ignoradas y conservan `buildAuxiliaryViewModel` y sus fuentes
  (Calendar / Engineer) intactas.
- `track-map` pierde el `buildPreviewViewModel` snapshot-real de la
  definition. El live V2 ya está cableado en el registro y el builder de
  preview V2 existe sin caller; no se inventan datos ni se crea otra capa de
  compatibilidad. Los builders snapshot
  (`track-map-view-model.ts`) y sus tests se conservan para el oráculo
  E4; su borrado es dueño E1c/E4.
- Ajustes mínimos para `typecheck` verde exigidos por el propio
  contrato: `authoring-fixtures` llama al builder puro de Engineer y su
  fallback pasa a `throw`; el `default` del comparador pasa a `throw`
  (los 18 V2 ya tienen rama explícita; los auxiliares nunca llegaban
  allí porque no tienen entrada V2).

## TDD RED → GREEN

- RED `79856dba`: `e1a-retirada.test.ts` 3 failed / 1 passed
  (contrato, auxiliares y track-map aún publicaban snapshot).
- GREEN `c99770a5`: el mismo focal pasa; la autoridad auxiliar queda
  probada sin snapshot (Calendar 1 evento, Engineer missing/preview).

## Checks

- Focales E1a (contrato, engineer-radio, race-schedule x2, track-map
  V2, guard, registro): 31/31 PASS.
- Vecinos (Host x2, catalog, comparador, track-map legacy): 87/87 PASS.
- `pnpm typecheck` (`tsc -b --noEmit`): verde.
- `pnpm build`: PASS (aviso chunks preexistente).
- `git diff --check`: limpio.
- `rg`: cero `TelemetrySnapshot` en `widget-definition.ts` y en las
  tres definitions E1a; cero
  `buildViewModel|buildRuntimeViewModel|buildPreviewViewModel` en esas
  tres definitions (exit 1 = ausencia).
- Suite completa no ejecutada; queda para E1d/F1.

## Riesgos y límite exacto

- `track-map-view-model.ts` snapshot sigue vivo para E4; no usarlo
  como autoridad nueva.
- `authoring-fixtures.ts` y comparador conservan el resto de builders
  legacy por llamada directa; su retirada total es E1b/E1c/E4.
- Siguiente: E1b. Sin push, PR, merge, promoción, apps ni LMU.

## Review adversarial

`ses_f90150e42ffelt0XRK9JV2t3oI`: **APPROVE**, P0/P1/P2 = 0; tres P3
informativos (precisión de redacción Track Map, modos equivalentes no
duplicados en test y limpieza final de asserts legacy asignada a E1d/F1).
