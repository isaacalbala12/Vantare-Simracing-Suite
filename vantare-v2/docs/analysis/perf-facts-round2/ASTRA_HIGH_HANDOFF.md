# Handoff para revisión adversarial Astra High

Esta revisión **no se ha ejecutado**. El objetivo es revisar el código integrado, no aceptar el informe por autoridad.

## Referencias

- Base incremental: `ae11bef79471e04aaa8f11422e0c91d834b4277b`.
- Rama: `perf/facts-round2-20260915`.
- Informe: `docs/analysis/perf-facts-round2/FINAL_REPORT.md`.
- Ledger: `docs/analysis/perf-facts-round2/experiments.jsonl`.

## Encargo de revisión

1. Leer `git diff ae11bef79471e04aaa8f11422e0c91d834b4277b..HEAD`; comprobar cada módulo productivo, no solo tests o mensajes de commit.
2. Verificar independencia de documentos/layouts Studio y que la caché dirty invalida por `present` y `saved`.
3. En F03, intentar romper la clave por referencia mediante cambios de type/content/visual/layout, dos providers y recuperación desde configuración inválida.
4. En F04, comparar la igualdad anterior por JSON con los comparadores nuevos, incluidos `null/undefined`, orden de arrays, records, source/failure, session/epoch y lifecycle.
5. En F05/F06, confirmar que no se introdujo instrumentación productiva ni `Peek` global, y que `CarNumber` solo invalida cuando su valor proyectado fresh cambia.
6. En F07, comprobar ownership de snapshots/candidatos, cancelación, reset, límite reducido y que la especialización llena no pisa el backing array anterior.
7. Reejecutar A/B secuencialmente; no sumar porcentajes ni inferir Windows/LMU.

## Comandos focales

Desde `vantare-v2/frontend` de la rama candidata:

```text
pnpm exec vitest run src/hub/overlay-studio/state/studio-command.clones.test.ts src/hub/overlay-studio/state/studio-document-store.test.ts src/hub/overlay-studio/state/studio-derived-selectors.test.ts src/overlay/core/telemetry-rate-coordinator.test.ts src/overlay/runtime/runtime-widget-prepare.test.tsx src/overlay/runtime/RuntimeOverlaySurface.test.tsx src/overlay/runtime/RuntimeOverlaySurface.policy.test.tsx src/overlay/runtime/RuntimeOverlaySurface.performance.test.tsx src/telemetry-transport/overlay-frame-v2-performance.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Desde `vantare-v2`:

```text
go test -race ./internal/telemetry/derive ./internal/telemetry/projection/overlayv2 -count=1
go vet ./internal/telemetry/derive ./internal/telemetry/projection/overlayv2
go test ./internal/telemetry/derive -run '^$' -bench '^BenchmarkPipelinePrepareControlsHistory$' -benchmem -benchtime=500ms -count=5
```

Benchmarks frontend a ejecutar primero en el worktree base y después en el candidato:

```text
pnpm exec vitest bench src/hub/overlay-studio/state/studio-command.perf.bench.ts --run
pnpm exec vitest bench src/overlay/runtime/runtime-widget-prepare.perf.bench.tsx --run
pnpm exec vitest bench src/overlay/core/telemetry-rate-coordinator.perf.bench.ts --run
```

## Preguntas de veto

- ¿Algún cambio comparte un objeto que antes era propio?
- ¿Algún comparador declara iguales dos valores wire distintos?
- ¿Un test mide un helper mientras la ruta productiva realiza trabajo adicional?
- ¿Un benchmark incluye overhead diferente entre base y candidato?
- ¿Se ha desplazado trabajo a otra fase sin medirla?
- ¿Existe alguna afirmación de Windows, FPS o LMU no respaldada?
