# ISA-894 — R3 Studio exclusivamente V2

Fecha: 2026-09-04. Rama `vantareapp/isa-894-retirada-v1-r3`, worktree
`C:\tmp\vantare-v1-retirada-r3\vantare-v2`, base exacta R2
`cc443e53ffa2ab0bf85fa62abb420fb72778bfa3`.

## Alcance

R3 migra Overlay Studio antes de borrar su dependencia. `StudioRoute` deja de
importar y construir `createWailsProjectionTelemetryAdapter`; el lifecycle de
Studio recibe el coordinador explícitamente y consume únicamente la proyección
OverlayFrame V2 de la sesión pull Wails existente.

Se conservan reset del store, listeners antes del arranque del pull,
idempotencia, reinicio, cleanup, callback `invalid-frame`, binding al
coordinador, diagnósticos, RaceSchedule, features V2 y ownership/dispose. No se
tocan los mocks de autoría de `StudioTelemetryProvider`, OBS, backend, productor,
rutas, flags, builders, tipos ni adapters compartidos.

R3 no significa que V1 haya salido del binario y no inicia aún la auditoría ni
el bucle de rendimiento V2.

## TDD RED -> GREEN

Primero se reescribió solo el test focal para construir el lifecycle de Studio
con `{ coordinator, pull, overlayV2Store }`, sin adapter V1.

Comando RED:

```text
pnpm --dir frontend test -- src/hub/overlay-studio/studio-overlay-telemetry.test.ts
```

Resultado: 3 tests fallidos. Causa literal:

```text
TypeError: Cannot read properties of undefined (reading 'coordinator')
at src/hub/overlay-studio/studio-overlay-telemetry.ts:46:33
```

La producción R2 leía `options.legacy.coordinator` al construir el adapter; el
RED demuestra el acoplamiento V1 real que R3 retira. El GREEN mínimo sustituye
esa dependencia por el coordinador existente y elimina `legacy.start/stop`.

Los tests verdes verifican orden listeners V2 -> pull, idempotencia, reset a
revisión 0, actualización V2 tras reinicio, cleanup y error original si falla
`pull.start()`, y callback ante un frame V2 inválido.

Commit de código/test/microplan: `b4c0a38cdc7125d1712f7a707148461e5dc29769`.

## Checks ejecutados

| Check | Resultado |
| --- | --- |
| Vitest focal lifecycle Studio | PASS, 1 archivo / 3 tests |
| Vitest StudioRoute + lifecycle + StudioTelemetryProvider | PASS, 3 archivos / 23 tests |
| `corepack pnpm --dir frontend typecheck` | PASS, exit 0 |
| `corepack pnpm --dir frontend build` | PASS, exit 0; aviso heredado de chunks >500 kB |
| ESLint en los tres archivos de comportamiento | PASS, exit 0 |
| `git diff --check` | PASS |
| `rg` de adapter V1/legacy en los dos archivos productivos | Cero coincidencias |
| Roadmap frontend | PASS, 3 archivos / 49 tests |
| Roadmap Python + contrato | PASS, 23 + 21 tests; digest `--check` sin cambios |

No se ejecutó suite Go porque R3 no cambia Go ni contratos compartidos. No se
abrieron apps, LMU o navegadores y no se leyeron `.env*`. No hubo benchmark ni
prueba física; la verificación manual final pertenece a Isaac.

## Reviews y riesgos

Review independiente de especificación Muse xhigh
`ses_f96748a29ffeuTz9Gdq49MyRqb` sobre `b4c0a38c`: **APPROVE**,
P0/P1/P2/P3 abiertos = 0. Confirmó alcance cerrado, contratos de lifecycle,
tests no debilitados y auxiliares intactos.

Review independiente de calidad/adversarial Muse xhigh
`ses_f96711213ffenLfc0LKeJ6ncbY` sobre `cb9a3068`: **APPROVE**,
P0/P1/P2/P3 bloqueantes = 0. Reprodujo el diff completo, ownership/StrictMode,
cleanup y error de arranque, tests, límites documentales y roadmap. Clasificó
la doble llamada preexistente a `pull.stop()` como redundante pero segura por
la guarda idempotente del cliente.

El CI remoto y la publicación de la PR son estados posteriores a este
documento; ninguna review autoriza merge o promoción.

Riesgos pendientes:

- OBS todavía construye el adapter V1; la ruta SSE y el productor no se pueden
  retirar hasta migrarlo.
- Los mocks/fixtures de autoría siguen usando formas legacy por decisión de
  alcance y se clasificarán antes de borrar tipos/builders.
- El adapter/decoder/shadow V1 continúa empaquetado por consumidores restantes.
- R3 no certifica rendimiento óptimo ni equivalencia física Wails/LMU.

Rollback: instalar la build anterior privada verificada en R0. No se añade un
flag V1 ni un fallback oculto al binario nuevo.
