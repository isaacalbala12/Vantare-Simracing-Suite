# ISA-152 / STR-17 — evidencia del motor Strategy live

**Fecha:** 2026-08-13  
**Base:** `origin/nightly@b2e4067809d31152fdcf374875179e577d483c03`  
**Rama:** `vantareapp/isa-152-str-17-motor-de-ejecucion-live-sobre-telemetry-core`  
**HEAD productivo y test LMU:** `bf9e9e5bafef5ee5b0c514bf21853ce6aae80a45`

## Qué demuestra

- `internal/strategy/live` mantiene un read model efímero, owned y thread-safe
  desde `StrategyLiveProjection v1`.
- Missing, stale, invalid y unsupported no se convierten en cero ni estimación.
- Los snapshots son latest-wins; duplicados, conflictos, cursores antiguos,
  gaps, epochs y reconnect coalescido tienen comportamiento explícito.
- `internal/app/strategy_live_runtime.go` consume una única suscripción del Hub
  Strategy existente. No abre LMU, REST, storage ni otro transporte.
- El payload Strategy v1 conserva compatibilidad old/new: ausencias pre-TC10B
  se normalizan a missing y extensiones aditivas seguras se ignoran.

## Evidencia LMU real sanitizada

Comando opt-in:

```powershell
$env:LMU_LIVE_SHARED_MEMORY_TEST='1'
go test -count=1 ./internal/app -run '^TestStrategyLiveLMUOptIn$' -v
```

Resultado observado con LMU 1.4 y jugador en pista:

```text
source-state="live"
epoch=1 sequence=3
completed-laps=0 state=fresh
fuel-amount=98 state=fresh
fuel-capacity=115 state=fresh
deviation-state=missing
```

La prueba usa el pipeline productivo completo:

```text
LMU driver -> BatchMapper -> Reducer -> Derive -> StrategyLiveProjection v1
           -> Strategy Hub -> StrategyLiveRuntime -> live.Engine
```

Solo `TelemetryCoreRuntime` abre LMU. El plan de prueba declara un stint, pero
ningún objetivo Fuel; por eso la desviación debe permanecer missing. El log no
incluye raw, track, fingerprint, IDs reales ni PII.

## Gates locales

- `go test -count=20 ./internal/strategy/live` — PASS.
- `go test -count=20 ./internal/app -run 'StrategyLive|StrategyExecution'` — PASS.
- `go test -count=1 ./...` — PASS.
- `go vet ./internal/strategy/live ./internal/app` — PASS.
- `pnpm --dir frontend build` — PASS; 884 módulos.
- `pnpm --dir frontend test` — PASS; 367 archivos / 2.636 tests.
- `git diff --check` — PASS.

La suite frontend conserva un 403 del roadmap remoto y un `AbortError` de
teardown happy-dom, ambos con exit 0. El detector `-race` no se ejecutó:
`CGO_ENABLED=0` y GCC no está disponible.

## Límites honestos

- No hay UI, replanning, VE, tyres, weather, facts ni persistencia live.
- No hay wiring al arranque. El `ActivePlan` durable guarda la referencia de
  revisión, pero no proporciona stints y objetivos normalizados; esa frontera
  necesita alcance explícito y no se sustituye con un plan sintético.
- La prueba LMU acredita una observación real puntual, no endurance ni una
  reconexión física. Replay, coalescing y soak se cubren determinísticamente.
- La rama se publicó por primera vez en `c532c88`. El PR draft
  [#219](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/219)
  está abierto hacia `nightly`; el estado del HEAD/checks se consulta allí.
  No hubo merge, promoción o release.
