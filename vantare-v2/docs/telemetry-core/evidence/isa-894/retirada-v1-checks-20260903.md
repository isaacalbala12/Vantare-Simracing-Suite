# ISA-894 · R0 — regresiones de la base

Fecha: 2026-09-03. Raíz Git `C:\tmp\vantare-v1-retirada-r0`; aplicación
`C:\tmp\vantare-v1-retirada-r0\vantare-v2`. Rama
`vantareapp/isa-894-retirada-v1-r0`; base exacta
`8e8ec17b2d2b660d717316c10925a6b93d073d1c` del candidato #969.
Código igual a 4864b5c6; R0 sólo modifica documentos y roadmap generado.

## Comandos ejecutados, cada uno con salida independiente

Desde raíz Git se instalaron las dependencias bloqueadas ya disponibles:

```powershell
corepack pnpm --filter vantare-overlay install --offline --frozen-lockfile --ignore-scripts
```

Exit 0. Lockfile sin actualizar, 848 paquetes añadidos, 846 reutilizados, cero
descargas. Sin nuevas dependencias, `.env*`, enlaces a node_modules ajenos ni apps.

Los siguientes se ejecutaron desde la raíz de aplicación:

| Comando | Resultado literal relevante | Salida |
| --- | --- | --- |
| `corepack pnpm --dir frontend exec vitest run src/overlay/core/v1-authority-guard.test.ts src/overlay/transports/legacy-retirement.test.ts src/telemetry-transport/overlay-wails-pull.test.ts --maxWorkers=2` | 3 archivos, 16 tests PASS; 11,82 s | 0 |
| `corepack pnpm --dir frontend typecheck` | `tsc -b --noEmit` completado | 0 |
| `corepack pnpm --dir frontend build` | 1102 módulos; entradas index/overlay; Vite build 2,12 s | 0 |
| `go test ./internal/app -run 'TestResolveOverlayV1Emit\|TestOverlayV1EmissionSwitch\|TestOverlayV1EmissionGuard' -count=1` | `ok github.com/vantare/overlays/v2/internal/app 0.310s` | 0 |
| `go test ./internal/app/telemetrytransport ./internal/telemetry/projection/... ./pkg/config -count=1` | Ocho paquetes `ok`: transporte, projection, analysis, engineer, overlay, overlayv2, strategy, config | 0 |

En la tabla, `\|` escapa el separador Markdown; el patrón pasado al comando Go
fue `'TestResolveOverlayV1Emit|TestOverlayV1EmissionSwitch|TestOverlayV1EmissionGuard'`.
El build frontend precedió a tests de `internal/app` que pueden depender del
embed. Los ocho paquetes sin embed pudieron ejecutarse antes.

Advertencias no ocultadas: Node DEP0169 durante instalación y aviso Vite de
chunks mayores de 500 kB (aprox. 958/987 kB). No son fallo de build ni evidencia
de coste runtime; no se modificó build/configuración para silenciarlos.

## Garantías a conservar en los cortes

| Prueba actual | Qué conservar al retirar V1 |
| --- | --- |
| `internal/app/overlay_v1_guard_test.go` | AST negativo frente a emisiones globales/puentes no autorizados. Sustituir exactamente-un-productor-condicionado por cero productor legacy sólo en su corte; no borrar la guardia entera. |
| `overlay_v1_emit_test.go` | Hoy prueba switch/resolución ON/OFF. Al retirar el campo/env, probar ausencia de camino legacy; no dejar un switch muerto de rollback dentro del binario. |
| `frontend/src/overlay/core/v1-authority-guard.test.ts` | Lista congelada de coexistencia e importadores: reducir con cada conjunto retirado, preservar pruebas negativas de autoridad. Su texto histórico no veta el maestro nuevo. |
| `overlay/transports/legacy-retirement.test.ts` | Ausencia de entradas/selectores y caminos legacy prohibidos; no confundirla con un test funcional de todo V2. |
| Go `overlay_pull_test.go`, `publisher_test.go`; TS `overlay-wails-pull.test.ts` | Una entrega pendiente, replay perdido, latest-wins, ACK/generación antigua, cierre/cancelación, estado sin frame y respuesta sin cambio. Cambiar el payload probado a V2 sin perder escenarios. |
| `typescript_contract_test.go` / generador | Contratos Go–TS/rutas/productos coherentes. Retirar sólo overlay V1; Strategy/Engineer no son objetivos por llevar v1 en el nombre. |
| Tests de builders, fixtures, historiales y shadow | Extraer assertions semánticas útiles hacia V2/auxiliar antes de eliminar compatibilidad. No imponer otra campaña física de paridad V1 ni reescribir expectativas para esconder defectos. |

## No ejecutado y significado

- Suite completa Go/frontend, lint global, race/bench: R0 no cambió producción;
  el primer corte de código exige sus gates completos por separado.
- Vantare, Wails real, LMU, PresentMon, CDP, benchmark o test de rollback físico:
  fuera de R0; Isaac conserva las pruebas manuales.
- No hay prueba nueva de rendimiento óptimo o superior a LMU, ni de ausencia
  total de V1. Estos PASS sólo fijan una base antes de tocarla.

Los checks documentales finales y las revisiones independientes se registran
en el [handoff vivo](../../../vantare-program/handoffs/telemetry-core.md), con
SHA de revisión y estado remoto distintos de estos resultados locales.
