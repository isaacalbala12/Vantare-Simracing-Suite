# ISA-760 — baseline Wails Redline comparable con Qt

Estado: en ejecución sobre `origin/nightly@f71a43aceef39df0aee3cd9f69ab52efeeac31c8`.

## Objetivo

Medir Standings Redline dentro de Wails/WebView2 real usando exactamente los
mismos ViewModels custodiados por ISA-738. El corte produce un baseline; no
optimiza producto ni decide una migración.

## Autoridades y límites

- `WidgetVisualHost` sigue siendo la frontera productiva compartida.
- El harness importa `StandingsEndurance` y selecciona `standings-redline`; no
  copia el renderer ni crea otro catálogo.
- Telemetry Core, proyecciones, cadencias, perfiles y ventanas productivas no se
  modifican.
- Qt ISA-738 permanece intacto y Wails continúa como único runtime principal.
- No se añaden dependencias, selector, sidecar, IPC productivo ni PR.

## Contrato de equivalencia

| Capa | Wails | Qt ISA-738 | Clasificación inicial |
| --- | --- | --- | --- |
| Input | `StandingsViewModel` JSONL custodiado | mismo JSONL | `VALID` si coinciden SHA-256 y escena |
| Aplicación de modelo | React commit síncrono | `applySnapshot()` QML | `DEGRADED`: ambos aplican el modelo, pero difiere el motor |
| Layout | lectura forzada tras commit | sync del scene graph | `DEGRADED` |
| Presentación | siguiente `requestAnimationFrame` | `frameSwapped` | `UNRESOLVED`: rAF no demuestra scan-out/DWM |
| CPU/RAM | árbol Wails + WebView2 | no custodiado en ISA-738 | `UNRESOLVED` hasta medir Qt con el mismo sampler |

No se publicará una conclusión Wails versus Qt desde una fila `DEGRADED` o
`UNRESOLVED`.

## Implementación mínima

1. Copiar byte a byte los corpus canonical y stress104 y verificar sus hashes.
2. Añadir un entry Vite de benchmark separado del build productivo.
3. Renderizar `StandingsEndurance` a la cadencia declarada, sin `StrictMode` de
   desarrollo, y registrar por snapshot:
   - inicio y fin del commit React;
   - fin del layout forzado;
   - primer rAF posterior;
   - filas esperadas y observadas.
4. Alojar el bundle en una ventana Wails transparente dedicada. El resultado se
   devuelve una sola vez al host y se escribe fuera del hot path.
5. Ejecutar desde PowerShell con worktree limpio, binario/corpus hasheados,
   muestreo del árbol de procesos, timeout y comprobación de residuos.
6. Agregar los raw de forma independiente y fallar cerrado ante trazas
   incompletas, hashes distintos, WebView2 no demostrado o cardinalidad errónea.

## Tests y gates

- Test frontend del parser, selección de escena y contrato de trace.
- Test Go de validación/escritura del resultado y argumentos.
- Test PowerShell del agregador con fixtures PASS y corruptas.
- `pnpm --dir frontend typecheck`, focales, build benchmark y build frontend.
- `go test` focal y `go test ./...` si el host Go entra en el módulo.
- Tres runs exploratorios; diez runs finales solo con preflight de host limpio.
- Inspección manual de una ventana transparente con el Standings correcto.

## Archivos esperados

- `frontend/wails-redline-benchmark.html`
- `frontend/vite.wails-redline-benchmark.config.ts`
- `frontend/src/overlay-benchmark/**`
- `tools/benchmarks/isa760-wails-redline/**`
- este plan y `docs/vantare-program/handoffs/overlays-launcher-hub.md`

Si hacen falta cambios fuera de esas rutas, una dependencia, una modificación
del renderer productivo o un segundo enfoque de presentación, se detiene el
corte y se reevalúa el alcance.

## Cierre

El baseline termina cuando raw, manifest y agregación reproducible permiten
clasificar cada capa como `VALID`, `DEGRADED`, `INVALID` o `UNRESOLVED`. La rama
puede publicarse como evidencia; no abre PR ni promueve a ningún canal.
