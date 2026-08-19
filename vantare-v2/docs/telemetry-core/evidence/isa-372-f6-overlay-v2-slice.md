# ISA-372 / F6 — vertical slice OverlayFrame v2

Fecha: 2026-08-19.

Rama: `vantareapp/isa-372-tc-f6-overlay-frame-v2-slice`.

Base: `tc-integration@bafe94d5bfb5aa018bf038810e0e795120aaf734`
(Nightly + F0 + F1 + F4 + F5 + F2 + F3).

## Resultado

`OverlayFrameV2` es un contrato aditivo y compacto. Conserva unidades SI y
calidad por valor con `QValue { v?, q }`, y usa arrays para standings y
relative. En este slice solo se pueblan `session`, `player` y `capabilities`;
`standings`, `relative`, `delta`, `fuel` y `spotter` ya tienen su forma final,
pero no inventan datos. Los tipos TypeScript salen de
`tools/telemetry-contract-gen`.

El runtime construye v2 después de aceptar el commit del engine. Publica v1
primero y v2 después, dentro de la frontera de fallo recuperable de F1. El flag
backend `OverlayFrameV2Shadow` es default-on y permite rollback explícito. El
publisher es latest-wins, cuenta descartes y repite el último snapshot a un
suscriptor tardío. Un fallo de build, serialización o publicación v2 cuenta y
descarta únicamente v2: no degrada v1 ni provoca fail-stop.

Wails y OBS reciben v2 en shadow con el mismo decoder estricto. El render sigue
usando v1 porque `overlayV2Features` está vacío por defecto. El único feature
implementado, `player-instruments`, puede activarse explícitamente en el
harness diagnóstico. El comparador empareja v1 y v2 por `epoch/sequence`, compara el
valor mostrado de `pedals-telemetry` con tolerancias explícitas y retiene como
máximo ocho secuencias pendientes. No adapta v2 a `TelemetrySnapshot`.

## Forma y tamaños medidos

Secciones del frame: cabecera (`contract`, `algorithm`, `epoch`, `sequence`,
`sessionId`, `generatedAt`), `units`, `session`, `player`, arrays `standings` y
`relative`, `delta`, `fuel`, `spotter` y `capabilities`.

Bytes wire minificados de los goldens reales del slice Go:

| Vehículos de entrada | Bytes v2 | Observación |
| ---: | ---: | --- |
| 1 | 1.311 | Solo player/session/capabilities poblados |
| 20 | 1.312 | Arrays deliberadamente vacíos en F6 |
| 44 | 1.312 | Arrays deliberadamente vacíos en F6 |
| 104 | 1.313 | Arrays deliberadamente vacíos en F6 |

El sintético Go completo de 104 vehículos mide **34.650 bytes**: cumple el
límite duro de 64 KiB y el objetivo de 48 KiB. El fixture TypeScript completo,
con standings y relative de 104 filas, mide 34.161 bytes; la diferencia procede
de que son dos generadores sintéticos distintos, no de una medición del runtime.

## Rendimiento medido

`TestOverlayFrameV2ParsesUnderOneMillisecondP99` calienta 100 operaciones y
ejecuta tres trials de cuatro lotes de 500 operaciones, reportando tiempo por
operación y usando el mejor trial estable como hacen los benchmarks Go. El
lote evita que la cuantización del reloj CPU de Windows invalide el percentil.
En una ejecución focal local, JSON.parse más decoder estricto dio **CPU p99/op
0,720 ms** y **wall p99/op 0,889 ms** para 34.161 bytes. Es una medición
sintética de Node; no acredita WebView2 ni OBS. En la suite paralela, el tiempo
de pared puede incluir espera del scheduler y solo el CPU p99 es el gate.

`BenchmarkProjectV2`, `-benchtime=200x -count=5`, dio estas ventanas locales:

| Vehículos | ns/op | B/op | allocs/op |
| ---: | ---: | ---: | ---: |
| 1 | 1.704–3.217 | 2.991–2.992 | 12 |
| 20 | 6.776–11.833 | 17.736–17.739 | 16 |
| 44 | 10.506–16.884 | 36.639 | 16 |
| 104 | 20.868–26.227 | 85.259–85.286 | 17 |

Son benchmarks de proyección sintética, no tiempos end-to-end de LMU, Wails o
SSE.

## Paridad y tests

