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
| Telemetry Core | TC-05B / ISA-40 | `vantareapp/isa-40-tc-05b-wails-y-sse-con-full-snapshot-sequence-y-resync` / `ebb0bd7` | #35 | re-review final `ACCEPT`, sin P0–P3 | cerrada técnicamente |

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

### Evidencia read-only que desbloquea TA-04

Una sesión LMU completada de unas 114 minutos y 69 vueltas completas fue
inspeccionada mediante copia temporal read-only. El original permaneció
estable y con hash/metadata intactos; la copia se eliminó y no quedó ningún
temporal. No se leyeron valores de metadata ni se expusieron rutas, identidad,
coordenadas absolutas o muestras crudas.

- `Lap Dist` a 10 Hz: 70 resets fuertes, 69 vueltas completas y cero pasos
  negativos dentro de ellas. Longitud muy estable: CV aproximado 0,057 %.
- `Total Dist` a 10 Hz: totalmente monotónica y coherente con los incrementos
  de `Lap Dist`; correlación de incrementos 0,999899 fuera de resets.
- 71 eventos `Lap`, contador +1; resets alineados con mediana 52,5 ms y máximo
  92,5 ms, compatible con resolución de 100 ms.
- `GPS Time` a 100 Hz es monotónico con paso mediano 10 ms; se observó una
  discontinuidad positiva acumulada de 12,5 ms que el contrato debe tolerar
  solo después de validarla por sesión.
- GPS lat/long a 10 Hz comparte longitud con `Lap Dist`; las 69 vueltas cierran
  y no se observó teleport. Solo podrán persistirse coordenadas locales
  proyectadas, nunca coordenadas absolutas.
- `Lap Time` es la fuente completa de duración; `Current LapTime` omitió cinco
  eventos y solo puede usarse como corroboración.

Veredicto: `GO` para TA-04 limitado a `SpatialAxisV1`, validación por sesión,
degradación explícita y geometría local. No autoriza delta comparativo,
elegibilidad/validez de vueltas, nombres de curvas ni coaching.

## Cortes activos

| Proyecto | Corte | Worktree / base | Estado exacto |
|---|---|---|---|
| Telemetry Core | TC-05C / ISA-41 | `C:\tmp\vantare-isa41\vantare-v2` sobre `ebb0bd7` | review rechazada; corrección acotada de 2 P1 y 2 P2 pendiente |
| Engineer | ENG-04 preparación | read-only sobre ENG-03 `06dbfd8` | preparación terminada; contrato y prompt ejecutable listos; sin código |
| Telemetry Core | TC-06A preparación / ISA-101 | read-only sobre TC-05B `ebb0bd7` | preparación terminada; decisión condicionada, esquema y benchmark reproducible listos; sin dependencias |

## Próximas acciones exactas

1. Abrir ISA-41 / TC-05C sobre TC-05B para contratos TypeScript y harness de
   observabilidad; no migrar pantallas productivas.
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

Preparación cerrada:

- Crear paquete nuevo `internal/engineer/replay/observation`; no adaptar
  `telemetry.Frame`, replay/simulator legacy ni ejecutar `core.Runtime`.
- Única entrada: `ObservationSnapshotV1`. Runner síncrono sin I/O, goroutines,
  tiempo real ni sleeps; reloj virtual y trazas versionadas.
- Sequence puede saltar por latest-wins, pero no duplicarse/regresar; epoch no
  regresa. Evento/sesión/coche solo cambian con epoch superior. Equipo/piloto
  pueden cambiar dentro del epoch y cancelan pendientes.
- Fixtures: cero válido, pérdida de calidad, capabilities parciales,
  latest-wins, epoch reset, boundaries de identidad y negativos.
- Goldens propios y revisados, nunca generados desde el SUT; IDs sintéticos,
  cero PII/rutas/datos LMU.
- Budgets: 16.384 pasos, IDs 128 bytes, ownership defensivo, fuzz, determinismo
  x100 y benchmark de 10.000 pasos.
- El inventario legacy se conserva sin reutilizar ni borrar; este corte prepara
  el oráculo, no demuestra todavía ningún monitor.

### TC-05C — contratos TypeScript y observabilidad

- Base obligatoria: TC-05B una vez aceptada.
- Espejo TypeScript versionado de los cuatro productos y del transporte.
- Harness que demuestre full/resync, secuencia, status y facts separados,
  reconexión, gaps y diagnóstico sin payload sensible.
- Sin composición productiva, UI final ni imports de dominios internos.

Implementación recibida, aún sin commit:

- Decoder y store TypeScript puros para `overlay`, `engineer`, `strategy` y
  `analysis`, con merge patch RFC 7396 y facts en cursor independiente.
- `attach` comparte la fuente, ofrece teardown idempotente y no cablea ninguna
  pantalla productiva.
- Harness explícitamente no productivo para status, full, delta, gap, facts y
  reconexión.
- Conserva el cursor interno al avanzar status y expone estados estables sin
  mutación compartida.
- Valida contrato v1, límite de 256 KiB, JSON/profundidad, UTC, enteros seguros,
  claves privadas y prototype pollution.
- Los golden tests TypeScript leen las cuatro proyecciones producidas por Go;
  un fixture Go/TypeScript común fija nombres, rutas, status y límites.
- Evidencia del worker: 29/29 focales, 1.880/1.880 tests frontend, build,
  lint focal, TC-05B Go x20, proyecciones Go, `go test ./...`, vet focal,
  diff-check y JSON pasan.
