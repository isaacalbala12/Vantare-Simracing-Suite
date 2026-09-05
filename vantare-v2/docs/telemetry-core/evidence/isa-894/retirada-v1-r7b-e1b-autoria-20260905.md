# ISA-894 R7b/E1b — harness snapshot de Studio fuera (corte mínimo, P1 cerrado)

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base E1b `ceff6697`.

## Alcance

Solo E1b. Sin E1c/E1d/E2+.

- Retirado del árbol un único módulo:
  `frontend/src/hub/overlay-studio/canvas/fixtures/studio-v1-snapshot-test-harness.ts`
  (`useStudioV1SnapshotTestHarness`, cero importadores verificados
  por `rg`; solo el guard B1 lo citaba como diferido E1).
- Guard B1 actualizado en lo directo: el harness sale de la lista de
  diferidos E1 presentes. Ningún otro lock del guard cambia.
- D5 (Calendar/Engineer) y E4 (comparator/oráculo) intactos.

## P1 del orquestador (cerrado aquí, sin reescribir historia)

- El primer intento E1b borró además
  `authoring-v2-scenario-widget.ts` y copió su lógica (~63 líneas) a
  `authoring-v2-workshop-frame.ts`: churn, no simplificación; violaba
  Ponytail y el "sin trasladar duplicación".
- Corrección con commits nuevos: `4d4f6ca6` restaura el helper
  byte-idéntico desde la base y revierte las migraciones de
  `authoring-v2-workshop-frame.ts`, `OverlayParityHarness.tsx` y su
  test; `59140b41` deja el RED y el guard en harness-only, y `048b045b`
  evita fijar la deuda E1c como requisito positivo.
- El helper queda con dueño explícito **E1c** y cae junto al
  megamódulo `authoring-fixtures.ts`; E1b no fija su presencia en tests.

## Límite honesto (STOP, no ampliado)

- `authoring-fixtures.ts` no se toca: `contract.test.tsx` lo exige
  con builders legacy (dueños E1c).
- Los `import type { Mock*Scenario }` de Studio/queries siguen vivos:
  su retirada es dueña E1d. No se tocan.
- El microplan asigna el helper y el megamódulo juntos a E1c.

## TDD RED → GREEN

- RED inicial `62a541b5`: 2 failed / 2; quedó superado al rechazar el
  traslado del helper. El contrato final harness-only pasa 1/1 en `048b045b`.
- Borrado físico del harness en `59c564a0` (cero callers; el build
  habría fallado ante un import colgado).

## Checks

- Focales E1b + guard B1 + E1a + autoridad + Parity: 71/71 PASS.
- `pnpm typecheck` (`tsc -b --noEmit`): verde.
- `pnpm build`: PASS (solo aviso preexistente de chunks > 500 kB).
- ESLint de los ficheros tocados: limpio.
- `rg studio-v1-snapshot-test-harness|useStudioV1SnapshotTestHarness`:
  cero restos fuera del propio test/guard histórico.
- `git diff --check`: limpio.
- Suite completa no ejecutada; queda para E1d/F1.

## Siguiente

E1c (megamódulo + helper juntos) y E1d (núcleo `mock-scenarios`/
coordinator + tipos Studio). Sin push, PR, merge, promoción, apps
ni LMU.

## Review adversarial

`ses_f9002a0fbffeti4QtvJc4maIzG` confirmó P0/P1 = 0 y detectó dos P2
documentales corregidos en este commit; no hay cambio productivo pendiente.
