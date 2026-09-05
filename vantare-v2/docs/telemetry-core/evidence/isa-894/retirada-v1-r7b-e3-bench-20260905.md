# ISA-894 R7b/E3 — testdata overlay y bench frontend legacy fuera, prototipo preservado

Fecha: 2026-09-05. Rama local
`vantareapp/isa-894-retirada-v1-r7b`. Base E3 `b68a21dd`
(E2 simplificado tras review).

## Alcance (solo E3, sin mover ni reubicar)

Solo E3 según el orden efectivo. Sin E4/E1d, roadmap público, Go
productivo, dependencias ni evidencia histórica. Sin apps, LMU, browser,
benchmark, secretos, push, PR, merge, promoción ni release.

- Borrados del árbol (5 ficheros):
  - `internal/telemetry/projection/overlay/testdata/lmu-1.4-delta-overlay-v1.golden.json`
    (276 líneas).
  - `internal/telemetry/projection/overlay/testdata/overlay_v1_pre_d7.golden.json`
    (1 línea).
  - `internal/telemetry/projection/overlay/testdata/overlay_v1.golden.json`
    (1 línea).
  - `docs/research/telemetry-architecture-2026/bench/frontend-bench-entry.ts`
    (105 líneas; importaba `overlay-projection-v1` + adapter, ya
    borrados en B2).
  - `docs/research/telemetry-architecture-2026/bench/frontend-bench.mjs`
    (1098 líneas; entrypoint parejo del anterior).
- `internal/telemetry/projection/contracts_test.go`: eliminada solo la
  entrada `overlay/testdata/overlay_v1.golden.json` de
  `TestGoldenContractsDoNotLeakCanonicalInternals`; conservadas
  `strategy` y `analysis` (1 línea).
- Guard B1: el bloque E3 pasa de presencia a ausencia (2 entrypoints +
  3 JSON por `absentAll`); `compact_frame.go` y sus checks (tag
  `researchbench`, ausencia de cableado V1), los checks de
  `vite/html` research y la custodia S1 quedan intactos.
- Preservados: `compact_frame.go` (prototipo con tag `researchbench`,
  sin import V1), Go bench del mismo dir (`fixtures.go`,
  `latency_gc_test.go`, `payload_sizes_test.go`,
  `pipeline_bench_test.go`, `transport_bench_test.go`,
  `transport_limit_test.go`), research histórica bajo `docs/` y
  paquetes S1/B3/E4 (dueños ajenos, no tocados).

## Inventario previo (STOP no activado)

`rg` exacto antes del GREEN: ningún importador ejecutable real de los
5 artefactos fuera de `contracts_test.go` (dueño E3) y de las propias
anclas del guard (literales negativos B2 + bloque E3). Las menciones en
`docs/research/*` son evidencia histórica, no código ejecutable, y se
conservan. `frontend-bench.mjs` solo cita a `frontend-bench-entry.ts`
en comentarios; ambos caen juntos. STOP no activado.

## TDD RED → GREEN

- RED `572911f4`: bloque E3 del guard en modo ausencia; guard
  `1 failed | 17 passed (18)`, fallo exacto con los 5 artefactos
  citados por ruta y dueño E3.
- GREEN `745a1048`: 6 ficheros, 1482 deletions, 0 inserciones
  (5 borrados + 1 línea de `contracts_test.go`).

## Checks (sobre `745a1048`)

- `go test ./internal/telemetry/projection/ -run TestGoldenContractsDoNotLeakCanonicalInternals -count=1`:
  PASS (`ok`).
- `go test ./internal/app/ -run TestOverlayV1ContractsRetired -count=1`:
  PASS (`ok`).
- `pnpm --dir frontend exec vitest run src/overlay/v1-retirement-b1.guard.test.ts`:
  18 passed (18).
- `rg` de ausencia (Go/TS/MJS/JS/JSON): limpio salvo las propias
  anclas del guard (negativos B2 + ausencias E3).
- `git diff --check`: limpio.
- `gofmt -l` sobre `contracts_test.go`: limpio.
- Suite completa no ejecutada; queda para E1d/F1.

## Revisión adversarial

Review read-only Muse `ses_f8fc90211ffeBn9PPLG9rIKxi4`: APPROVE,
P0/P1/P2 = 0/0/0. Repitió los checks focales y confirmó cero caller
ejecutable, cero test debilitado y cero código movido o duplicado. Registró
un P3 no bloqueante: `compact_frame.go` conserva una frase histórica en
presente sobre el proyector V1; no se cambia porque no existe wiring V1 y
el corte E3 es de borrado puro.

## Siguiente

E4 (comparator/sanitizer + builders oráculo) según el orden efectivo.
Sin push, PR, merge, promoción, apps ni LMU.