- Playwright no aplica: este corte no crea página, layout, UI ni wiring
  productivo.
- Observaciones heredadas no bloqueantes: aviso de chunk frontend superior a
  500 KiB y mensajes `AbortError` de teardown de happy-dom con salida correcta.
- Siguiente gate: review independiente de paridad Go/TypeScript, aislamiento,
  cursor/epoch, resync/facts, límites, ownership y lifecycle de listeners.

Primera review independiente: `REJECT`.

- P1: si `statusRevision` avanza, se oculta el snapshot y después llega un full
  retenido con el mismo epoch/sequence/payload y la nueva revisión, el store lo
  trata como duplicado pero no vuelve a exponerlo. Debe publicar el estado
  coherente y añadir una regresión observable.
- P1: `requireExactKeys` rompe la evolución aditiva al rechazar campos
  desconocidos opcionales en envelopes y status. Debe validar estrictamente
  los campos conocidos e ignorar extensiones seguras dentro de la versión.
- P2: el parámetro público de tamaño permite ampliar el máximo contractual de
  256 KiB. Solo puede reducirse para tests; valores mayores o inválidos deben
  quedar acotados o rechazados.
- P2: si la segunda o tercera suscripción de `attach` falla, los listeners ya
  montados quedan activos. El montaje debe ser transaccional y el teardown debe
  intentar retirar todos los listeners aunque uno falle.
- La review reprodujo los cuatro casos. Las suites existentes, build, lint
  focal, transporte Go x20 y proyecciones Go pasaron, por lo que no hay otros
  findings P0-P3 informados.

### TC-06A — decisión de almacenamiento histórico

Preparación read-only cerrada, sin cambios de producto ni dependencias:

- `SQLite` mediante un driver Go sin CGO es el candidato principal para el
  archivo autoritativo de cada sesión, condicionado a que el benchmark de
  ISA-101 demuestre packaging Wails/Windows, carga 4x, recuperación y RPO
  máximo de dos segundos.
- `MCAP` queda como candidato condicionado para exportación, importación y
  replay interoperable. No sustituye por ahora al motor consultable.
- `DuckDB` no es apto como recorder caliente con el packaging actual
  `CGO_ENABLED=0`. Puede evaluarse después como caché analítica reconstruible y
  read-only para Telemetry Analysis.
- Un formato append-only propio solo puede participar como baseline desechable
  del benchmark; no se aceptará como formato productivo sin demostrar que las
  alternativas anteriores fallan.
- El puerto `RecordingSink` permanece puro. El reducer y la ingesta live no
  hacen I/O de disco ni importan drivers de almacenamiento.
- La autoridad histórica se separa por sesión: `observed` y `facts` son
  autoritativos, `derived` es reconstruible y versionado, y `raw` es separado,
  opt-in, acotado y borrable.
- El esquema propuesto usa manifest atómico, cursores accepted/durable,
  chunks con versión/epoch/secuencia/tiempo/CRC, migración copy-on-write,
  apertura segura de versiones futuras y recuperación que nunca borra el
  original.
- El benchmark de ISA-101 debe comparar SQLite, MCAP, DuckDB y el baseline con
  los mismos bytes y fixtures: carga nominal, 4x, 64 vehículos, 24 h lógicas,
  30 min reales, lectura concurrente, kill, tail truncado, disco lleno, writer
  lento y pérdida de permisos.
- Gates mínimos: `>=4x` sin pérdida silenciosa, RPO `<=2 s`, sesión incompleta
  visible y recuperable, build/instalador Windows real, crecimiento acotado,
  licencias inventariadas y consultas/replay deterministas.
- ISA-101 no añadirá un backend a producción: entrega evidencia, ADR,
  resultados crudos reproducibles y el contrato ejecutable de TC-06B.

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

El fix de TC-05B añadió `ProductID` cerrado y un hub ligado al producto,
eventos/rutas inequívocos, epoch estrictamente creciente, continuidad exacta
de facts desde `after`, reseal del delta y regresiones de cuatro productos,
suscriptores, loopback IPv4/IPv6 y cierre concurrente. Focal x20, Telemetry
Core, suite Go global, vet, race x5 y diff-check pasaron. Re-review activa.

La segunda review confirmó cerrados los cinco findings originales, pero rechazó
el corte por dos nuevos: SSE emitía `projection/status` mientras Wails usaba el
nombre completo por producto, y un helper de test hacía polling con
`time.Sleep`. Se ordenó alinear nombres SSE/Wails y comparar nombre+JSON, además
de sustituir el polling por señalización determinista. No hay otros P0–P3.

El segundo fix hace que SSE y Wails emitan exactamente el mismo nombre completo
por producto y el mismo JSON. La regresión compara ambos. El helper de test ya
espera una señal por canal con timeout y no contiene `time.Sleep`. Focal x20,
Telemetry Core, vet, race x5 y diff-check pasaron; queda re-review final.

La tercera review de TC-05B fue `ACCEPT` sin P0–P3. Commit `ebb0bd7`, push y PR
draft #35 correctos; sin promoción. Linear queda pendiente de sincronización
por ausencia del conector.

El fix de ENG-03 alineó el proyector y el adaptador: `LapNumber` por sí solo
declara `GroupStandings`. La regresión recorre el flujo completo con vuelta 7 y
verifica grupo exacto, presencia, frescura y usabilidad. La re-review final fue
`ACCEPT` sin P0–P3. Commit `06dbfd8`, push y PR draft #34 correctos; sin
promoción. Linear queda pendiente de sincronización por ausencia del conector.
