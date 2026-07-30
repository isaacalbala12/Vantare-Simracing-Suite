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
| Telemetry Core | TC-06C / ISA-103 | `C:\tmp\vantare-isa103\vantare-v2\vantare-v2` sobre TC-06B `8683f03` | implementación iniciada; Linear pendiente; sin promoción |

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

## Bloqueos operativos actuales

- Linear volvió a estar disponible. ISA-41 ya está sincronizada en `In Review`
  e ISA-101 está `In Progress`; cualquier transición posterior debe reflejarse
  tanto aquí como en la issue.
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