- Goldens Go 1/20/44/104 y test de tamaño completo 104.
- Builder player/session/capabilities y paridad de señales v1/v2.
- Contrato TS generado y `contract-gen -check`.
- Publisher Wails/SSE: latest-wins, replay y descarte contado.
- Store inmutable: revisión creciente, watchdog, Wails/SSE y decoder único.
- Paridad byte a byte de valores mostrados v1/v2 sobre los cuatro goldens.
- Guard domain-free del ViewModel v2 y flag de feature default-off.
- Emparejamiento shadow por epoch/secuencia y métricas
  `overlay_shadow_mismatches_total{field}`.
- Playwright captura el mismo widget v1/v2 en wide, medium y compact: bytes de
  imagen idénticos.

## Gates locales

- Build Go de todos los paquetes productivos, excluyendo `build/ios` y el
  paquete test-only `internal/telemetry`: PASS.
- `go vet ./tools/... ./internal/telemetry/... ./internal/app/...`: exit 1
  únicamente por los tres `unsafe.Pointer` heredados en `reader_windows.go`,
  `version_windows.go` e `icon_windows.go`.
- Tests Go de tools, Telemetry y app: PASS, excluyendo solo
  `internal/app/launcher` por el panic preexistente de
  `TestDiscoverIconsSmoke`.
- `go run ./tools/telemetry-contract-gen -check`: PASS; wiring guard permanece
  verde dentro de la suite Go.
- `pnpm --dir frontend test`: 396 archivos y 2.889 tests PASS. Una ejecución
  bajo carga agotó el timeout heredado de Strategy Planner; el archivo focal
  pasó 31/31 y la repetición completa final pasó. Los `AbortError` heredados
  de teardown conservaron exit 0.
- `pnpm --dir frontend build`: PASS; solo warning heredado de chunk mayor de
  500 kB. ESLint focal: PASS; solo aviso heredado de `.eslintignore`.
- `pnpm --dir frontend test:telemetry-overlay-shadow`: PASS.
- JSON del changelog, `git diff --check` y ausencia de `.agent/` en el diff:
  PASS.

## Procedimiento manual pendiente para Isaac

### Wails / WebView2

1. Desde este worktree, construir frontend y arrancar Vantare con el perfil de
   prueba habitual: `pnpm --dir frontend build` y
   `go run ./cmd/vantare -profile configs/example-racing.json`.
2. Usar la configuración normal: `OverlayFrameV2Shadow=nil` significa activo.
   No activar `overlayV2Features` para esta prueba; el usuario debe seguir
   viendo v1.
3. Abrir una ventana Overlay, entrar en una sesión LMU y abrir DevTools de esa
   WebView2.
4. Ejecutar periódicamente
   `window.__vantareOverlayV2Diagnostics()` en la consola. Capturar al inicio y
   al final `overlay_v2_parse_duration.{count,p50,p99}` y
   `shadow.{frames,mismatches,metrics}`.
5. Confirmar que `count` y `frames` crecen, `p99 < 1 ms` y `mismatches = 0`.
   Guardar captura sanitizada: solo contadores/tiempos, nunca payload raw ni
   identidad.

Resultado WebView2 instalado: **pendiente de Isaac**.

### OBS browser source / SSE v2

1. Arrancar la app con su bind loopback por defecto y abrir la Browser Source
   normal de OBS. La suscripción shadow usa
   `http://127.0.0.1:39261/telemetry/overlay-v2/projection`.
2. En DevTools de la Browser Source, confirmar una conexión EventSource 200
   `text/event-stream` a esa URL; como comprobación aislada puede usarse
   `curl.exe -N -H "Accept: text/event-stream"` contra la misma URL.
3. Capturar nombres de evento `telemetry:overlay-v2:status` y
   `telemetry:overlay-v2:snapshot`, revisiones crecientes y recepción del
   snapshot retenido al recargar. No guardar el cuerpo del frame.
4. Leer `window.__vantareOverlayV2Diagnostics()` y guardar los mismos
   contadores sanitizados. Confirmar que v1 continúa siendo lo renderizado y
   que desconectar el consumidor v2 no detiene v1.

Resultado OBS instalado: **pendiente de Isaac**.

## Gate de estabilidad antes de cutover

Registrar al menos cinco sesiones reales de 20 minutos o más, incluida una con
más de 40 coches. Para aprobar, todas deben terminar con `mismatches = 0` y sin
fail-stop, caída de v1 o exposición de payload en diagnósticos. Este gate está
**pendiente de Isaac**; los tests y fixtures locales no lo sustituyen.

## Límites de la evidencia

No se ejecutaron LMU, WebView2 instalado, OBS real ni CI remoto. No hubo push,
PR, merge, promoción ni release. Standings, relative, delta, fuel y spotter se
poblarán en fases posteriores; F6 solo fija su contrato compacto.
