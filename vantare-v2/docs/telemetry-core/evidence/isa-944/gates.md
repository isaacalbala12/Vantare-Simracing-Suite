# ISA-944 — gates y resultado

Fecha: 2026-08-30. Base rebasada: `origin/nightly@9723148f`.
Revisión comprobada antes de actualizar este acta: `6097f822`.

## Gates de código

| Gate | Resultado |
|---|---|
| `go build ./...` | PASS |
| `go build -tags production ./cmd/vantare` | PASS |
| `go test ./internal/app/... ./cmd/... -count=1` | PASS |
| `go test ./scripts/bench -count=1` | PASS |
| `go vet ./internal/app/performance/... ./internal/app ./cmd/vantare ./scripts/bench` | PASS; alcance acotado por #950 |
| `corepack pnpm --dir frontend exec vitest run --maxWorkers=2` | PASS: 427 archivos, 3258 tests, 200,58 s |
| `corepack pnpm --dir frontend typecheck` | PASS |
| `corepack pnpm --dir frontend lint` | PASS |
| `corepack pnpm --dir frontend i18n:audit` | PASS: paridad, 0 ausentes, 0 huérfanas conservadoras |
| `go run ./tools/telemetry-contract-gen -check` | PASS |
| `python ../.github/scripts/roadmap_digest.py --repo .. --ref origin/nightly --check` | PASS: `sin cambios` |
| `git diff --check` | PASS |
| `git merge-base --is-ancestor origin/nightly HEAD` | PASS (exit 0) |

El vet global heredado se sigue por separado en #950; el alcance que ISA-944
modifica y su ejecutable principal pasan vet. Vitest emitió un `AbortError` de
teardown de Happy DOM durante la corrida, pero completó los 3258 tests y salió
con código 0.

## Gates del sensor

- `TestPresentMonWindowsIntegration` opt-in: PASS con frametime 16,0558 ms,
  PresentMon PID 18988 y sesión propia; tras cerrar quedó solo
  `RSXTraceSession`.
- Corrida Wails real con LMU: PASS de captura, control y lifecycle. 183 muestras
  a 1 Hz, 182 con frametime, secuencia 3→4→5 y dos cambios en 181 s.
- CDP real: `performance-start.json` y `performance-end.json` contienen
  `capabilities.performance` y `host`; la final publica `reason: frametime`.
- Cierre: no quedaron Vantare, PresentMon propio ni `VantareSensor-*`; la
  sesión permanente de Radeon no se detuvo.
- Degradación: `game-20260830` capturó por CDP `reason: unavailable`, host sin
  `gameFrametimeMs` y control CPU-only 3→4→5. LMU estaba abierto, por lo que
  demuestra indisponibilidad de la fuente, no una corrida específica sin LMU.
- A/A final desde árbol limpio `1940dfa0`: `sensor-cost-20260830-054516`, 60 s
  OFF + 60 s ON a nivel 5, SHA-256 del ejecutable
  `f8515d11db51f522d75985ce3e963ac6927c2fb7f88ccb86ef3983fbc16ff231`.
  Delta ON−OFF: +0,1437 puntos de CPU media, +0,2516 puntos p95 y +4,66 MiB;
  107 muestras sin deriva, 106 con frametime. Al cerrar quedaron cero Vantare
  y cero sesiones `VantareSensor-*`.

## Pendiente externo

No se ejecutó una segunda captura con LMU cerrado porque el proceso PID 16792
permaneció abierto durante el turno. El contrato `unavailable` sí está cubierto
por test determinista y por la degradación Wails anterior; falta únicamente
separar la causa «juego cerrado» en evidencia física.
