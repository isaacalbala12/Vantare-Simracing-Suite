# Registro vivo de orquestación

Estado: vigente. Última actualización: 2026-07-30.

Este archivo permite continuar la ejecución en otro chat sin depender del
historial de Codex. Registra únicamente entregas comprobables; no implica
promoción a `nightly`, `testers` o `master`.

## Flujo vigente

```text
rama de issue
  -> aprobación inicial de Isaac
nightly
  -> feedback y correcciones
testers
  -> validación amplia y correcciones
master, solo con aprobación final de Isaac
```

`nightly` y `testers` aún no existen físicamente. Hasta ISA-121, los cortes
permanecen apilados en ramas publicadas con PR draft.

## Cortes cerrados

| Proyecto | Corte | Rama / SHA | PR | Review | Estado |
|---|---|---|---|---|---|
| Telemetry Analysis | TA-01 / ISA-122 | `vantareapp/isa-122-ta-01-investigacion-competitiva-fuentes-lmu-y-producto` / `0d7686b` | #27 | `ACCEPT`, sin P0–P3 | cerrada técnicamente |
| Telemetry Analysis | TA-02 / ISA-124 | `vantareapp/isa-124-ta-02-corpus-sanitizado-y-contrato-de-importacion` / `f59fd3d` | #30 | `ACCEPT`, sin P0–P3 | cerrada técnicamente |
| Telemetry Analysis | TA-03 / ISA-126 | `vantareapp/isa-126-ta-03-caracterizacion-duckdb-lmu-y-modelo-historico-canonico` / `15354dc` | #33 | re-review `ACCEPT`, sin P0–P3 | cerrada técnicamente |
| Engineer | ENG-01 / ISA-123 | `vantareapp/isa-123-eng-01-auditoria-clean-room-y-especificacion-funcional` / `7a1cd70` | #28 | `ACCEPT`, sin P0–P3 | cerrada técnicamente |
| Engineer | ENG-02 / ISA-125 | `vantareapp/isa-125-eng-02-contratos-engineerprojection-capabilities-y-envelope` / `df0c202` | #31 | `ACCEPT`, sin P0–P3 | cerrada técnicamente |
| Engineer | ENG-03 / ISA-127 | `vantareapp/isa-127-eng-03-adaptacion-del-payload-engineer-sobre-tc-05a` / `06dbfd8` | #34 | re-review `ACCEPT`, sin P0–P3 | cerrada técnicamente |
| Telemetry Core | TC-04D / ISA-38 | `vantareapp/isa-38-tc-04d-migracion-gradual-de-derivaciones-live` / `0883651` | #29 | `ACCEPT`, sin P0–P3 | cerrada técnicamente |
| Telemetry Core | TC-05A / ISA-39 | `vantareapp/isa-39-tc-05a-proyecciones-versionadas-por-producto` / `efcc77c` | #32 | `ACCEPT`, sin P0–P3 | cerrada técnicamente |

### Evidencia TA-03

- Un DuckDB LMU completado se inspeccionó mediante copia temporal read-only;
  original y copia conservaron SHA-256 coincidente y el original no cambió.
- Catálogo sanitizado: 101 tablas, 56 canales continuos, 42 eventos y 12 claves
  de metadata; no se versionaron muestras, valores, rutas, nombres ni IDs.
- Modelo histórico v1 y parser paginado neutral, sin driver DuckDB de producto.
- Correcciones revisadas: catálogo inmutable, resolución por ID, máximo de
  16.384 filas, EOF/predecesor, monotonicidad entre páginas, metadata privada
  por defecto, `DECIMAL` desconocido y duplicados case-insensitive.
- Checks: focal x20, vet, race x10, fuzz de normalización/redacción, suite Go
  global serial, frontend build y `git diff --check` pasaron. El cierre fresco
  repitió focal, vet y diff-check.
- Riesgo pendiente: TA-04 debe demostrar semántica real de progreso, distancia
  y geometría antes de mapa o delta. La presencia de canales no es prueba.

## Cortes activos

| Proyecto | Corte | Worktree / base | Estado exacto |
|---|---|---|---|
| Telemetry Core | TC-05B / ISA-40 | `C:\tmp\vantare-isa40\vantare-v2` sobre `efcc77c` | review `REJECT`: 2 P1 y 3 P2; corrección focal activa |

