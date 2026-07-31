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
| Telemetry Core | TC-05C / ISA-41 | `4801dce`, PR draft #36 sobre TC-05B | cerrado técnicamente; Linear pendiente; sin promoción |
| Engineer | ENG-04 preparación | read-only sobre ENG-03 `06dbfd8` | preparación terminada; contrato y prompt ejecutable listos; sin código |
| Telemetry Core | TC-06A / ISA-101 | `C:\tmp\vantare-isa101\vantare-v2` sobre TC-05C `4801dce` | `In Review`; commit `6aa46f1`, PR draft #37, sin promoción |
| Telemetry Core | TC-06B / ISA-102 | `8683f03`, PR draft #38 sobre TC-06A `6aa46f1` | cerrado técnicamente; Linear pendiente; sin promoción |
| Telemetry Core | TC-06C / ISA-103 | `8b89c0a`, apilada sobre TC-06B `8683f03` | cerrado técnicamente; sin promoción |
| Telemetry Core | TC-06D / ISA-104 | `3b44d36`, PR draft #40 sobre TC-06C `8b89c0a` | `In Review`; reviews `ACCEPT`; sin promoción |
| Telemetry Core | TC-07A / ISA-105 | base exacta `3b44d36` | siguiente corte; aún sin worktree ni código |

## Próximas acciones exactas

1. Abrir ISA-105 / TC-07A sobre ISA-104 `3b44d36` para proyección Overlay y
   shadow comparator; no hacer cutover, CSS, canvas ni regenerar baselines.
2. Abrir ENG-04 sobre ENG-03 para caracterizar mediante replays una familia de
   monitores antes de migrarla; no inventar señales ni borrar el frame legacy.
3. Abrir TA-04 sobre TA-03. Primero debe producir evidencia reproducible de
   `Lap Dist`, `Total Dist` y/o GPS; si no existe, debe degradar honestamente y
   no implementar mapa/delta sintéticos.
4. Continuar secuencialmente TC-07, ENG-04 y TA-05 según sus microplanes y
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

Corrección recibida:

- Un full idéntico vuelve a exponer el snapshot después de avanzar
  `statusRevision`; una marca temporal incoherente no se acepta como duplicado.
- Envelopes y status toleran extensiones JSON aditivas seguras sin relajar
  campos obligatorios, versiones, tipos ni claves prohibidas.
- El límite público queda siempre acotado a 256 KiB; el override solo reduce y
  los valores inválidos se rechazan.
- El montaje de listeners es transaccional y el teardown intenta ejecutar todos
  los removers aunque uno falle.
- Evidencia fresca: 36/36 focales, 1.887/1.887 tests frontend, lint focal,
  build y `git diff --check` pasan. Persisten únicamente los avisos heredados
  de `.eslintignore` y tamaño de chunk.
- No hay commit, push, PR, Linear ni promoción. Falta re-review independiente.

Segunda review independiente: `ACCEPT`, sin P0-P3 nuevos o pendientes.

- Reprodujo restauración del full con nueva revisión, rechazo de timestamp
  contradictorio, extensiones aditivas, límites duros/incorrectos y ambos
  fallos de lifecycle de listeners.
- Confirmó que campos obligatorios, versiones futuras, tipos inválidos, claves
  reservadas y prototype pollution continúan cerrados.
- TypeScript focal 36/36, lint focal, transporte Go x20, proyecciones Go,
  frontend TypeScript/build y diff-check pasan.
