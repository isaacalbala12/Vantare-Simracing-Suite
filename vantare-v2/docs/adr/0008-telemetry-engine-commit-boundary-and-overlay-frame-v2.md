# ADR 0008: Frontera única de commit, aislamiento de consumidores y `OverlayFrame v2`

> Enmienda operativa 2026-09-03: el
> [maestro de Telemetría V2](../superpowers/specs/2026-09-03-telemetria-v2-plan-maestro.md)
> sustituye el orden de retirada legacy y el rollback dentro del nuevo binario
> por vuelta a una build/commit anterior verificados. No modifica las garantías
> semánticas de commit, calidad, tiempo, hechos o aislamiento fijadas aquí.
> Las banderas de transición descritas abajo son historia de la migración,
> no una obligación de conservar V1 en el candidato final.

## Estado

Aceptado por Isaac el 2026-08-19 (junto con SPECIFY/PLAN/TASKS de ISA-372). Desbloquea la primera fase que cambia una frontera (F1 del plan ISA-372). Enmienda parcialmente ADR 0004; no modifica ADR 0005 (SQLite/MCAP y DuckDB post-sesión) ni el contrato de capabilities de Engineer (ADR 0005-engineer), cuya entrega pasa a ser asíncrona.

## Fecha

2026-08-19

## Contexto

ISA-371 (`docs/research/telemetry-architecture-2026/`) reconstruyó el runtime real, lo midió y lo sometió a revisión adversarial. Conclusiones verificadas en código:

- El núcleo semántico de ADR 0004 (`schema.Field[T]` con presencia/frescura/procedencia, reducer single-writer, derivaciones en Go, identidad canónica, replay determinista) funciona y su coste de CPU es proporcional (reducer 28,5 µs, coordinator 30,9 µs, derive 144 µs a 64 coches).
- La frontera operativa falla: cinco cursores independientes sin transacción (`reducer.go:137` commitea antes que `batch_mapper.go:146-149`; un fallo de stage posterior deja `ErrStaleBatch` en bucle y termina el runtime); la publicación ocurre dentro del commit y cualquier error de producto/payload llama a `failStop`, que es terminal; el Hub rechaza payloads > 256 KiB y Overlay v1 los supera desde 103 vehículos (Engineer desde 85), de modo que un grid soportado mata la telemetría; Engineer se consume síncronamente bajo un mutex compartido con la UI; la frescura se congela al publicar; `statusRevision` exige contigüidad sobre un canal que coalesce.
- Hay infraestructura completa, testeada y desconectada (`core.Fanout`, RFC 7396, seal SHA-256, `recording.Coordinator`, `NewStrategyLiveRuntime`, Analysis live) que los agentes confunden con el camino vivo.
- El último kilómetro TypeScript destruye la semántica construida en Go: adapter legacy a `TelemetrySnapshot` (~1,68 ms/frame @104), `scoring: Record<string, unknown>`, nombres rF2 y clases WEC cableadas; el contrato TS es un espejo manual.
- Medido: `OverlayFrame` compacto @104 = 35 KB frente a 269 KB de v1; `JSON.parse` 0,21 ms frente a 1,84 ms; RFC 7396 ahorra −0,55 %.

## Decisión

1. **Una sola frontera de commit.** `TelemetryEngine.Apply` ejecuta `prepare → validate → reduce → derive → facts → commit`; estado, cursor del mapper y facts se hacen visibles a la vez. Si cualquier paso falla, nada cambia, el frame se descarta y se cuenta. Reducer y coordinator dejan de commitear por su cuenta.
2. **Publicación y consumidores fuera del commit.** Overlay, Engineer, Strategy y Recording leen el resultado ya aceptado. Su fallo nunca es terminal: se clasifica (programación / producto-payload / consumidor), se cuenta, degrada el producto afectado y el Core continúa. `failStop` queda reservado a errores de programación. Cada frontera de consumidor tiene `recover()` y métrica.
3. **Identidad.** Ventana de gracia antes de declarar vacante un slot; evicción acotada de identidades; `StintID`; el cambio de player no implica epoch nuevo. `StreamEpoch`, `SessionID`, `VehicleID` y `StintID` son conceptos distintos.
4. **Contrato de salida.** `OverlayFrame v2` compacto, full, latest-wins, construido por builders Go por feature (ViewModels preparados: orden, selección, referencia de delta resuelta y declarada, capabilities y modos), con el status dentro del mismo sobre (`OverlayUpdate`). Un Publisher parametrizado que retiene el último full (`ReplaySnapshot`) y descarta y cuenta si excede límite. Cadencia regulada por sección antes de proyectar y serializar.
5. **Entrega de Engineer y Recording.** Engineer: último estado asíncrono (cap 1, drop-oldest) + facts ordenados con cursor y resync explícito, con timeout. Recording: cola acotada, gap markers, estado `Incomplete` explícito; se conecta solo con consumidor. Strategy conserva builder y contrato sin transporte público hasta que exista Planner consumidor.
6. **Contrato TypeScript generado** desde los tipos wire Go, con gate de CI que regenera y compara; prohibido editarlo a mano. El canonical no se genera (pospuesto con condiciones falsables).
7. **Retiradas.** `core.Fanout` (rescatando `FactResyncRequiredError`), RFC 7396 (Go y TS), seal SHA-256, `statusRevision` contiguo, Analysis live del transporte, y — solo tras paridad por widget y gate de estabilidad — `TelemetrySnapshot` legacy, adapter, `scoring-readers`, histories duplicadas y el comparador shadow.
8. **Guardarraíles.** Test de wiring (símbolo exportado solo en tests = fallo), `architecture_test.go` ampliado a las capas nuevas, `legacy-retirement.test.ts` por ruta, replay parity por digest como prueba primaria de paridad; shadow Go muestreado y shadow por feature como secundarias.

## Qué no decide

No cambia `schema.Field[T]`, los dominios tipados, el catálogo ni el versionado independiente canonical/projection/recording. No cambia ADR 0005 (Analysis post-sesión sobre DuckDB desde SQLite/ficheros nativos). No introduce registry dinámico, event sourcing, bus genérico ni protocolo binario.

## Consecuencias

- Positivas: cierra D-01…D-08 y el Engineer síncrono; 104 coches dejan de matar el runtime; payload −87 %; parse frontend −89 %; un simulador nuevo entra sin tocar widgets; una autoridad por concepto; menos código muerto; menos superficie que un agente pueda confundir.
- Negativas/riesgos: F3 es un cambio grande en el corazón del sistema (mitigado con fachada primero, flag, replay parity y shadow); la migración del frontend toca todos los widgets (mitigado con flag por feature, paridad por widget, gate de estabilidad); el código generado puede ser editado a mano por agentes (mitigado con gate de CI y prueba por ruta); las cifras de rendimiento deben confirmarse en WebView2 y OBS antes de prometerlas.
- Documentación: `docs/telemetry-core/README.md` y `runtime-fanout.md` contradicen el wiring real y se corrigen en F4/F13; `runtime-projections.md` se versiona como v2 en F13.

## Referencias

- `docs/superpowers/specs/2026-08-19-isa-372-telemetry-go-first-hybrid-spec.md`
- `docs/superpowers/plans/2026-08-19-isa-372-telemetry-go-first-hybrid-plan.md`
- `docs/research/telemetry-architecture-2026/{06,10,11,12,13}-*.md`
- ADR 0004, ADR 0005 (historical storage), ADR 0005 (engineer capability contract)
