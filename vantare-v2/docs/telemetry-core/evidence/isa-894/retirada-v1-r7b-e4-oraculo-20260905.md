# ISA-894 · R7b/E4 — retirada del oráculo shadow y builders legacy

Fecha: 2026-09-05. Rama única: `vantareapp/isa-894-retirada-v1-r7b`.
Base: `9ee03609`. Sin push, PR, merge, promoción, apps ni LMU.

## RED

Commit `5391ac7d` (solo B1): el test E4 exige ausencia del shadow completo,
16 tests legacy y 17 anclas `build*(`. Resultado: **1 failed | 17 passed (18)**,
fallo exacto del test E4. Resto del guard intacto.

## GREEN

Commit GREEN `92e5dd17` (60 ficheros, +439/−6112); el corte E4 completo,
incluido el RED `5391ac7d`, suma +493/−6119 (neto −5626). Inventario `rg` previo al
borrado: cero callers productivos de los 16 `build*` legacy (solo tests y
comparator); STOP no activado. Corrección al preflight: son **26 ficheros
borrados** (10 shadow + 16 tests legacy), no 28.

Borrados (26): `telemetry-shadow/` completo restante (comparator, sanitizer,
6 tests, 2 JSON S1) + 16 `*-view-model.test.ts` legacy (standings, relative,
delta, fuel-strategy, input-telemetry, pedals-telemetry, racing-flags,
delta-advanced, delta-trace, pedals, pedals-telemetry-compact,
multiclass-relative, head-to-head, track-map, broadcast-tower, track-weather).

Modificados (16 builders): solo tipos y helpers puros in situ, sin mover ni
duplicar: `StandingsViewModel/Row`, `withStandingsMotionIdentity`,
`resolveStandingsCellValue`, `resolveRelativeCellValue`,
`formatPedalsTelemetry*`, `DeltaTone`, tipos track-map/markers y demás
`*ViewModel`. Borrados los 16 `build*` + preview + imports snapshot/scoring.

Tests migrados (15): 8 renderers/contract a ViewModels literales (Crystal,
Original ×2, Endurance ×3, contract, pit/gaps/stress intactos); 7 V2 a
aserciones nativas (racing-flags-domain-free sin test oráculo, 6
`*_v2.test` sin bloque "equivalencia con v1"; compact cablea formatters
compartidos). Guards: B1 E4 en ausencia + B2-prep retirado (vigilaba el
oráculo), `overlay-v2-view-models.test` sin shadow, `v1-authority-guard`
sin las 17 entradas E4 (accumulator E1 intacto).

Preservados: race-schedule (canal Calendar productivo), car-damage post-C1,
`input-telemetry-accumulator`, `shared/scoring-readers` y la cadena
`relative-row-selection`/`relative-formatting`. E1d confirmará y retirará su
arrastre muerto si el runtime V2 no conserva un consumidor real. También se
preservan `track-geometry`, goldens `overlay_v2_*` y evidencia histórica.

## Checks (focales, sin suite completa)

- widget-types + core: 497/497 (76 ficheros). design-systems: 297/297 (58).
  authoring/transports/harness: 144/144 (14). Migrados: 71 + 34 PASS.
- `typecheck` (`tsc -b --noEmit`) PASS. `lint` PASS. `build` PASS (aviso
  chunk-size preexistente). `rg` ausencia shadow/builds limpio salvo anclas
  históricas de guards. `git diff --check` limpio.
- No ejecutados: suite completa y Go (dueños E1d/F1), apps/LMU/browser/bench.
- Riesgos: E1d debe retirar snapshot/coordinator/accumulator; F verifica
  ausencia total y bundle. Sin wrappers ni compatibilidad añadidos.

## Review adversarial

Muse + Ponytail `full` (`ses_f8fac15bcffe4LyafYHDCmts0C`): **APPROVE**,
P0/P1/P2 = 0/0/0. Se cerraron sus P3 documentales, el mutant del guard ahora
apunta a un fichero E1 vivo y `track-weather-view-model.ts` recuperó formato
legible sin cambio de comportamiento. No se añadió helper para los literales
de Standings: duplicarlos en tests es menor que crear una abstracción nueva.

La suite completa accidental de E4 no es verde: 3234 tests PASS y 5 fallos
heredados en `telemetry-transport/attach.test.ts`, `store.freshness.test.ts`,
dos casos de `store.watchdog.test.ts` y
`hub/overlay-studio/overlay-studio-i18n.test.ts`. Ninguno toca el diff E4;
quedan como bloqueadores explícitos de E1d/F.
