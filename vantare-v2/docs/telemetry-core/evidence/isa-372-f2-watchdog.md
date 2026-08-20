# ISA-372 / F2 — watchdog y stale honesto

Fecha: 2026-08-19.

Rama: `vantareapp/isa-372-tc-f2-watchdog-stale`.

Base: `tc-integration@98c3e2f26e331c34773e4f319f731fad2b9b031c`
(Nightly + F0 + F1 + F4).

## Resultado

- El runtime usa un reloj inyectable y conserva el instante monotónico del
  último frame aceptado. El watchdog publica `stale` al alcanzar el umbral
  configurable (1 s por defecto) y vuelve a `live` cuando llegan frames.
- `TelemetryWatchdogEnabled` está on por defecto (`nil` = on); `false`
  conserva durante un ciclo el comportamiento anterior. El store ofrece el
  rollback equivalente mediante `telemetryWatchdogEnabled?: boolean` y tolera
  su ausencia como on.
- Las métricas exponen `LastFrameAgeMs` y `WatchdogDegradations`, sin payload.
- Backend y store aceptan cualquier `statusRevision` mayor. Duplicados
  incoherentes y retrocesos siguen fallando cerrados.
- El store conserva el último full al avanzar status, expone `ageMs`, crea y
  limpia su timer con sus listeners y publica `snapshot-stale-watchdog` una
  sola vez por transición local.
- El observer no adapta un snapshot cuya revisión no coincide con el status.
  El adapter entrega el último snapshot como `stale` sin cambiar valores ni
  crear ceros o placeholders.

El contrato wire v1 y sus goldens permanecen intactos.

## Tests de F0 activados y tests nuevos

Activados sin relajar sus aserciones:

- `TestFrozenPipelineStopsReportingFresh`.
- `store.freshness.test.ts`: degrada a stale al superar el umbral.
- `store.test.ts`: acepta una revisión mayor no contigua.

Nuevos o ampliados:

- `TestWatchdogDegradesWithinOneSecond`.
- `TestWatchdogRecoversWhenFramesResume`.
- `TestStatusRevisionGapIsAccepted` y rechazo de retroceso.
- `freshness-watchdog.test.ts`: reloj inyectado y cleanup del interval.
- `store.watchdog.test.ts`: frame de 3 s, diagnóstico único y rollback off.
- adapter: stale end-to-end sin modificar valores.
- `TestReconnectRecoversWithoutRestart`: Vantare antes del sim, llegada del
  sim, reconnect y suscriptor tardío sobre la misma instancia.
- rollback backend con `TelemetryWatchdogEnabled=false`.

## Gates locales

- `pnpm --dir frontend install --frozen-lockfile`: PASS; materializó las
  dependencias ignoradas del worktree.
- `pnpm --dir frontend build`: PASS. El primer build Go detectó correctamente
  que faltaba `frontend/dist`; se creó con este comando antes de repetir.
- `go build` sobre todos los paquetes productivos, excluyendo solo `build/ios`
  y el paquete test-only `internal/telemetry`: PASS.
- `go vet ./internal/telemetry/... ./internal/app/...`: exit 1 únicamente por
  los tres `unsafe.Pointer` preexistentes en `reader_windows.go`,
  `version_windows.go` e `icon_windows.go`.
- `go test` sobre `./internal/telemetry/... ./internal/app/... -count=1`,
  excluyendo solo `internal/app/launcher` por el panic preexistente de
  `TestDiscoverIconsSmoke`: PASS final. Una ejecución intermedia reprodujo la
  flake fuera del diff `recording commit exceeded budget`; su focal pasó 3/3
  y dos gates completos posteriores pasaron.
- `pnpm --dir frontend test`: 390 archivos y 2.866 tests PASS. Los
  `AbortError` heredados de teardown de happy-dom conservan exit 0.
- ESLint focal de todos los TS/TSX modificados: PASS; solo aviso heredado por
  `.eslintignore` obsoleto.
- `pnpm --dir frontend test:telemetry-overlay-shadow`: PASS; harness de
  estados `stale`/`disconnected` y capturas locales en
  `frontend/test-results/telemetry-overlay-shadow`.
- `git diff --check`: PASS.

## Verificación manual pendiente

1. Abrir Vantare antes que LMU y confirmar `detecting` sin falso stale.
2. Entrar en pista, congelar o interrumpir la fuente y confirmar que status y
   widgets pasan a stale alrededor del presupuesto de 1 s sin perder valores.
3. Reanudar frames y confirmar recuperación a live sin reiniciar Vantare.
4. Abrir una ventana Overlay tarde y confirmar que recibe el stale retenido.
5. Revisar `LastFrameAgeMs`, `WatchdogDegradations` y el diagnóstico
   `snapshot-stale-watchdog` sin payload ni identificadores.

No se ejecutó una sesión LMU real, Wails/OBS instalado ni CI remoto. La prueba
con reloj inyectado demuestra la política; no sustituye evidencia de runtime
real. La cadencia del monitor backend es 100 ms, por lo que la observación en
reloj de pared debe verificarse manualmente alrededor del umbral configurado.

## Entrega

Commits previos de F2: `e19618a4` (F2.1), `3525d3f9` (F2.2), `1dc3bcc2`
(F2.3) y `fbce99ee` (F2.4). F2.5 incluye flag, reconnect y esta evidencia.

Trabajo local. Sin push, PR, CI remoto, merge, promoción ni release.