## Próximas acciones exactas

1. Resolver todos los findings razonables de TC-05B, entregar commit/push/PR
   draft apilada sobre TC-05A y actualizar Linear.
2. Abrir ENG-04 sobre ENG-03 para caracterizar mediante replays una familia de
   monitores antes de migrarla; no inventar señales ni borrar el frame legacy.
3. Abrir TA-04 sobre TA-03. Primero debe producir evidencia reproducible de
   `Lap Dist`, `Total Dist` y/o GPS; si no existe, debe degradar honestamente y
   no implementar mapa/delta sintéticos.
4. Continuar secuencialmente TC-05C, ENG-04 y TA-05 según sus microplanes y
   dependencias.
5. Actualizar este registro inmediatamente después de cada review/cierre.

## Contratos preparados para los siguientes workers

### TA-04 — progreso, distancia y mapa

- Base obligatoria: TA-03 `15354dc`.
- Primero caracterizar un DuckDB LMU completado mediante copia temporal
  read-only; nunca abrir el archivo con WAL.
- Demostrar o rechazar explícitamente continuidad, resets, origen y relación
  entre `Lap Dist`, `Total Dist`, GPS y los eventos de vuelta.
- Solo después crear contrato/golden sanitizado para progreso monotónico,
  discontinuidad, longitud incompatible y cursor.
- Sin fallback temporal, mapa sintético, delta, UI, reader productivo ni
  dependencia DuckDB.

### ENG-04 — runner y oráculo de replays

- Base obligatoria: ENG-03 `06dbfd8`.
- Runner determinista, reloj virtual y snapshots versionados propios.
- Fixtures mínimas: identidad/epoch, missing/stale/unsupported, cero legítimo,
  cambio de sesión/coche/piloto y capacidades parciales.
- El oráculo comprueba resultados observables; no reproduce la implementación.
- Sin scheduler/policy, Spotter, audio, STT, Pit, UI o lectura LMU directa.

### TC-05C — contratos TypeScript y observabilidad

- Base obligatoria: TC-05B una vez aceptada.
- Espejo TypeScript versionado de los cuatro productos y del transporte.
- Harness que demuestre full/resync, secuencia, status y facts separados,
  reconexión, gaps y diagnóstico sin payload sensible.
- Sin composición productiva, UI final ni imports de dominios internos.

## Bloqueos operativos actuales

- La integración de Linear no está expuesta en esta sesión de Codex. Los
  commits y PR pueden cerrarse, pero los comentarios/estados de Linear deben
  sincronizarse en cuanto vuelva el conector; no se falsificará ese estado.
- Ninguna promoción está autorizada. No crear ni usar destinos alternativos
  para sustituir `nightly` o `testers`.

## Última review recibida

ENG-03 fue rechazada por un único P1: el proyector declaraba
`GroupStandings` solo con posición o vueltas completadas, mientras el adaptador
también lo exigía cuando únicamente `LapNumber` era válido. El estado parcial
terminaba rechazado por conflicto de capability. Se ordenó un fix mínimo que
unifique la regla y añada una regresión del flujo completo. El resto de la
review quedó limpio: merge, versión, ownership, identidad, latest-wins,
calidad, manifest, golden y límites de alcance.

TC-05B fue rechazada por dos P1 y tres P2: faltaba aislar e identificar los
cuatro productos; un epoch antiguo podía reemplazar al vigente; el adapter de
hechos no detectaba gaps; el delta retenido conservaba un sello inválido; y
faltaban regresiones del perímetro. Se ordenó un fix acotado con `ProductID` y
hub ligado al producto, epoch monotónico, continuidad de hechos, reseal y tests
de routing simultáneo, límites, loopback IPv4/IPv6 y cierre concurrente. Los
checks focales, Telemetry Core, vet, race y fronteras de imports del primer
review sí pasaron.

El fix de ENG-03 alineó el proyector y el adaptador: `LapNumber` por sí solo
declara `GroupStandings`. La regresión recorre el flujo completo con vuelta 7 y
verifica grupo exacto, presencia, frescura y usabilidad. La re-review final fue
`ACCEPT` sin P0–P3. Commit `06dbfd8`, push y PR draft #34 correctos; sin
promoción. Linear queda pendiente de sincronización por ausencia del conector.
