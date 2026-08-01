# STR-01 — Rescate selectivo y caracterización de Product A

**Fecha:** 2026-08-01
**Issue:** ISA-136 / STR-01
**Base apilada:** `c960815`, descendiente de `ISA-117@170eaeb`
**Origen autorizado:** `codex/strategy-product-a@b9f193720b80484150691512a3fb1e09da9db41f`

## Resultado

Product A queda disponible únicamente como oráculo histórico compilable en
`internal/strategy/producta`. No está conectado al producto, no es un contrato
público del nuevo Strategy Planner y ningún archivo productivo puede importarlo.

El rescate conserva los 25 paths permitidos por la matriz:

- el fixture JSON se conserva byte a byte;
- los 24 archivos Go conservan el blob original después de normalizar
  exclusivamente `package producta` a su `package strategy` de origen;
- no se rescata ninguna de las 69 rutas de la denylist;
- el solver histórico se conserva solo para comparar resultados y no como
  autoridad matemática.

## Evidencia TDD

Antes de portar Product A se añadió el guard de procedencia. Su primera
ejecución falló porque faltaban los 25 archivos esperados. Después se portaron
únicamente los paths autorizados y el mismo guard pasó.

Comando rojo:

```text
go test ./internal/strategy/producta \
  -run 'TestRescuedProductAFilesMatchApprovedSource|TestRescueManifestIsExhaustive' \
  -count=1
```

Resultado inicial: `FAIL`, con cada archivo autorizado ausente. No se añadió
código para evitar la prueba; se completó la allowlist exacta.

Las correcciones de review también se hicieron en rojo: los tests de discovery
de raíz y de denylist se añadieron antes que sus helpers y fallaron al compilar
por `findModuleRoot*` y `validateDenyCopyDelta` ausentes. Después pasaron en
ejecución normal y con `-trimpath`.

## Registro origen → destino

Todos los paths de origen están bajo `internal/strategy/` en `b9f1937`; todos
los destinos están bajo `internal/strategy/producta/`.

| Origen / destino relativo | Blob de origen | Modo | Justificación |
| --- | --- | --- | --- |
| `canonical_fixture_test.go` | `bd98afd9` | port | Oráculo de cinco carreras y 10.000 seeds |
| `compare.go` | `200e3be1` | port | Caracteriza el ranking histórico |
| `compare_test.go` | `c974b975` | port | Fija tiempo, paradas, margen y riesgo |
| `model.go` | `4d7fbc76` | port | Shape histórico; se reescribe en STR-02 |
| `model_test.go` | `d3a0dc8a` | port | Round-trip y enums históricos |
| `pit.go` | `49aa5b86` | port | Descomposición histórica de pit |
| `pit_test.go` | `cfad7bae` | port | Simultáneo/secuencial y preset neutro |
| `race.go` | `6f28954c` | port | Proyección histórica por vueltas/tiempo |
| `race_test.go` | `2e739822` | port | Casos y convergencia histórica |
| `resource.go` | `85f3da17` | port | Presupuesto y fuel-save históricos |
| `resource_test.go` | `f2e87fd5` | port | Reservas, formación y valores inválidos |
| `sensitivity.go` | `332700a3` | port | Tres bandas deterministas históricas |
| `sensitivity_test.go` | `59c3a476` | port | Estabilidad de mínimo/base/máximo |
| `solver.go` | `fa09cf2e` | port histórico | Solo comparación; nunca autoridad |
| `solver_bench_test.go` | `23a80edd` | port | Baseline de coste del generador |
| `solver_test.go` | `af66cf23` | port | Formas, locks y errores históricos |
| `stint.go` | `14487129` | port | Shape y validación histórica de stints |
| `stint_test.go` | `e36c1f0d` | port | Servicios, ventanas y errores históricos |
| `testdata/canonical-cases.json` | `1cf926e9` | exacto | Fixture histórico no autoritativo |
| `tyre.go` | `e717e6c5` | port | Inventario/desgaste histórico |
| `tyre_test.go` | `817fde14` | port | Esquinas, mezclas, curva y riesgo |
| `units.go` | `bf66da12` | port | Conversiones/formato históricos |
| `units_test.go` | `ba7435d7` | port | Precisión y no finitos |
| `validate.go` | `1a0b11c6` | port | Diagnósticos estructurales históricos |
| `validate_test.go` | `95c8d058` | port | Errores/warnings históricos |

`rescue_guard_test.go`, `deny_copy_guard_test.go`,
`str01_scope_integration_test.go` y `doc.go` son guards nuevos de STR-01, no
archivos rescatados. Los guards:

- calculan la identidad Git de cada blob tras normalizar solo el namespace;
- exigen que el manifiesto de 25 rescates sea exhaustivo;
- descubren la raíz desde el working directory ascendiendo de forma acotada
  hasta `go.mod`, después de resolver symlinks, sin depender de rutas compiladas
  ni de `runtime.Caller`;
- recorren el código Go productivo para impedir imports del paquete histórico;
- contrastan las 69 rutas `DENY-COPY` con la matriz canónica;
- validan `str-01-delivery-paths.txt`, el manifiesto versionado de los 34 paths
  del corte, y rechazan rutas fuera de `producta` o los cinco documentos
  operativos explícitos;
- con el tag explícito `str01scope`, derivan mecánicamente el delta real contra
  `c960815`, uniendo archivos tracked modificados/añadidos y archivos untracked,
  y exigen igualdad 1:1 con el manifiesto;
