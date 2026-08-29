# ISA-944 — gates y resultado

Fecha: 2026-08-30. Base rebasada: `origin/nightly@c4eb1168`.
Revisión comprobada antes de añadir este acta: `e1147c3b`.

## Gates de código

| Gate | Resultado |
|---|---|
| `go build ./...` | PASS |
| `go build -tags production ./cmd/vantare` | PASS |
| `go test ./internal/app/... ./cmd/... -count=1` | PASS |
| `go vet ./internal/app/... ./cmd/...` | FAIL heredado: `internal/app/launcher/icon_windows.go:553:8: possible misuse of unsafe.Pointer` |
| `corepack pnpm --dir frontend test` | PASS: 422 archivos, 3206 tests |
| `corepack pnpm --dir frontend typecheck` | PASS |
| `corepack pnpm --dir frontend lint` | PASS |
| `go run ./tools/telemetry-contract-gen -check` | PASS |
| `python ../.github/scripts/roadmap_digest.py --repo .. --ref origin/nightly --check` | PASS: `sin cambios` |
| `node --test scripts/bench/all.test.mjs` | PASS: 23 tests |
| `git diff --check` | PASS |
| `git merge-base --is-ancestor origin/nightly HEAD` | PASS (exit 0) |

El único fallo de vet está también en `origin/nightly`: `git diff --numstat
origin/nightly -- internal/app/launcher/icon_windows.go` no devuelve cambios.
ISA-944 no modifica ese archivo. La primera ejecución completa de Vitest tuvo
un timeout de 20 s en el escaneo de `legacy-retirement.test.ts` (3205/3206);
el test aislado pasó 3/3 y la repetición completa posterior pasó 3206/3206.

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

## Pendiente externo

No se ejecutó una segunda captura con LMU cerrado porque el proceso PID 16792
permaneció abierto durante el turno. El contrato `unavailable` sí está cubierto
por test determinista y por la degradación Wails anterior; falta únicamente
separar la causa «juego cerrado» en evidencia física.