- Playwright sigue sin aplicar porque el corte no expone ninguna UI.
- Entrega: commit `4801dce`, push sincronizado, worktree limpio y PR draft
  [#36](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/36)
  apilada sobre la rama TC-05B. No se promovió a `nightly`, `testers` ni
  `master`.

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

Ejecución iniciada:

- Linear sincronizado: ISA-41 está `In Review` con commit `4801dce`, PR draft
  #36 y evidencia; ISA-101 está `In Progress`.
- Rama exacta de Linear:
  `vantareapp/isa-101-tc-06a-auditoria-de-almacenamiento-y-esquema-historico`.
- Worktree limpio `C:\tmp\vantare-isa101\vantare-v2`, base exacta TC-05C
  `4801dced7f93ab13ef639f01c3c4e6e9790b5d8c`.
- El corte sigue limitado a investigación, benchmark aislado, ADR, esquema,
  recuperación y decisión GO/NO-GO. No puede añadir aún un driver de base de
  datos al producto.

Entrega del worker completada; review independiente pendiente:

- La rama continúa en la base exacta TC-05C `4801dce`, sin commit, push, PR ni
  promoción. El worktree es `C:\tmp\vantare-isa101\vantare-v2`.
- Se crearon ADR 0005, el informe reproducible de benchmark, el esquema
  histórico v1, la evidencia cruda y un módulo Go aislado bajo
  `tools/benchmarks/isa101-storage/`. El `go.mod` productivo no cambió.
- Resultado propuesto: SQLite `modernc` como store autoritativo condicionado;
  MCAP para export/import/replay; DuckDB fuera del recorder actual por
  CGO/packaging Windows; framing propio solo como baseline desechable.
- 48 ejecuciones pasaron y 16 grupos conservaron el mismo SHA-256 entre los
  candidatos ejecutables. SQLite recuperó `200 accepted / 200 durable / 200`
  tras kill coordinado; MCAP quedó en `200 / 0 / 0` antes de `Close`.
- El contrato propuesto para TC-06B exige manifest atómico, cursores
  accepted/durable, intervalo máximo de 1,5 s, commit máximo de 500 ms,
  observed/facts autoritativos, derived reconstruible, raw opt-in separado y
  migraciones copy-on-write.
- Tests del módulo por tags, vet, builds CGO=0, Telemetry Core, Go global,
  frontend build, Wails Windows CGO=0, licencias, sanitización y diff-check
  pasan.
- Limitaciones declaradas: disk-full/ACL requieren un entorno aislado; writer
  lento se probará mediante fault injection en TC-06B; `-race` está bloqueado
  sin compilador C; 24 h lógica tiene una repetición; DuckDB no produjo cifras
  runtime y el CLI MCAP consultado no compiló por incompatibilidad de
  dependencias.
- TC-06B permanece bloqueada hasta review adversarial, resolución de todos los
  P0-P3 razonables y aceptación explícita del ADR.

Primera review independiente: `NEEDS FIXES`.

- P1: `acceptedCursor` solo avanza en memoria antes del checkpoint, por lo que
  un crash no permite reconstruir ni cuantificar exactamente todos los lotes
  aceptados. El kill actual solo cubre `accepted=durable`.
- P1: el esquema promete ausencia de nombres e IDs remotos, pero no define un
  `RecordingPayloadV1` allowlisted separado de los estados live que sí contienen
  identidades. La fixture sintética no demuestra privacidad del payload real.
- P2: DB y manifest no pueden reemplazarse atómicamente como pareja en Windows;
  la migración necesita nombres versionados y un único punto de conmutación en
  el manifest. El rollback tampoco puede quitar SQLite y conservar a la vez un
  reader SQLite.
- P2: la recuperación MCAP está documentada por upstream pero no fue verificada
  localmente; el CLI quedó bloqueado y el harness solo detectó truncación.
- P2: `cold/warm` no es una distinción real sin purga de caché y las medianas la
  mezclan; la fixture sintética tampoco representa aún el footprint del payload
  histórico final.
- P3: el README conserva una frase obsoleta sobre TC-05–TC-09 pendientes.
- El revisor reprodujo tests, vets, 48/48 ejecuciones, digests, faults,
  builds/SHAs, bloqueos DuckDB, 21/21 licencias, agregados, Telemetry Core, Go
  global y diff-check. No alteró el worktree.
- Se ordena un fix documental/benchmark acotado: semántica
  volatile/persisted, estado recording/incomplete y kills en boundaries;
  `RecordingPayloadV1` allowlisted con golden negativo; migración por manifest;
  afirmaciones MCAP y first/subsequent honestas; README reconciliado.

Fix de primera review completado; re-review pendiente:

- `RecordingPayloadV1` queda separado de Core, versionado y allowlisted, con
  golden SHA-256 y negativos para nombres, equipos, IDs remotos/Steam, rutas y
  metadata abierta.
- `accepted` es ahora explícitamente volátil. El manifest `recording` se
  persiste antes del primer accept; el watermark persistido y el commit son
  fronteras distintas; todo estado no `complete` recupera como `incomplete`.
- Ocho probes reproducen cuatro límites de crash para SQLite y framing,
  incluido DB en cursor 240 con manifest/watermark en 200.
- La migración usa nombres de DB versionados y conmuta únicamente el manifest;
  rollback conserva reader y dependencia mientras existan sesiones antiguas.
- MCAP queda descrito como candidato condicionado y la recuperación upstream
  como no verificada localmente.
- Los resultados usan `first/subsequent`, las medianas excluyen la primera
  pasada y la fixture sintética no se presenta como footprint/retención.
- README, plan y handoff se reconciliaron. Tests por tags x5, vet, 48 filas/16
  grupos/12 agregados, crash boundaries, Telemetry Core, Go global y
  diff-check pasan.
- Siguen correctamente deferidos a TC-06B: disk-full, ACL, writer lento,
  coordinator/RPO productivo, mapping real, retención y empaquetado SQLite.

Segunda review independiente: `NEEDS FIXES`.

- Cerrados: semántica accepted/durable, migración/rollback, wording de MCAP,
  separación first/subsequent y README.
- P1 restante: `RecordingPayloadV1` protege observed, pero facts continúa como
  bytes arbitrarios pese a que el contrato promete allowlist. Se requiere
  `RecordingFactV1` tipado con encoder/decoder, golden y negativos.
- P2: el negativo de privacidad de observed parte de `vehicles: []`, ya
  inválido, y solo comprueba un error genérico. Debe usar un payload válido,
  demostrar que sin campo extra pasa y comprobar rechazo específico de cada
  unknown field.
- P2: `read_only` se transforma incorrectamente en `incomplete`. Integridad de
  sesión y modo de acceso deben ser estados separados; una sesión sana puede
  abrirse read-only.
- P2: el CSV declara `volatile_accepted=240` en `before_append`, aunque el hijo
  se detiene antes de aceptar los 40 últimos y el valor correcto es 200.
- El revisor repitió tests x5, vet, Telemetry Core, faults, agregados, 48/48
  filas y diff-check. El worktree permaneció read-only.

Fix de segunda review completado; tercera review pendiente:

- `RecordingFactV1` queda tipado, versionado y allowlisted, con codecs binario
  y JSON, golden y negativos equivalentes a observed.
- Los tests de privacidad parten ahora de JSON válido y exigen
  `UnknownRecordingFieldError` con el nombre exacto del campo rechazado.
- `integrity_state` y `access_mode` quedan separados; `read_only` no degrada
  una sesión íntegra `complete`.
- `before_append` declara `volatile_accepted=200`; los límites posteriores
  declaran 240, conforme al momento real de aceptación.
- Throughput, agregados, faults, tamaños y documentación se regeneraron.
  Focal x5, tags combinados, vet, 48 filas/16 digests/12 agregados, ocho
  boundaries, Telemetry Core, Go global, scope, sanitización y diff-check
  pasan.

Tercera review independiente: `NEEDS FIXES` por un único P2.

- Los cuatro cierres solicitados quedaron correctos y no aparecen P0, P1 ni
  P3 nuevos.
- P2: el decoder binario de `RecordingFactV1` valida longitud/header pero no
  exige que los bytes reservados 57..159 permanezcan en cero. Podría aceptar
  datos ocultos fuera de la allowlist.
- Fix mínimo ordenado: rechazar cualquier reservado no cero y añadir una
  regresión binaria que muta un fact válido y exige el error tipado.
- El revisor reprodujo focal x5 y x100, tags, vet, Telemetry Core, faults,
  48/48 filas, 16 digests, 12 agregados, gofmt y whitespace; revisión read-only.

Fix del único P2 completado; review final pendiente:

- `decodeRecordingFactV1` rechaza cualquier byte reservado no cero en
  `[57:160]` con `errRecordingPayload`.
- La regresión table-driven cubre los límites 57 y 159.
- Encoder y CSV válidos no cambian. Tests x100 base/SQLite/MCAP, vet,
  Telemetry Core, Go global, gofmt y diff-check pasan.

Cuarta review independiente: `ACCEPT`, cero P0-P3.

- El revisor confirmó reserved-zero en todo `[57:160]`, límites 57/159,
  round-trip y goldens estables; repitió focal x100, benchmark x5 por tags,
  vet, Telemetry Core, gofmt, diff-check y revisión del diff completo.
- Entrega final ISA-101: commit `6aa46f1`, push sincronizado, worktree limpio y
  PR draft [#37](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/37)
  apilada sobre TC-05C.
- Linear ISA-101 está `In Review` con decisión, evidencia, límites, commit y PR.
- No hubo promoción a `nightly`, `testers` ni `master`.
- TC-06B queda habilitada únicamente como siguiente rama apilada sobre
  `6aa46f1`, preservando los gates deferidos del ADR.

### TC-06B — RecordingSink, sesiones y recuperación

Ejecución iniciada:

- Linear ISA-102 está `In Progress`.
- Rama exacta:
  `vantareapp/isa-102-tc-06b-recordingsink-sesiones-y-recuperacion`.
- Worktree limpio `C:\tmp\vantare-isa102\vantare-v2`, base exacta ISA-101
  `6aa46f17a613bd85b6eafbf22db5a7a70b527a00`.
- Alcance cerrado: store/coordinator/manifest/recovery del ADR 0005, mapping a
  payloads históricos allowlisted, cola acotada, checkpoints, fault injection,
  retención/crecimiento y packaging Windows/licencias.
- Fuera de alcance: UI, MCAP productivo, replay, DuckDB, raw real, Strategy y
  cambios al reducer.
- Gates: live nunca bloquea; no hay drop silencioso; todos los fallos dejan
  estado `incomplete`; recovery preserva original; RPO y presupuesto de commit
  se demuestran con la implementación real.

Entrega del worker lista para review independiente:

- Implementados `RecordingSink`, mapper allowlisted, coordinador, manifiestos,
  reader histórico y adaptador SQLite privado `modernc`, sin wiring productivo.
- Cola acotada sin expulsión silenciosa; `accepted` volátil no se promueve a
  cursor persistido; RPO pendiente máximo de dos segundos sin penalizar una
  sesión inactiva.
- Recovery copy-on-write de DB/WAL/SHM, manifests futuros limitados a metadata
  segura y cierre/abort acotados.
- Cerrados durante implementación cinco riesgos: RPO tras idle, abort
  bloqueable, invariantes incompletas del manifest, traversal de rutas futuras
  y cursor volátil falsamente persistido.
- PASS: focales x5, coordinador/contratos x100, Telemetry Core, suite Go global,
  vet focal, guard arquitectónico, fuzz 5 s con 503.312 ejecuciones, frontend
  build, Wails Windows con CGO desactivado y `git diff --check`.
- `-race` no fue ejecutable porque el host carece de `gcc`; no se considera
  evidencia equivalente y debe constar como limitación.
- La medición actual del Wails binario crece solo 512 bytes porque el adaptador
  aún no está conectado y el linker lo elimina. Debe repetirse cuando TC-07 lo
  enlace realmente.
- Sin commit, push, PR, Linear final ni promoción. Siguiente acción exacta:
  review adversarial completa contra la base `6aa46f1`.

Primera review adversarial: `CHANGES REQUIRED`, sin P0, con cuatro P1 y tres
P2 confirmados:

- P1: `CommitBudget` se medía al retornar, pero no imponía deadline real a
  `Append`, `Checkpoint` ni `Complete`.
- P1: una carrera entre fallo terminal y `Stop` podía completar una sesión que
  debía permanecer `incomplete`.
- P1: snapshots y facts usan cursores independientes, pero los chunks podían
  colisionar al aceptar batches solo de facts y omitían sus tiempos en batches
  mixtos.
- P1: el bloqueo de recovery era local a una instancia de `Store`, no
  compartido entre instancias/procesos.
- P2: el reader rechazaba tipos de facts válidos posteriores a
  `FactSessionChanged`.
- P2: manifest aceptaba cursores parciales y motivos `incomplete` no cerrados.
- P2: throttle/brake admitían NaN y las máscaras de presencia no estaban
  limitadas a bits v1 conocidos.
- Los checks de la review pasaron (focal x10, Telemetry Core, suite Go global,
  vet focal, Wails CGO-free, benchmark x5 y diff-check). `-race` sigue
  bloqueado por ausencia de `gcc`.
- Siguiente acción exacta: corregir los siete findings con regresiones
  adversariales y repetir review independiente completa. TC-06C continúa
  bloqueada.
- Fix iniciado en el mismo worktree. Decisión cerrada para v1: todo batch
  durable contiene snapshot y usa su cursor como `Accepted`; facts-only se
  rechaza, los facts conservan su secuencia independiente y sus tiempos sí
  participan en los límites temporales del chunk. El lease de sesión debe ser
  real y compartido por filesystem/proceso, no un mapa local.

Fix completado y listo para re-review:

- Los siete findings están corregidos con tests: deadlines reales, fallo
  terminal prioritario, namespace durable de snapshots, bounds temporales
  mixtos, lease cross-process, filtro completo de facts e invariantes cerradas
  de manifest/payload.
- En Windows el lease usa un handle exclusivo que el kernel libera al terminar
  el proceso; existe regresión con dos Stores y subproceso muerto sin `Close`.
  El fallback no-Windows es fail-safe: un lease stale bloquea y requiere
  retirada manual, pero nunca permite dos writers.
- PASS: focal x5, carreras terminal/deadlines x100, lease/namespace/bounds x20,
  fuzz 5 s (275.462 ejecuciones), Telemetry Core, suite Go global, vet focal,
  guard arquitectónico, Wails Windows CGO-free y diff-check.
- Benchmark de 64 vehículos x5: 4,03–6,35 ms/op, 15.900–16.606 B/op y 70–72
  allocs/op.
- `-race` continúa bloqueado únicamente por ausencia de `gcc`.
- Sin commit, push, PR, promoción ni cierre de Linear. Siguiente acción exacta:
  re-review adversarial independiente completa.

Segunda review adversarial: `CHANGES REQUIRED`.

- Cerrados seis hallazgos originales: carrera fallo/Stop, namespace facts,
  bounds mixtos, lease cross-process, tipos de fact y validaciones cerradas de
  cursor/reason/payload.
- P1: `pendingSince` no avanzaba al primer batch aún volátil tras un checkpoint
  parcial y podía disparar RPO usando la antigüedad de datos ya persistidos.
- P1: el deadline del coordinador no alcanzaba la escritura/fsync/reemplazo
  atómico del manifest porque el filesystem ignoraba el contexto.
- P2: el DSN SQLite interpolaba rutas sin codificación URI; `#` y `%` podían
  alterar o invalidar la ruta.
- PASS: focal x10, Telemetry Core, suite Go global, vet focal y diff-check.
  Wails no se repitió en esta review; `-race` sigue bloqueado por `gcc`.
- Siguiente acción exacta: tracking del primer cursor realmente no persistido,
  filesystem context-aware con regresión bloqueada y DSN seguro probado bajo
  `folder # 100%`; después, tercera review completa. TC-06C sigue bloqueada.

Tercera review y entrega técnica: `ACCEPT`.

- Los tres findings de la segunda review quedaron corregidos con regresiones:
  ledger de deuda por cursor/tiempo y epochs, escritura atómica cooperativa con
  contexto y limpieza de temporales, y DSN SQLite construido mediante
  `net/url` para rutas con `#`, `%`, espacios y Unicode.
- La review final no encontró P0/P1/P2/P3 conocidos. El worker repitió focal
  x10, RPO/off-by-one x100 y filesystem/DSN x100.
- Verificación fresca del orquestador: recording PASS, Telemetry Core PASS,
  vet focal PASS, build Wails Windows con CGO desactivado PASS y suite Go
  global serial PASS.
- Una ejecución global paralela reprodujo únicamente la contención Windows
  heredada `TestConcurrentSavesDontCorruptFile` de ISA-118. El caso aislado
  x20 y la suite serial pasan; no se atribuye una regresión a TC-06B.
- `-race` no es ejecutable en este host por ausencia de `gcc`.
- Commit `8683f036bc1169be2e27ea50982ebf86af369bed`, rama remota sincronizada y
  PR draft [#38](https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/38)
  apilada sobre ISA-101. No hubo merge ni promoción.
- Linear queda pendiente de sincronización porque el conector no está expuesto
  en esta sesión. TC-06C puede abrirse de forma apilada sobre `8683f03`; no se
  habilita wiring productivo.

### TC-06C — Replay raw, canónico e histórico

Ejecución iniciada:

- Rama exacta:
  `vantareapp/isa-103-tc-06c-replay-raw-canonico-e-historico`.
- Worktree limpio
  `C:\tmp\vantare-isa103\vantare-v2\vantare-v2`, base exacta TC-06B
  `8683f036bc1169be2e27ea50982ebf86af369bed`.
- Alcance: player determinista con velocidad/step, fixtures raw sanitizadas y
  versionadas, replay canónico tipado para harnesses, consultas históricas
  paginadas y motor de migraciones unidireccional copy-on-write.
- Fuera de alcance: fuente live, fallback productivo, raw capture, UI,
  consentimiento/export, MCAP/DuckDB, Strategy y wiring del composition root.
- Dos auditorías read-only paralelas revisan las fronteras raw/canonical e
  histórico/migración antes de cerrar contratos. Ningún subagente edita.
- Linear ISA-103 no pudo pasar a `In Progress` porque el conector no está
  expuesto en esta sesión; el bloqueo queda registrado sin detener el trabajo
  local autorizado.

Auditorías de diseño completadas:

- `RecordingPayloadV1` es deliberadamente parcial y no puede reconstruir el
  estado canónico. Se mantienen tres replay separados: raw en el driver LMU,
  batches canónicos que vuelven a atravesar el reducer real y registros
  históricos del store.
- El replay histórico tendrá un reader neutral, congelado y paginado; no
  reutilizará las consultas ilimitadas `Observed()`/`Facts()` ni asumirá que
  sus cursores son equivalentes.
- Versiones futuras serán metadata-only y nunca abrirán su DB/WAL/SHM.
- El motor de migración será unidireccional y copy-on-write. El catálogo
  productivo permanecerá vacío hasta que exista un schema v2 real; una
  migración sintética privada solo demostrará el motor en tests.
- Replay no implementará `core.Driver`, no se registrará como fuente live ni
  se conectará al composition root. Un guard arquitectónico protegerá esa
  frontera.
- `core.RecordingSink` está huérfano, pero su retirada queda fuera de ISA-103
  para no mezclar deuda no relacionada con este corte.

Primera review de implementación: `REQUEST_CHANGES`.

- Conteo inicial: P0 0, P1 5, P2 5. El corte no se acepta ni se entrega.
- Ya quedaron corregidos y cubiertos por regresión: rango temporal por grupo
  causal (nunca fact huérfano), transición canónica de sesión con
  `SessionEnded` del header anterior, facts canónicos sin batch, identidad
  exacta header/value, hash fijo de la captura LMU y guard harness-only sobre
  todo el módulo.
- Siguen en corrección: límite histórico según el último checkpoint del
  manifest, activación de migración con comparación atómica de origen/destino,
  identidad única y fija del reader, verificación de columna fact/payload,
  integridad de chunks, binding de metadata y pacing racional sin drift.
- Gates frescos antes de la review: Telemetry Core completa PASS y build Wails
  Windows sin CGO PASS. Los checks se repetirán después de cerrar todos los
  findings.

Segunda review de implementación: `REQUEST_CHANGES`.

- Los 10 findings iniciales quedaron cerrados o cubiertos, pero la re-review
  encontró tres bordes adicionales: un fact de un chunk no checkpointed podía
  hacerse visible por apuntar a un snapshot antiguo; un ratio coprimo grande
  podía desbordar durante la multiplicación intermedia; y Unix epoch se usaba
  como centinela de timestamp ausente.
- Los tres quedaron corregidos con regresiones: visibilidad de facts por chunk
  reconocido por el manifest y causalidad global, `bits.Mul64/Div64` para
  escalado racional y booleano explícito de timestamp inicializado.
- Focal replay x20 e histórico x20 pasan. El diff vuelve a quedar congelado
  para re-review final; no hay entrega ni promoción todavía.

Tercera revisión adversarial de ISA-103: `REQUEST_CHANGES`.

- Repitió los tres bordes ya corregidos de visibilidad por checkpoint, ratio
  racional grande y Unix epoch, y añadió dos P2 reales.
- La metadata confundía build del simulador con build de Vantare; ahora son
  campos separados y el replay histórico liga `AppBuild` al manifest.
- La regresión LMU mezclaba una captura Shared Memory sanitizada con payloads
  REST sintéticos bajo una única procedencia. Ahora son fixtures separadas:
  captura sanitizada para Shared Memory y fixture `synthetic` para REST.
- El guard global de replay ignoraba Go generado aunque esos archivos sí se
  compilan. El guard harness-only incluye ahora generados y una regresión
  demuestra el rechazo.
- Replay x20, histórico/migraciones x20, guard arquitectónico x20 y parsers /
  cancelación LMU x100 pasan tras las correcciones. El corte queda congelado
  para la re-review final; sin commit de producto, PR ni promoción todavía.

Cierre técnico de ISA-103 / TC-06C:

- Dos re-reviews finales independientes: `ACCEPT`, P0/P1/P2/P3 = 0 en ambas.
- Suite Telemetry Core, suite Go global serial, vet focal, regresiones
  repetidas y build Wails Windows con CGO desactivado: PASS.
- Commit:
  `8b89c0adafed46a3c2c42cd52c858c8c185aa8bf`.
- Push sincronizado 0/0.
- PR draft apilada sobre ISA-102:
  `https://github.com/isaacalbala12/Vantare-Simracing-Suite/pull/39`.
- Worktree limpio. Sin wiring productivo, merge ni promoción.
- Linear queda pendiente de sincronización porque el conector no está expuesto
  en esta sesión.
- Siguiente dependencia: ISA-104 / TC-06D desde el commit anterior.

Inicio de ISA-104 / TC-06D:

- Rama:
  `vantareapp/isa-104-tc-06d-inspector-privacidad-y-export-diagnostico`.
- Worktree limpio: `C:\tmp\vantare-isa104\vantare-v2`.
- Base exacta: ISA-103
  `8b89c0adafed46a3c2c42cd52c858c8c185aa8bf`.
- Alcance: inspector local de sesiones/manifest/calidad, hardening de
  diagnósticos, preview exacta antes de copiar/exportar y raw capture
  diagnóstica opt-in con límites.
- Fuera de alcance: Telemetry Analysis, Strategy, upload, sharing, fórmulas,
  gráficas de conducción, wiring productivo del nuevo core y dependencias.
- Dos auditorías read-only paralelas revisan privacidad/export y reutilización
  UI/contratos antes de congelar el miniplan. Ningún subagente edita.
- Baseline: diagnósticos Go x10 PASS y Settings/TelemetryPage frontend 31/31
  PASS tras instalar dependencias desde el lockfile.
- Linear ISA-104 sigue pendiente de sincronización porque el conector no está
  expuesto en esta sesión.

Contrato ejecutable de ISA-104 / TC-06D congelado:

- Plan:
  `docs/superpowers/plans/2026-07-30-isa-104-tc-06d-inspector-privacy-export.md`.
- Auditoría de privacidad: `REQUEST_CHANGES` sobre el flujo heredado. Los dos
  P1 confirmados son el diagnóstico construido copiando nombres/IDs/notas/
  argumentos/hotkeys del usuario y la copia inmediata al portapapeles sin
  preview exacta. Se sustituye por un DTO allowlist construido desde cero.
- Auditoría de arquitectura/UI: el inspector pertenece exclusivamente a
  Ajustes > Diagnóstico; `TelemetryPage.tsx` queda reservado para Telemetry
  Analysis. La UI solo recibe handles opacos y nunca rutas o tipos SQLite.
- Export acordado: JSON determinista e inmutable con bytes visibles, tamaño y
  SHA-256. Copiar/descargar reutiliza exactamente el mismo payload; no hay
  upload, SSE ni regeneración TOCTOU.
- Inspector acordado: sesiones/manifest/campos/presencia/calidad agregada.
  Queda fuera la tabla avanzada por vuelta/muestra y no se afirmará calidad por
  señal que el schema actual no persiste.
- Raw capture acordada: capacidad diagnóstica separada del histórico v1,
  desactivada por defecto, 60 s / 64 MiB por defecto, 120 s / 128 MiB de
  máximos, 5 Hz y retención temporal de siete días.
- LMU conservará exactamente una apertura de `LMU_Data`. Un tap privado,
  opcional y no bloqueante recibirá copias del snapshot estable; el wiring
  productivo queda para TC-07/TC-08.
- Sin dependencias nuevas, sin tocar Strategy/Engineer/Overlay Studio y sin
  promoción. El trabajo se ejecutará en microcortes TDD D1–D7 y pasará review
  independiente de código, privacidad y arquitectura.

Entrega del bloque backend ISA-104 (D1/D2/D3/D5/D6):

- Diagnóstico genérico reemplazado por un DTO allowlist y preview JSON exacta
  con SHA-256/tamaño. Tests adversariales cubren identidad, email, Steam ID,
  tokens, rutas, URL, argumentos, notas y hotkeys.
- Catálogo local nuevo bajo `internal/telemetry/diagnostics`: raíz fija del
  backend, handles opacos, límites, orden determinista y estados current/
  future/corrupt. Una sesión futura queda metadata-only y no abre SQLite.
- El resumen inspecciona como máximo 4.096 registros, es cancelable y solo
  publica presencia de campos y calidad agregada realmente persistida.
- Raw capture temporal separada: opt-in, una activa, 5 Hz, 60/120 s,
  64/128 MiB, 2 MiB por frame, retención de siete días, cola no bloqueante,
  drops observables y estados terminales.
- LMU añade un sanitizador reconstructivo y un tap privado en el único driver.
  No existe segundo attach, wiring productivo ni modificación del manifest v1.
- Alcance raw honesto: reproduce global+player consumidos por el parser Shared
  Memory actual. No se presenta como replay de Spotter/grid; esa ampliación
  queda para TC-07/TC-08 con señales demostradas.
- Focales repetidos, Telemetry Core y `internal/app/...`: PASS. Vet/fuzz/bench
  focales del worker: PASS. Race sigue no disponible sin GCC; vet LMU conserva
  dos avisos `unsafe.Pointer` heredados. Wails aún no aplica porque falta D4.
- Backend queda sin commit para dos reviews read-only independientes antes de
  implementar UI. No hay merge, promoción ni sincronización Linear.

Primera review doble del backend ISA-104: `REQUEST_CHANGES`.

- Conteo consolidado: P0 0, P1 1, P2 5 y P3 1.
- P1: el reemplazo Windows de `metadata.json` podía dejar únicamente
  `.previous` tras un crash; la retención automática ignoraría después esa
  captura sensible.
- P2: catálogo y handles no estaban realmente acotados; `List` inspeccionaba
  hasta 4.096 registros por sesión y conservaba `SessionRef` obsoletos.
- P2: manifests/metadata se cargaban completos antes de sus límites y la
  protección de symlinks/junctions era check-then-act.
- P2: la captura persistida no registraba build/fingerprint/schema/versiones
  del sanitizador/framing ni hash final suficiente para auditar replay.
- P2: el driver sanitizaba ~325 KiB antes de comprobar una cola saturada; el
  benchmark anterior solo medía `TryWrite` y no el camino real.
- P2: fuzz/regresión no demostraban que todos los bytes fuera de la matriz de
  offsets permitidos quedasen a cero.
- P3: antes del wiring productivo Windows deberá derivar la raíz privada y
  validar/endurecer su ACL.
- Los dos reviewers confirmaron correctos allowlist, payload/hash exactos,
  future metadata-only, apertura única de `LMU_Data`, ownership y ausencia de
  red/dependencias/wiring. Race focal x5 pasó con UCRT64 en la review de
  arquitectura.
- El bloque vuelve al implementador con TDD y remedios concretos; la UI D4 no
  comienza hasta re-review `ACCEPT`.

Resultado de las primeras correcciones y segunda re-review ISA-104:

- Cerrados: reemplazo atómico/recuperable de metadata, cleanup tombstone,
  catálogo `List` metadata-only + `Inspect(handle)`, enumeración máxima 500,
  handles por generación/TTL, JSON acotado, procedencia/hash raw, reserva del
  tap antes de sanitizar y máscara exhaustiva de bytes.
- Un gate global del orquestador detectó una regresión que los focales iniciales
  no vieron: Windows podía reutilizar File ID al reemplazar la DB. Se añadió
  una huella acotada de cabecera/cola, tamaño y mtime. Reemplazo, rewrite
  in-place y truncado pasan x100; diagnostics x50 y Telemetry completo PASS.
- Segunda re-review: `REQUEST_CHANGES` por manifest reescrito in-place sin
  invalidar el handle y ausencia de guard de imports para la nueva capa
  `internal/telemetry/diagnostics`.
- Se corrige el manifest con SHA-256 exacto (máximo 32 KiB) y se limita
  diagnostics a recording/schema/su propio árbol.
- Contrato de amenaza explícito: el handle autoriza una sesión/ruta privada,
  no congela cada byte de una SQLite activa. Mutaciones internas legítimas son
  verificadas por Store; no se hashea la DB completa. Un atacante con control
  del almacenamiento privado del mismo usuario queda fuera de esta capa. El
  wiring productivo deberá derivar la raíz privada y validar ACL.
- La UI D4 sigue bloqueada hasta la re-review final del backend. Sin merge,
  promoción ni Linear.

Tercera corrección backend ISA-104 preparada para review final:

- `manifest.json` queda ligado al handle mediante SHA-256 exacto del documento
  acotado, tamaño, mtime e identidad de archivo. La revalidación ocurre antes y
  después de la lectura.
- La regresión sobrescribe el manifest in-place con un cambio semántico,
  conserva File ID/tamaño/mtime y demuestra invalidación x100.
- SQLite conserva revisiones legítimas durante una sesión activa: el handle
  autoriza la sesión y su ruta, mientras Store/replay valida el contenido. No
  se confunde una sesión mutable con un snapshot inmutable.
- El guard arquitectónico permite a `internal/telemetry/diagnostics` importar
  únicamente recording, schema cuando proceda y su propio árbol; rechaza
  core, derive, projection, driver, drivers y productos.
- El documento ISA-104 registra el modelo de amenaza, el límite frente a un
  atacante con control del almacenamiento privado del mismo usuario y el gate
  futuro obligatorio de raíz privada/ACL en el wiring.
- Verificación fresca del orquestador: manifest/invalidación x100 PASS, guard
  real x20 PASS, diagnostics x20 PASS, Telemetry Core completo PASS, gofmt y
  `git diff --check` PASS.
- Dos reviewers read-only finales de arquitectura y privacidad están activos.
  D4 permanece bloqueada hasta obtener `ACCEPT` sin P0/P1/P2/P3 razonables.
  Sin commit, merge, promoción ni sincronización Linear.

Cierre backend ISA-104 y apertura de D4:

- La review final de arquitectura detectó un único P2: `List` abría
  `manifest.json` antes de comprobar con `Lstat`, por lo que podía leer
  metadata de un symlink estático antes de invalidarlo.
- Corregido con `Lstat` previo, rechazo de symlink/no-regular y comprobación de
  identidad+tamaño+mtime del descriptor abierto. La regresión enlaza un
  manifest externo válido y conserva una sesión normal.
- El mismo review corrigió evidencia documental obsoleta: race focal x5 pasa
  mediante UCRT64.
- Re-review final de arquitectura: `ACCEPT`, P0/P1/P2/P3 = 0. Review final de
  privacidad: `ACCEPT`, P0/P1/P2/P3 = 0.
- Evidencia consolidada: manifest/catálogo x100 PASS, diagnostics/captura/
  arquitectura x20 PASS, sanitizador/tap LMU x100 PASS, race focal x5 PASS,
  fuzz 10.511 ejecuciones PASS, Telemetry Core/app/vet/gofmt/diff-check PASS.
- Linear volvió a estar disponible: ISA-104 pasó de Backlog a `In Progress` y
  recibió rama/worktree/base/plan, estado backend y gates. El nombre real de
  rama queda registrado en el comentario porque el slug histórico de Linear no
  coincide exactamente.
- D4 queda desbloqueado. Se divide en composición Go/Wails de lectura y UI
  aislada con cliente correlacionado, preview exacta y harness. Raw capture
  continúa sin wiring productivo. Sin commit de producto, merge o promoción.

Avance D4 backend/Wails ISA-104:

- Nuevo bridge app correlacionado y montaje mínimo en `cmd/vantare`; sustituye
  el evento heredado que copiaba inmediatamente.
- Operaciones cerradas: `prepare`, `sessions.list` y `sessions.inspect`.
  Respuestas conservan `requestId`; errores solo publican operación+código
  allowlisted, nunca `err.Error`, rutas, SessionRef o nombres SQLite.
- Catálogo compuesto con SQLite privado únicamente para lectura sobre una raíz
  derivada de configuración. `cfgDir` vacío devuelve `unavailable` y no crea
  un fallback en el directorio de trabajo.
- Raw capture, tap LMU, `Begin` y cualquier writer continúan sin wiring.
- Backend focal x20, app, cmd, recording/replay/SQLite, vet y diff-check PASS.
  `frontend/dist` se generó como artefacto ignorado para validar embed/cmd.
- Una sesión future/corrupt/unavailable se representa desde metadata de List;
  la UI no debe intentar inspeccionarla profundamente. Solo current+ready usa
  Inspect.
- El frontend funcional pasa 54/54 y build. El primer harness Playwright quedó
  bloqueado y dejó procesos Vite huérfanos; el orquestador interrumpió solo ese
  run, terminó sus PIDs explícitos y reanudó el worker con waits deterministas,
  timeout total <=60 s y cleanup Windows obligatorio. No se aceptan capturas
  vacías ni se oculta el fallo.
- Review backend D4 read-only activa. UI/harness todavía en progreso. Sin
  commit de producto, merge o promoción.

Cierre inicial D4 frontend e inicio de correcciones backend ISA-104:

- El panel aislado de Ajustes ya cubre conexión, sesiones locales, detalle
  metadata-only, paquete sanitizado, hash, tamaño y preview exacta. La UI
  consume únicamente DTOs cerrados y conserva SQLite, rutas e IDs internos
  detrás del bridge.
- Vitest focal: 54/54 PASS. Build frontend y lint focal: PASS; el único aviso
  es el `.eslintignore` heredado. El harness Playwright pasa en wide
  1440x1000, medium 1024x900 y compact 390x844, sin overflow ni errores de
  consola. Preview, copy y download conservan exactamente los mismos bytes.
- `current+ready` invoca Inspect una vez. Future y corrupt se resuelven solo
  con metadata de List y nunca abren el histórico. Las tres capturas son no
  vacías y el puerto 5184 queda libre, sin procesos huérfanos.
- El fallo Playwright anterior era un selector exacto frágil porque el texto
  `Velocidad` compartía nodo con el indicador visual. Se sustituyó por el
  testid estable `diagnostics-field-speed`; no hubo cambio de diseño ni de
  comportamiento.
- La review backend D4 devuelve `REQUEST_CHANGES`: P1 por escape de raíz si un
  parent es junction/symlink; P2 por situar histórico dentro de `cfgDir`, P2
  porque cancelación/shutdown y un límite de concurrencia no alcanzan al
  backend, y P2 por lectura concurrente insegura del perfil al preparar el
  informe.
- Se ordenó el remedio TDD acotado: raíz canónica compartible con el futuro
  writer (LocalAppData en instalación y data portable explícita), validación
  de toda la cadena de directorios, contexto de aplicación + cancelación
  correlacionada + concurrencia limitada, y snapshot de perfil sincronizado.
  Después se repetirá review backend y del contrato frontend. Sin commit de
  producto, merge o promoción.

Corrección backend D4 ISA-104 completada y enviada a re-review:

- El bridge recibe una raíz canónica resuelta por composición. Instalación usa
  `LocalAppData/Vantare/telemetry/sessions`; portable/desarrollo usa
  `<root>/data/telemetry/sessions`. El resolver queda preparado para ser
  compartido con el futuro writer y no deriva histórico desde `cfgDir`.
- Toda la cadena de la raíz rechaza symlinks, junctions y reparse points antes
  de abrir el catálogo.
- Operaciones diagnósticas heredan el contexto de aplicación, tienen máximo
  dos ejecuciones simultáneas y cancelación correlacionada mediante
  `diagnostics:cancel`. Timeout y shutdown liberan operaciones y slots.
- `ProfileService` sincroniza sus mutaciones y entrega copias defensivas; la
  preparación concurrente del informe queda cubierta bajo race.
- App/cmd, pkg/config, Telemetry diagnostics/recording/replay/SQLite, vet y
  `git diff --check`: PASS. Race focal x5 mediante UCRT64: PASS. Frontend
  diagnostics 29/29 y cliente 8/8: PASS; build frontend: PASS.
- Re-review backend original activa. La review UI mantiene abiertos:
  cleanup seguro del runner, verificación real SHA-256, contraste AA, pt-BR,
  semántica accesible, estado current no disponible, simplificación de vistas
  y evidencia separada para current/future/corrupt. El frontend vuelve al
  implementador con esos remedios cerrados y una única pasada Playwright
  post-fix autorizada. Sin commit de producto, merge o promoción.

Cierre definitivo backend D4 ISA-104:

- La re-review descubrió una última carrera Wails: `diagnostics:cancel` podía
  llegar antes de que la petición quedase registrada y perderse.
- El bridge conserva cancelaciones tempranas por clave exacta
  requestId+operation con TTL de 30 s, máximo 64 entradas y purga lazy. No crea
  timers ni goroutines de mantenimiento. La petición consume la cancelación
  antes de slot, contexto, goroutine o acceso al catálogo y emite `canceled`
  correlacionado.
- La regresión demuestra cero llamadas al catálogo y estado
  active/pending/slots vacío; también cubre límite, duplicado, expiración,
  cancel activo y Close.
- Re-review final backend: `ACCEPT`, P0/P1/P2/P3 = 0. Reviewer focal x100,
  race UCRT64 x10, vet app y diff-check: PASS. Los gates previos app/cmd,
  pkg/config, Telemetry focal y frontend client permanecen verdes.
- Solo queda cerrar los findings UI/runner y la evidencia final D4. Sin commit
  de producto, merge o promoción.

Cierre definitivo frontend D4 ISA-104:

- El cliente recalcula SHA-256 mediante Web Crypto sobre los bytes UTF-8 y
  rechaza hash o tamaño incoherentes antes de mostrar, copiar o descargar.
  Fixture y tests usan un digest real.
- El runner lanza Vite directamente y solo termina su propio PID/árbol; un
  puerto 5184 ajeno provoca fallo sin terminar procesos de terceros.
- Contraste de labels diagnostics cumple AA, los campos comunican presencia de
  forma accesible, current no disponible explica el motivo sin Inspect y todo
  el bloque portugués usa pt-BR.
- `DiagnosticsPanel` baja de 666 a 262 líneas; conexión, sesiones, detalle y
  paquete son vistas puras pequeñas, sin managers ni abstracciones nuevas.
- Evidencia visual separada: current válido, future metadata-only, corrupt
  metadata-only, y layouts wide/medium/compact. Seis capturas revisadas sin
  overflow, solapes o truncados relevantes.
- Re-review final UI: `ACCEPT`, P0/P1/P2/P3 = 0. Vitest 64/64, build, lint
  focal, Playwright final, consola limpia, bytes exactos, diff-check y cleanup
  del puerto: PASS.
- D4 queda cerrado. Siguiente paso: D7, documentación/evidencia consolidada,
  gates globales, reviews finales y entrega de ISA-104. Sin commit de producto,
  merge o promoción.

Gates D7 y review integrada ISA-104:

- Gates integrados verdes: `gofmt`, diff-check, Telemetry Core, app y suite Go
  global serial; frontend 292 archivos/1.923 tests; build frontend; lint focal;
  Playwright wide/medium/compact; build Wails CGO=0. El lint global conserva
  33 errores heredados fuera del corte. El vet LMU normal conserva dos avisos
  heredados Win32 y el focal con `-unsafeptr=false` pasa.
- Escaneo del corte: cero secretos; las seis PNG no contienen chunks de texto
  o metadata textual; no cambian TelemetryPage, lockfiles ni dependencias; no
  existe wiring productivo de raw capture ni segunda apertura de `LMU_Data`.
- La review UI integrada detectó un P2: future/corrupt/current-unavailable
  presentaban los zero-values desconocidos de vueltas/vehículos como datos
  reales. Detectó además un P3 de contraste 4,466:1, apenas por debajo de AA.
  El implementador UI corrige ambos con guiones metadata-only, ajuste local de
  contraste, regresiones y nuevas capturas.
- La review backend integrada detectó dos P1: `NewCaptureManager` creaba la
  raíz antes de rechazar parents symlink/junction/reparse, y Diagnostics podía
  iterar Settings/Launcher compartidos mientras callers los mutaban fuera del
  lock. Detectó P3 en fixtures con identidad real y en el top-500 aplicado
  antes de ordenar/validar sesiones.
- Un worker backend separado ejecuta fixes TDD: validación pre/post de cadena y
  target intacto, snapshot profundo concurrente, fixtures sintéticas y top-K
  global acotado. ISA-104 continúa `In Progress`; no se hace commit de producto
  hasta re-review final sin P0–P3 razonables. Sin merge o promoción.

Cierre técnico y entrega ISA-104 / TC-06D:

- Las correcciones integradas cerraron rechazo pre/post de
  symlink/junction/reparse, snapshots profundos incluido `LastLaunchedAt`,
  top-K global determinista, zero-values metadata-only y contraste AA.
- Re-reviews finales backend y UI: `ACCEPT`, P0/P1/P2/P3 = 0.
- Commits: plan `8035a89`, producto `688f206`, handoff final `3b44d36`.
- Rama publicada:
  `vantareapp/isa-104-tc-06d-inspector-privacidad-y-export-diagnostico`.
- PR draft `#40` apilada sobre ISA-103; Linear ISA-104 en `In Review`.
- Gates finales: Go global serial, Telemetry/app, race focal, vet aplicable,
  292 archivos/1.923 tests frontend, build frontend/Wails, lint focal,
  Playwright wide/medium/compact, privacidad, PNG y diff-check: PASS.
- Heredado fuera de alcance: lint global 33 errores/2 warnings, dos avisos
  `unsafe.Pointer` LMU y contención Windows ocasional del test de settings.
- No hubo merge, cutover ni promoción. Siguiente dependencia: ISA-105 / TC-07A
  desde `3b44d36713213ab642f47174c1b5d8234362cac0`.

Inicio y auditoría de inventario ISA-105 / TC-07A:

- Rama/worktree:
  `vantareapp/isa-105-tc-07a-proyeccion-overlay-y-shadow-comparator`,
  `C:\tmp\vantare-isa105\vantare-v2`, base `3b44d367`.
- Plan publicado en commit `a42c0c5`; Linear ISA-105 está `In Progress`.
- Auditoría read-only cerrada después de revisar los 18 tipos, el pipeline
  legacy y Overlay Projection v1.
- Resultado: un tipo exacto, cinco parciales, once no comparables y un
  consumidor externo. Delta/Gaps siguen missing; la parrilla canónica y el
  wiring productivo no están completos.
- Hallazgos de cutover: unidad m/s etiquetada legacy como kph, vehicle name no
  equivale a driver name y el fallback mock puede anunciarse conectado.
- Creada ISA-129 / TC-07A.1 entre ISA-105 e ISA-106 para cerrar señales
  demostrables y retirar el mock conectado. No se absorbe ese refactor en el
  comparator.
- D1/D2 delegados con TDD; sin cambios en renderizadores, CSS, canvas, Wails/SSE
  ni wiring productivo. Sin merge o promoción.

ISA-105 / TC-07A — decoder y adapter D1/D2:

- Publicados de forma apilada los commits `c0048fa` (contrato endurecido) y
  `2de5165` (decoder/adapter) en la rama de ISA-105.
- Review inicial rechazó cuatro bordes reales: `sessionType` missing con
  zero-value Go, semántica propia de `controlsHistory`, identidad vacía y
  overflow al convertir m/s a km/h.
- Todos fueron cerrados con regresiones. Re-review: `APPROVE`; el P3 de fixture
  integrada también se corrigió antes del commit.
- Gates D1/D2: 38 tests focales, ESLint focal, build frontend y diff-check:
  PASS. Avisos heredados: `.eslintignore` y tamaño de chunk.
- D3 produjo una primera implementación 18/18, pero la review adversarial la
  devolvió por calidad por fila, identidad de Broadcast, dependencias
  `allOf/anyOf`, cap incorrecto de widgets, overflow del sanitizador y falta de
  contents no predeterminados. Corrección TDD en curso. Sin wiring ni
  promoción.

ISA-105 / TC-07A — cierre D3:

- Comparator y sanitizador publicados en `f2f1c3c`; contratos alineados en
  `351863d`.
- Tres ciclos de review cerraron calidad exacta por vehículo, identidad real de
  Broadcast, dependencias reales del builder, fallback
  `lapNumber ?? totalLaps`, 128 widgets contabilizados con 64 diferencias
  serializadas, overflow extremo y fixtures no predeterminadas.
- Re-review final D3: `APPROVE`, P0/P1/P2/P3 = 0.
- Gates D1–D3: 62 tests focales, ESLint focal, build frontend y diff-check:
  PASS. La suite global reproducida durante el worker conserva un único test
  heredado de drag fuera del corte.
- D4 harness diagnóstico explícito delegado. Sigue prohibido cualquier wiring
  productivo, cambio de renderer/CSS/canvas o promoción.

ISA-105 / TC-07A — cierre D4:

- Harness explícito publicado en `714e45b`; no entra en navegación ni en el
  artefacto productivo.
- Cinco escenarios recorren el comparator real; wide/medium/compact no muestran
  consola, page errors, overflow, canarios, payload, IDs ni falsa conexión LMU.
- Prueba adversarial del puerto ocupado preservó el proceso ajeno; el teardown
  normal cerró únicamente su Vite y liberó el puerto 5185.
- Review D4: `APPROVE`, P0/P1/P2/P3 = 0. Gates: 7 tests de componente,
  Playwright 3×5, lint focal, build y diff-check: PASS.
- D5 evidencia y gates globales en ejecución. Sin wiring ni promoción.

ISA-105 / TC-07A — cierre D5:

- Evidencia y documentación publicadas hasta `f2a1ac3`.
- `coverage.json` deriva del registro/políticas reales: 18/18, con un exacto,
  cinco parciales, once no comparables y un externo.
- `report.json` deriva del comparator real: 2 widgets, 31 campos, 19 iguales y
  12 diferencias; sin PII, canarios, rutas ni payload raw.
- Capturas wide/medium/compact e índice SHA-256 reproducibles. Review
  independiente: `APPROVE`, P0/P1/P2/P3 = 0.
- Gates: Go telemetry/app PASS; frontend 297 archivos/1.993 tests PASS; build y
  Playwright PASS; alcance, privacidad y teardown PASS.
- Visual Crystal conserva el fallo 100 % reproducido en la base exacta; los
  tres Original quedan en 0 %. Benchmark canvas incumple en ISA-105 y base.
  No se actualizaron baselines ni se tocó canvas/renderers.
- D6 review adversarial del delta completo en ejecución. Sin merge, promoción
  ni cutover.

ISA-105 / TC-07A — primera review D6:

- Veredicto `REQUEST CHANGES`: P0=0, P1=0, P2=4, P3=1.
- P2: el cap de 64 entradas podía consumir igualdad y ocultar todos los paths
  mismatch; `pitStopCount` se exponía sin consumidor; varios `sourcePaths`
  explicaban dependencias incorrectas; el handoff de producto seguía
  describiendo ISA-105 como pendiente.
- P3: el plan enlazaba un nombre inexistente para ADR 0004.
- Corrección delegada con TDD para los tres hallazgos de código; documentos y
  continuidad se corrigen en ambos handoffs. Re-review obligatoria antes de PR
  o transición de Linear. Sin merge, promoción ni cutover.

ISA-105 / TC-07A — cierre D6 y entrega:

- Los cuatro P2 y el P3 iniciales quedaron cerrados con TDD: diferencias
  priorizadas bajo cap 64, muestra no-mismatch separada, `pitStopCount`
  retirado, sourcePaths reales y procedencia estructural de
  `vehicles[].id`/`playerVehicleId`.
- TDD final 77/77; suite frontend final 297 archivos/2.000 tests; build,
  Playwright, privacidad, hashes, determinismo, teardown y diff-check PASS.
- Evidencia final: 18/18 tipos; escenario Pedals+Standings con 31 campos,
  19 iguales y 12 diferencias; tres capturas byte-idénticas.
- Re-review D6 final: `ACCEPT`, P0/P1/P2/P3 = 0.
- Entrega: HEAD `c9acee2`, push sincronizado, PR draft `#41` contra la rama
  final ISA-104 y Linear ISA-105 `In Review`.
- Sin merge, promoción, cutover, wiring productivo, baseline regenerado ni
  cambio de CSS/canvas/renderers. Siguiente acción: ISA-129 antes de ISA-106.

## Bloqueos operativos actuales

### 2026-07-31 — ISA-129 / TC-07A.1, auditoría de fallback sintético

- Rama:
  `vantareapp/isa-129-tc-07a1-senales-canonicas-overlay-y-retirada-del-mock`.
- Base exacta: ISA-105 `c9acee24cf4c4d80922b380b12f7367c2a60c937`.
- Worktree: `C:\tmp\vantare-isa129\vantare-v2`.
- Linear: `In Progress`; sin promoción.
- Auditoría read-only: `ACCEPT` como inventario y `NO-GO` para cutover.
- P0: el ejecutable productivo usa `createMockSource()` cuando LMU no está
  disponible; `BuildSyntheticBuffer()` termina como `Connected=true` y llega
  a Desktop/Studio por Wails y a OBS por SSE.
- P0: falta el bridge productivo `lmu.Observation → core.Batch`; los replays
  actuales fabrican batches y no validan el driver.
- P0: el driver modular publica únicamente al jugador y no ofrece parrilla ni
  identidad estable multivehículo.
- P1 separado: Engineer arranca conectado al simulador y no consume todavía
  el runtime LMU compartido. Se conserva como bloqueo de su corte.
- Fragilidad adicional: `fusion.Merge(nil, ...)` puede conceder conexión y el
  coordinador frontend importa un fixture mock para su estado desconectado.
- Excepciones preservadas: preview Mock seleccionada, harnesses, fixtures,
  replay y CLIs de diagnóstico explícitos.
- Checks de auditoría:
  `go test ./internal/app ./internal/server ./internal/engineer/service` PASS.
- Segundo inventario read-only: driver LMU, catálogo, core, derive, overlay
  projection, delta, gap y fusion PASS; diff-check PASS. Frontend no ejecutado
  por dependencias ausentes en el worktree de auditoría.
- P2: `InPit` no se degrada con `withFreshness`; el historial de controles no
  contiene timestamp individual por muestra.
- Evidencia: fixtures SHM reales sanitizados de menú y pista/44 vehículos;
  REST modular y replays canónicos todavía son sintéticos o construidos a
  mano. VE, daños, compuesto y clima sin fuente probada siguen missing.
- Compatibilidad observada: proceso LMU `1.4.0.0`, mapping `LMU_Data` de
  324820 bytes; el driver canónico solo admite 1.3.0.0 y todavía no publica.
- Siguiente acción: cerrar auditoría de señales, redactar/revisar el plan TDD y
  ejecutar microcortes sin CSS, canvas, renderer, baseline ni cutover.

### 2026-07-31 — ISA-129, primera review del plan

- Veredicto: `REQUEST CHANGES`, P0=0, P1=2, P2=4, P3=0.
- P1: matriz de evidencia por señal ausente; no se autoriza schema/código.
- P1: reglas EventID/SessionID/epoch ambiguas ante menú, pista, reconnect,
  reset y cambio de jugador.
- P2: dependencia circular entre allowlist 1.4, sanitizer y captura.
- P2: pit/reconnect eran obligatorios en replay pero opcionales al cierre.
- P2: política Overlay v1 no definía productores/consumidores old/new.
- P2: corregir comandos gofmt/fuzz para que sean ejecutables literalmente.
- Acción: corregir el plan y repetir review antes de D1. Sin código de
  comportamiento, commit de producto, merge, promoción ni cutover.

### 2026-07-31 — ISA-129, segunda review del plan

- Veredicto: `REQUEST CHANGES`, P0=0, P1=2, P2=1, P3=1.
- Cerrados los seis hallazgos de la primera review.
- P1: falta matriz de autoridad/fusión por señal SHM/REST y regresiones de
  fresh/stale/conflicto/cero.
- P1: Delta carece de una captura real sanitizada de vuelta completa que
  demuestre referencia y signo.
- P2: D3 debe mapear señales a IDs existentes/nuevos/tombstone y prohibir
  duplicados semánticos; piloto y combustible requieren decisión explícita.
- P3: numeración y rollback ambiguos tras separar D4A/D4B.
- Base `c9acee24`, rama y fixture real de 44 vehículos verificados por review.
- Acción: corregir los cuatro hallazgos y repetir review antes de D0/D1. Sin
  código, commit de producto, merge, promoción ni cutover.

### 2026-07-31 — ISA-129, tercera review del plan

- Veredicto: `APPROVE`, P0=0, P1=0, P2=0, P3=0.
- Cerrados los cuatro findings de la segunda review.
- §1.5 fija autoridad SHM/REST por señal, scope, TTL, equivalencia,
  fresh/stale/conflicto y cero/false.
- D6/D9 obligan a capturar una traza real LMU 1.4 sanitizada/hash-pinned con
  vuelta completa de referencia y vuelta comparable; sin ella no se cierra
  ISA-129 ni se avanza ISA-106.
- D3 reutiliza/endurece IDs existentes y prohíbe aliases semánticos.
- Once commits D0–D9 con D4A/D4B y rollback inverso exacto.
- Plan global aprobado contra Linear/AGENTS; siguiente acción D0 documental.
- Sin código de comportamiento, merge, promoción ni cutover.

### 2026-07-31 — ISA-129 D0 implementado y aceptado

- Alcance exacto: plan ISA-129, nueva procedencia LMU/Overlay, matriz shadow y
  `docs/current-plan.md`.
- Documentadas admisión, autoridad SHM/REST, hashes 1.3, LMU 1.4 pendiente,
  P0 mock/bridge/grid y señales que permanecen missing.
- Baseline anterior/posterior, Telemetry focal, app/server, hashes de fixtures
  y diff-check PASS.
- Review independiente final: `ACCEPT`, P0/P1/P2/P3 = 0. La corrección final
  fija la correlación activa `[0,mNumVehicles)`, IDs no negativos/únicos y
  biyectivos, jugador por `mIsPlayer` + ID telemetry activa, y el máximo
  exacto de `mLapDist`.
- Commit de producto: `6acb352`; push sincronizado. Sin PR, merge, promoción
  ni cutover. D1 queda desbloqueado; LMU 1.4 y los gates físicos siguen
  bloqueados hasta sus microcortes y evidencia obligatoria.
- Siguiente acción: iniciar D1 sobre la base `6acb352`; no modificar CSS,
  canvas, renderizadores, baselines ni wiring de otros productos.

### 2026-07-31 — ISA-129 D1 implementado y aceptado

- Base: D0 `6acb352` más el estado documental `efcdddc`; rama
  `vantareapp/isa-129-tc-07a1-senales-canonicas-overlay-y-retirada-del-mock`.
- Alcance exacto: 13 rutas del plan D1; mock conectado retirado de producción,
  fuente LMU real retenida para attach tardío, REST-only no conecta y
  Wails/SSE/frontend parten desconectados. Preview Mock, harnesses y CLIs
  diagnósticos permanecen intactos.
- RED contra HEAD confirmado para manager, fusion, transporte y snapshot
  frontend; GREEN focal confirmado después de la implementación.
- Review independiente final: `ACCEPT`, P0/P1/P2/P3 = 0.
- Checks: Go focal y completo PASS, frontend 2001/2001 PASS, build PASS,
  `gofmt` y `git diff --check` PASS, guard estático sin builders sintéticos.
  `-race` omitido por CGO desactivado; lint global conserva deuda heredada sin
  errores nuevos en archivos tocados.
- Commit de producto `470d6a6`; documentación de cierre `f4988e0`; push
  sincronizado. Sin PR, merge, promoción ni cutover.
- Siguiente acción: D2 sobre `f4988e0`; no iniciar D3 hasta review D2.

### 2026-07-31 — ISA-129 D2 implementado y aceptado

- Base: D1 `470d6a6` más documentación `f4988e0`; rama ISA-129 sin promoción.
- Alcance exacto: `internal/telemetry/drivers/lmu/layout.go`, su suite y la
  procedencia LMU. Contrato LMU 1.3 con 35 campos, offsets/strides/tipos
  Windows explícitos, bounds, no-solape, exclusiones y máximo de 104 filas.
- Fixtures reales hash-pinned de 324820 bytes verificados; no se habilita LMU
  1.4 ni se importan generadores, módulo legacy o Python externo.
- RED estructural y GREEN focal reproducidos. Review independiente final:
  `ACCEPT`, P0/P1/P2/P3 = 0.
- Checks: driver `-count=20`, suite `internal/telemetry/...`, gofmt y
  `git diff --check` PASS. La suite global reproduce únicamente el P3
  intermitente heredado de Windows en `app-settings.json.tmp`.
- Commit de producto `e2c92fd`; documentación de cierre `b12176d`; push
  sincronizado. Sin PR, merge, promoción ni cutover.
- Siguiente acción: D3 sobre `b12176d`; no iniciar D4A hasta review D3.

### 2026-07-31 — ISA-129 D3 implementado y aceptado

- Base: D2 `e2c92fd` más documentación `b12176d`; rama ISA-129 sin promoción.
- Alcance exacto: 11 rutas de schema/catalog/docs. IDs 1–24 permanecen
  estables y 25–43 se añaden en el orden contractual; aliases semánticos de
  conductor/combustible se rechazan, y unidades, rangos, ceros y enums quedan
  validados. Markdown golden coincide con el ledger Go.
- RED estructural y GREEN reproducidos. Review independiente final:
  `ACCEPT`, P0/P1/P2/P3 = 0.
- Checks: catalog/schema x20, suite `internal/telemetry/...`, gofmt y
  `git diff --check` PASS; alcance exacto 11/11. Sin D4A.
- Commit de producto `462f0ee`; documentación de cierre `fa7bab0`; push
  sincronizado. Sin PR, merge, promoción ni cutover.
- Siguiente acción: D4A sobre `fa7bab0`; no iniciar D4B hasta review D4A.

- Linear está disponible. ISA-104 está sincronizada en `In Review`; cualquier
  transición posterior debe reflejarse tanto aquí como en la issue.
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