- calculan el blob actual de cada artefacto y rechazan fuera del namespace
  histórico cualquier copia byte a byte de las 69 rutas `DENY-COPY`.

La prueba pura de la denylist inyecta como regresión
`internal/app/strategy_service.go`, `HubApp.tsx`, un locale y `index.css`. No
ejecuta Git desde la suite normal. Una segunda regresión fija los 174 bytes y
el blob Git exacto de `strategy-store-context.ts`: una copia fuera de
`producta` falla y cualquier byte eliminado o cambiado deja de pasar la
comprobación de identidad. El test etiquetado crea además un repositorio
temporal, modifica un path tracked y añade un path untracked fuera del
manifiesto para demostrar que el delta mecánico lo descubre y lo rechaza.

## Resultados históricos reproducidos

La caracterización conserva, sin declarar corrección física futura:

- cinco casos canónicos: sprint, Super 60, seis horas, veinticuatro horas y
  límite de Virtual Energy;
- ranking de candidatos y top histórico `minimum-stops`;
- 10.000 seeds deterministas con suma de vueltas e invariantes finitos;
- carrera por vueltas y por tiempo, extra lap, formación y loop acotado de
  paradas;
- Fuel y VE como entradas separadas en el modelo, aunque el solver histórico
  todavía sume sus márgenes de forma incorrecta;
- pit simultáneo/secuencial, reparación y penalización;
- inventario físico, compuestos mezclados y bloqueo histórico por esquina;
- curvas de desgaste, riesgo y blowout;
- stints, validación, unidades, comparación y sensibilidad.

## Límites preservados deliberadamente

Estos resultados son evidencia para los cortes posteriores, no comportamiento
aceptado:

1. el tiempo total del solver no integra la degradación del neumático;
2. `Margin` suma Fuel y Virtual Energy como magnitudes compatibles;
3. varias etiquetas pueden producir el mismo tiempo sin probar optimalidad;
4. la semántica LMU de carreras por tiempo y vuelta final no está demostrada;
5. los presets y el solapamiento de servicios no tienen autoridad LMU;
6. el modelo histórico solapa inventario y desgaste;
7. `Objective` sigue vacío.

STR-02 crea los contratos nuevos; STR-05/06/08 endurecen física e inventario;
STR-12 reemplaza el solver mediante oráculos independientes. Ningún corte debe
refactorizar este paquete para convertirlo en producto: se compara contra él y
se retira en STR-22 tras demostrar consumidores cero.

## Alcance negativo verificado

No se han tocado ni importado desde Product A:

- `internal/app`, Settings, bridges o persistencia;
- HubApp, topbar, navegación, locales, CSS global o access policy;
- Calendar, harness, frontend Strategy o configuración Vite;
- readers Shared Memory/REST/DuckDB;
- dependencias o wiring productivo.

## Checks ejecutados

| Check | Resultado |
| --- | --- |
| `go test ./internal/strategy/producta -count=50` | PASS |
| `go test ./internal/strategy/... -count=1` | PASS |
| `go test -trimpath ./internal/strategy/producta -count=1` | PASS; discovery de raíz independiente de rutas compiladas |
| `go test -tags=str01scope ./internal/strategy/producta -run 'TestSTR01ActualDelta' -count=1` | PASS; delta Git real y regresión tracked+untracked |
| `go vet ./internal/strategy/...` | PASS |
| `go test ./internal/strategy/producta -coverprofile=...` | PASS; 81,5 % de statements históricos |
| `go test ./... -count=1` | PASS en una ejecución completa; una repetición expuso el P3 Windows heredado descrito abajo |
| `pnpm --dir frontend build` | PASS; solo generó el `dist` ignorado necesario para el embed Go |
| `go test ... -bench BenchmarkSolverCandidates -benchmem -count=5` | PASS |
| `git diff --check` | PASS |
| Delta real `c960815` frente a `str-01-delivery-paths.txt` | PASS; 34/34, sin ruta extra ni omitida |

El primer intento global quedó bloqueado por la ausencia ambiental de
`frontend/dist`. Se enlazó temporalmente un `node_modules` ya instalado desde
el worktree ISA-117, se ejecutó el build sin instalar ni cambiar dependencias y
el segundo `go test ./...` pasó completo.

Una repetición posterior del global falló únicamente en el test ajeno
`internal/app.TestConcurrentSavesDontCorruptFile`: Windows denegó un rename del
sidecar `.tmp`. El focal repetido reproduce el mismo fallo sin cargar Strategy
y el diff de STR-01 no toca `internal/app`; se conserva como P3 heredado y no se
amplía este corte para modificar Settings.

El benchmark histórico en Ryzen 7 3700X caracteriza, sin imponer un gate de
rendimiento futuro: sprint 4,9–6,5 µs/op y 3.882 B/op; seis horas
36,4–80,4 µs/op y 20.607 B/op; veinticuatro horas 107,6–111,3 µs/op y
72.324–72.325 B/op.

No se ejecutan tests frontend ni Playwright: STR-01 no rescata ni modifica
frontend, harness o comportamiento visual. El smoke histórico bloqueado queda
propiedad explícita de STR-07.

## Siguiente corte

Tras review independiente de ISA-136, STR-02 / ISA-137 puede definir el dominio
versionado nuevo. Debe usar este paquete únicamente como evidencia de regresión,
no como dependencia productiva.
