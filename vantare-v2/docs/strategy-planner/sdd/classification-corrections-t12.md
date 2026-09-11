# T12 — microplan de evolución: correcciones tipadas de clasificación

ISA-1104, hija de #1091 y #1033; continúa #1099 (capacidad y banco T11 PASS;
T11i visual/nativo pendiente, sin certificar recorrido/capturas).
SDD R08/R07, aceptación A08/A09. Continúa ADR 0010 y
[corrections-contract-v1](../corrections-contract-v1.md) operación 2
`set_classification` (implementación parcial descrita aquí); no crea otra custodia,
lector, formato, motor ni dependencia. Este documento fija el contrato
implementable y los microcortes. A–G3 y Ha/Hb/Hc/Hc2/Hd/I/J1/J2/J3 están implementados
y revisados localmente; I pasó Imola/Monza, J1/J2/J3 pasaron global/vet.
J3 guardado en 4d5c3178; J4 en d9dc43c8 aplica/proyecta v4 con global/vet
PASS. J5 resuelve catálogo en c9f85a9f, global/vet PASS; J6 conecta comandos
nativos, todavía sin montaje de la instancia en Wails.
Estos cortes no cierran T12 ni los gates visual/nativo/empírico.

## 1. Conjunto cerrado de campos y tipos

Solo estos campos de la clasificación nativa admiten corrección:

| Campo | Tipo | Valores |
|---|---|---|
| `SessionType` | enum | `practice`, `qualify`, `race` (cerrado; otro valor se rechaza) |
| `WeatherConditions` | etiqueta opaca | texto recortado no vacío, máx. 64 caracteres; sin lista canónica (LMU varía); NO es señal física |
| `TrackName`, `TrackLayout`, `CarName`, `CarClass` | texto + referencia canónica resuelta por el servidor (§5) | no vacíos; contrato cerrado por root, implementación posterior a I |

No admiten corrección: `SessionID`, `Status`/`Families` (derivados),
`SimID` (fijo `lmu`), hashes, parser, reloj, unidades ni canales. La
procedencia de cada decisión es manual con motivo obligatorio; corregir la
clasificación no declara una medición física verificada ni concede autorización.

## 2. Precondición original, presencia, calidad y ausencia

La precondición se verifica por campo y operación, no global: solo el campo
corregido debe existir en `HistoricalMetadata` con `Present=true`,
`Sensitive=false`, `Redacted=false`, `Quality==QualityValid` y valor no vacío,
sin duplicados (las mismas puertas de `classificationMetadata`, aplicadas a esa
clave). No se exige que los otros cinco metadatos ni `ClassifyHistoricalSession`
completo sean válidos para corregir un campo existente válido mientras otro
falta: lo no corregido conserva su ausencia y la derivación que lo necesite
continúa bloqueada con causa. La base exacta es `SourceAnalysisRef`: se
verifican ambos digests, la base de la petición contra la vigente (mismo
SessionID con otro hash/tamaño → fuente cambiada; otro parser/schema/
análisis/segmentación → interpretación cambiada) y la sesión contra la base
(ID, versión de schema, parser, huella de schema y fuente LMU). Validar un campo no declara el éxito de una
clasificación global parcial. El valor esperado debe coincidir con ese
original; si difiere → `original_mismatch`, sin escritura parcial.

Tipos desconocidos o calidad ausente: la operación correspondiente se bloquea
con causa precisa (`unknown_session_type`, `unusable <Campo>`); no hay
fallbacks que inventen o adivinen valores. Desconocido sigue desconocido
(R10/A09). La corrección no crea metadatos ausentes ni reparaparsers/relojes.

## 3. Límites y cuota combinada

Las decisiones de clasificación cuentan dentro del presupuesto conjunto
existente: 256 operaciones por snapshot, 256 revisiones y 8 MiB por documento,
sin aumento ni truncado. Dos decisiones activas sobre el mismo campo con
solape se rechazan como `overlapping_corrections`; sustituir exige una revisión
cuyo snapshot retire la anterior y añada la nueva (sin precedencia implícita).
El conjunto familiar explícitamente vacío de T11 y el conjunto de
clasificación explícitamente vacío son independientes: omitir uno en un
comando legacy no borra el otro.

## 4. Custodia, digest, Save/Resolve y compatibilidad

Mismo store/lease/backup por base de Analysis (`corrections/<baseDigest>.json`,
lease nativo, backup validado y cuarentena). Nueva representación
`analysis.mixed-snapshot.v3`: escalares + decisiones familiares (v2) +
decisiones de clasificación ordenadas, con digest conjunto que incluye los
tres grupos. Lectura valida v1, v2 y v3 y recalcula cada digest; v1 escalar y
v2 mixto-T11 siguen legibles sin reescribir historia. Un snapshot v3 que retire
todas las decisiones no escalares puede volver a v1/v2 según corresponda; el
padre se conserva. El guard de clientes viejos se extiende: una petición que
omite familias o clasificación no puede eliminar lo que desconoce; replay
exacto mantiene prioridad y devuelve revisión histórica + cabeza actual.

Save/Resolve comparten el mismo digest semántico v3: `expectedRevision`,
`commandId` idempotente (mismo payload → misma revisión; distinto payload →
conflicto), validación completa del snapshot antes de persistir, atomicidad sin
parciales, `revision_conflict` con cabeza actual, restauración como revisión
nueva. Las decisiones de clasificación no pueden desaparecer del payload usado
para resolver un guardado incierto.

Compatibilidad y rollback: el lector actual abre v1/v2/v3; un binario anterior
sin v3 NO puede abrir con seguridad esa misma custodia. El mecanismo antiguo de
recuperación podría considerar desconocido el snapshot, poner el primario en
cuarentena y recuperar un backup v1/v2. Retirar decisiones y crear una cabeza
v1/v2 no elimina las revisiones v3 del historial ni lo hace compatible hacia atrás.
Para volver a un binario anterior, conservar íntegra y sin escrituras la custodia
actual (primario, backup y cuarentenas), y ejecutar el binario antiguo con un
perfil/`CorrectionRoot` aislado que no contenga v3. No convertir ni sobrescribir
el historial para simular compatibilidad. Al recuperar la versión actual se
reabre la custodia preservada. Antes de cualquier rollback real, verificar rutas,
configuración y cierre de instancias propias; aquí no se mueve ni copia dato alguno.

## 5. Referencia canónica y cambio de combinación

Contrato cerrado por el orquestador para la continuación de T12; pendiente de
implementación. Complementa ADR 0010 mediante ADR 0011. Conserva owners,
lector, catálogo, custodia y tres grupos existentes. No amplía el simulador.

La identidad de combinación procede del catálogo de sesiones autorizado
existente de Analysis: SessionCatalog.ListSessionCombinations, sobre
ListAuthorizedSessions/ListAuthorizedSessionCombinations. Preparar la fuente
abierta con ClassifyHistoricalSession produce SU identidad; no es una consulta
al catálogo ni prueba de que una identidad propuesta esté autorizada.

### Referencia resuelta por Analysis

Cada petición TrackName/TrackLayout/CarName/CarClass incorpora
`canonicalCombinationId`, obligatorio, de formato lmu:sha256 y presente en
el catálogo existente. Todas las decisiones de identidad activas comparten
el mismo ID. SessionType y WeatherConditions lo prohíben; clientes anteriores
lo omiten. El cliente no envía un tuple canónico alternativo ni calcula hashes.
Analysis resuelve el ID a una CombinationIdentity del catálogo autorizado.

Se añade una consulta específica en el mismo SessionCatalog. Catálogo/source
nulo produce causa tipada de indisponibilidad; catálogo disponible sin ese
ID produce unknown_combination; errores de lectura y cancelación se propagan.
No se crea catálogo vacío de respaldo para autorizar un ID inventado.
El catálogo conserva su modelo autorizado ya cargado: esta consulta no
demuestra una nueva lectura física de cada DuckDB del catálogo.

El composition root inicializa strategyTelemetrySources una sola vez y
comparte el mismo SessionCatalog entre Analysis y Strategy. Analysis y su
frontera de licencia siguen creados antes de que Strategy consuma revisiones.
La consulta del target se realiza exclusivamente para una escritura nueva,
dentro del lease existente y DESPUÉS del replay, conflicto de cabeza y cuota.
ObservationCorrectionInput acepta un callback nativo acotado con contexto;
CorrectionStore no posee catálogo ni nueva fuente. Replay/Resolve no consultan
el catálogo: devolver el comando ya guardado conserva prioridad aunque la
entrada de destino haya desaparecido. La autorización de la fuente abierta
y su base exacta siguen siendo obligatorias en toda operación.

### Coherencia sin fabricar metadatos

El campo corregido debe superar todas las puertas por campo de §2;
ExpectedOriginal es RAW byte a byte. Replacement conserva el límite bruto
existente de 1024 bytes UTF-8 y, tras strings.TrimSpace, debe ser exactamente
el valor de ese campo en el target resuelto. No se aceptan nombres libres.
Las identidades existentes usan longitudes en bytes + texto recortado exacto:
NO se pasan a minúsculas ni se equiparan mayúsculas. El ID lo calcula sólo Go.

Cada campo de identidad no corregido que sea utilizable debe coincidir con
el target después del mismo recorte, o el conjunto propuesto es incoherente
y se rechaza atómicamente. Un campo no corregido ausente, inválido, duplicado
o privado permanece tal cual; no se completa desde el target y no bloquea
corregir otro campo válido. Sí mantiene bloqueada cualquier proyección que
requiera clasificar la combinación completa. Cuando los cuatro son utilizables,
la identidad efectiva completa debe producir exactamente el ID resuelto.
Las operaciones sólo cambian los campos explícitos sobre una copia separada.

El catálogo puede reflejar nombres de equipo/livery grabados como CarName.
Resolver una combinación no crea un modelo físico de coche ni deduce
equivalencias entre equipos. No renombrar ni agrupar esas identidades por
intuición o por compartir categoría.

### Snapshot v4 y compatibilidad

PreparedSampleCorrectionSnapshot añade canonicalCombination opcional con
la CombinationIdentity resuelta, omitida si no hay decisiones de identidad.
Una revisión con identidad activa emite analysis.mixed-snapshot.v4; continúa
conteniendo exactamente los tres grupos existentes, con la misma cuota.
El digest v4 cubre target, base, decisiones, precondiciones, motivo y origen.
El comando de identidad usa dominio v4 con la referencia explícita.
Sin identidad activa se conservan EXACTAMENTE bytes y digests v1/v2/v3.

El decoder rechaza target en formatos viejos, v4 sin identidad/target,
IDs divergentes, campo/valor que no pertenece al target y cambios de digest.
La validación guardada demuestra consistencia, no autenticación contra una
falsificación local totalmente coherente. Load/historial conservan el target
guardado; aplicar y proyectar revalidan contra la fuente actual autorizada,
sin consultar el catálogo actual para reinterpretar una decisión histórica.
Retirar identidad vuelve a v1/v2/v3 según los grupos activos, conservando
la cadena v4. Los binarios sin v4 requieren CorrectionRoot aislado al volver
atrás: no abrir esa misma custodia ni reconstruir artificialmente su historia.

### UI y revisión del plan

La inspección debe permitir abrir una fuente de combinación distinta sin
seleccionarla ni adoptarla. Datos conserva A4 y ofrece el catálogo ya disponible
para elegir destino; si falta catálogo, mantiene correcciones no identitarias
y muestra la causa. No añade un lector, catálogo frontend o valor canónico libre.
La selección prepara de forma atómica los campos de identidad utilizables que
difieren del target, con referencia y motivo comunes; los no disponibles
siguen visibles con causa. Conserva los grupos escalares/familiares y las
otras clasificaciones, y permite retirar la identidad como conjunto coherente.

La identidad efectiva proyectada no reemplaza la metadata/base original del
handle. Una revisión de otra combinación no cambia ni recalcula el plan.
El plan conserva su referencia anterior exacta (R16). El usuario debe escoger
expresamente la nueva combinación y volver a seleccionar/adoptar esa revisión
en un borrador compatible. Head nueva, Save y Project no equivalen a adopción.
SessionType/WeatherConditions conservan la combinación.

### Secuencia de ejecución

Primero banco I de los dos campos entregados. Luego preparación pura de
identidad, snapshot/decoder v4, custodia/replay, vista/proyección, consulta de
catálogo y montaje nativo, contratos/cliente, controlador y UI. Cada microcorte
declara como máximo cinco paths antes de editar y se revisa personalmente;
ningún ejecutor decide este contrato ni amplía el siguiente corte por su cuenta.
Los tests deben probar: origen exacto, target desconocido/no disponible, set
incoherente y parcial, igualdad de bytes v1/v2/v3, replay con target retirado,
cuota/guard de clientes antiguos, reapertura, privacidad y no adopción implícita.
Paridad visual, Wails y precisión empírica mantienen sus gates separados.

## 6. Consumo, derivación y permisos

Analysis aplica las decisiones sobre una vista separada de páginas/segmentación
base; catálogo observado y archivos intactos. Se recalculan únicamente familias
afectadas y dependientes mediante las funciones existentes (p. ej.
`observed_strategy` al pasar a `race`); la etiqueta climática corregida solo
alimenta la proyección de clasificación (§7) y no promete ningún recálculo
físico de `climate_buckets`. La clave de cada derivado incluye
fuente, parser/análisis, revisión y versión de criterio. `set_classification`
no cambia hash, autorización, origen temporal, parser, reloj ni unidades; la
base se revalida igual que en T11 y cada operación reatraviesa
`withCorrectionInput` (autorización + bloqueo + reintento idempotente).

## 7. Clima separado de señales físicas y de #1030

`WeatherConditions` corregida es una etiqueta opaca de clasificación: vive en
`internal/telemetryanalysis/classification.go:80,125` (campo `ClassifiedSession`
desde el metadato `weatherconditions`) y solo alimenta la proyección
clasificatoria en `internal/telemetryanalysis/projectionproducer.go:219,238`
(`SessionClassificationFamily.WeatherConditions` vía `singleWeatherCondition`).
Los buckets físicos por vuelta NO cuelgan de esa etiqueta: se cuentan desde las
señales de consumo en `internal/telemetryanalysis/sessioncatalog.go:228-236`
(`climateBucketCounts` lee `consumption.Laps[].ClimateBucket`). Por eso no se
promete recomputar buckets físicos ante una nueva etiqueta: no hay consumidor
demostrado que derive métricas físicas de la etiqueta, y los criterios
empíricos de #1030 quedan intactos. La corrección no sustituye ni crea señales
físicas de temperatura/humedad de los canales, no fija umbrales y no toca #1030.
Si una familia necesita canales/relojes/unidades ausentes, permanece no
calculable con causa. La inspección distingue etiqueta climática de
disponibilidad de señal.

## 8. Microcortes de ejecución (máx. 5 paths lógica/tests cada uno)

- **T12a — preparación pura + tests (2 paths).** `internal/telemetryanalysis/classification_corrections.go`:
  tipos `ClassificationCorrection` (base `SourceAnalysisRef` exacta, campo
  cerrado solo `SessionType` + `WeatherConditions`, original esperado,
  reemplazo, motivo, procedencia manual) y `PreparedClassificationCorrection`
  (`BaseID`/`CorrectionID`/petición/original/corregido, patrón
  `PreparedSampleCorrection`);   `PrepareClassificationCorrection[Set]`
  verifican ambos digests, base de la petición contra la vigente y sesión
  contra la base (ID, parser, schema, fuente LMU), precondición exacta por
  campo byte a byte sin recortes (el original se preserva; el esperado
  recortado no cuela), enum cerrado y etiqueta de 64 caracteres Unicode sin
  controles; el reemplazo en bruto se acota (1024) antes de normalizar y el
  UTF-8 inválido se rechaza en original/esperado/motivo/reemplazo; el conjunto
  valida base, sesión y cuota antes de preparar nada;
  reusa errores existentes (`SourceChanged`, `InterpretationChanged`,
  `Precondition`, `Value`, `Invalid`, `Target`, `OverlappingCorrections`,
  puertas de `classificationMetadata`, `parseSessionType`), sin familia
  paralela; sin store/wire/UI/v3 ni catálogo/manager.
  `classification_corrections_test.go`: base exacta (hash/tamaño/parser/
  schema/análisis/segmentación/sesión), gates de petición y metadato,
  límites unicode de clima, atomicidad del conjunto, inmutabilidad y campo
  válido con otro metadato ausente (sin afirmar éxito global parcial).
  Gates: focal + global Go `-p 1` + vet de alcance. Los errores e IDs de
  combinación (`unknown_combination`, ID inventado) quedan para el corte que
  cierre el contrato de resolución (§5).
- **T12b1 — representación snapshot v3 + preparación almacenada + tests (2 paths).**
  `correction_snapshot.go` + `correction_snapshot_test.go` (v3: escalares +
  familias + decisiones de clasificación ordenadas con la preparación de
  T12a, digest conjunto, orden canónico, golden v1/v2 y representación v3,
  cuota conjunta; decoder/guard legacy pertenecen a B2). Vacío canónico en v3: grupos ausentes son nil
  (misma digest viva/almacenada y JSON roundtrip directo sin reparación;
  v1/v2 intactos). Gates: focales + global Go `-p 1` + vet.
- **T12b2 — decoder, store y digests + tests (4 paths).**
  `corrections_document.go` + `corrections_document_test.go` (nuevo;
  decode/encode v3 y validación) + `corrections_store.go` +
  `corrections_store_test.go` (persistencia v3, revalidación de digests,
  8 MiB, restauración). El decoder REQUIERE edición para v3: revisarlo sin
  tocarlo no basta. Gates: focales + global Go `-p 1` + vet de alcance.
- **T12c1 — vista mixta pura (2 paths).**
  `internal/telemetryanalysis/corrections_view.go` + `corrections_view_test.go`.
  Aplicar los tres grupos de una revisión exacta sobre páginas y metadatos
  separados; exponer metadatos efectivos y decisiones preparadas en la vista
  existente, sin duplicar todo `HistoricalSession`. Reusar aplicación escalar/
  familiar y T12a contra la sesión ORIGINAL, verificar cuota y snapshot v3
  completo antes de devolver resultado. Cambiar sólo `Value` del campo válido;
  calidad, presencia, base, parser, reloj, unidades y fuente permanecen intactos.
  Preservar APIs y comportamiento v1/v2. Tests: mezcla y sólo clasificación,
  inmutabilidad incluyendo escritura posterior sobre la vista, campo válido con
  otro ausente, rechazo atómico por base/precondición/calidad/duplicados/cuota/
  preparación o digest adulterados. Sin store, derivación, servicios ni TS.
- **T12c2 — derivación y proyección (4 paths).**
  `internal/telemetryanalysis/corrections_derivation.go` + su test y
  `corrections_projection.go` + su test. Pasar la clasificación efectiva a los
  consumidores existentes y a `CorrectedSessionDerivations.Classified`, que
  `DeriveProjectionSession` devuelve conservando revisión exacta. Analysis
  conserva la autoridad del gate de vueltas completas/familias; no duplicar el
  clasificador ni reconstruir `HistoricalLap` para cambiar ese gate: reusar
  `familyUsability` con el booleano de vuelta completa de `validity.Laps`.
  El cambio a carrera modifica la elegibilidad preliminar de
  `observed_strategy`; este recorrido no llama a `DeriveObservedStrategy` ni
  añade esa familia física a la proyección y no se anuncia que lo haga. Etiqueta
  climática separada de buckets físicos (§7). Sin clasificación activa,
  preservar el contrato existente y sus fixtures; ausencia requerida sigue
  bloqueando la derivación. Tests de clasificación efectiva en proyección
  pública, sin alteración de buckets/consumo/curvas/paradas por una etiqueta,
  historial exacto tras avanzar cabeza/reabrir, tres grupos juntos y gate de
  vuelta completa sin promover señales ausentes. Cambio de combinación NO pertenece a C1/C2:
  estos campos no están implementados y su contrato se cierra en §5 antes de
  asignar el corte correspondiente. Gates C1/C2: focales, review personal,
  global Go `-p 1` y vet de alcance antes de aceptar cada corte.
- **T12d1 — comandos nativos (2 paths).**
  `internal/app/telemetry_analysis_correction_commands.go` +
  `telemetry_analysis_correction_commands_test.go` (Save/Resolve aceptan
  decisiones de clasificación, reusan `withCorrectionInput`: autorización +
  bloqueo + reintento idempotente). Cuota conjunta de tres grupos; clasificación
  no nil exige FamilyUses explícito (vacío cuando no haya decisiones), sin
  convertir un grupo desconocido en vacío. Clientes anteriores conservan su
  contrato. Clasificación inválida se presenta como petición inválida, simulador
  no compatible como incompatible; nunca como fallo de custodia ni con detalle
  privado. La proyección nativa debe conservar la
  clasificación efectiva de Analysis: `deriveCorrectionSession` ya no la
  sobrescribe con metadatos originales. Regresión reproducida y corregida,
  con pruebas de tipo/clima, agregación de sesiones, revisión antigua tras
  avanzar cabeza y reabrir custodia, replay, guard legacy/T11 y autorización.
- **T12d2 — compatibilidad de inspección mixta (2 paths; ejecutar antes de D1).**
  `internal/telemetryanalysis/corrections_inspection.go` + su test. Reusar
  `ApplyMixedCorrectionSnapshot` en `InspectCorrectionLaps`: el consumidor
  anterior llamaba ApplyObservation y rechazaba v3. Regresión RED antes del cambio,
  luego class-only y tres grupos, snapshot exacto, páginas/targets/capacidades
  intactos, rechazo atómico ante adulteración y metadato corregido inválido.
  Otro metadato requerido ausente no impide inspeccionar un campo válido;
  no exigir clasificación global ni recalcular señales por una etiqueta.
  No hace falta nueva consulta: reusar metadatos de la sesión abierta y revisión
  cargada, sin otro lector/custodia ni duplicación para UI.
  Gates D1/D2: focales + global Go `-p 1` + vet de alcance.
- **T12e — contrato TS (2 paths).**
  `frontend/src/strategy/analysis-contract.ts` + `analysis-contract.test.ts`
  extienden la representación existente con petición/preparación tipadas de
  `SessionType` y `WeatherConditions`, versión `analysis.mixed-snapshot.v3`
  y grupo opcional de clasificaciones. No inventar una operación wire distinta
  a los structs de Go. v3 exige clasificaciones activas; v1 no lleva grupos
  no escalares y v2 exige familias activas sin clasificaciones. Cuota total 256
  de los tres grupos antes de recorrer elementos; la revisión inicial vacía
  no puede contener clasificaciones. Conservar v1/v2 y ausencias sin reescribir.

  Validar forma de IDs, base exacta, campos cerrados, procedencia manual,
  duplicados por campo, original esperado idéntico y valor corregido acorde
  con Go. El cliente valida el contrato; no computa hashes ni certifica
  autorización/calidad viva que no viene en el snapshot. Mantener el original
  y la petición byte a byte. Original/esperado no adquieren un límite nuevo
  ausente en Go. Motivo y reemplazo bruto: UTF-8 válido, máx. 1024 bytes;
  motivo no vacío según espacios de Go; clima normalizado no vacío, máx. 64
  puntos Unicode y sin controles restantes. Rechazar sustitutos Unicode
  aislados; no sustituirlos silenciosamente al codificar. Normalización sólo
  para clasificación: Go TrimSpace (incluye U+0085, conserva U+FEFF) y enum
  cerrado con minúscula simple de Go (caso U+0130); no refactorizar todos los
  parsers. Tests de bordes Unicode, original exacto, preparación adulterada,
  base ajena, versiones, cuota 256/257 e inmutabilidad con fixtures frescos.
  Añadir comparación semántica de conjuntos para F: orden independiente,
  todos los campos de petición incluidos, sin ordenar/mutar la entrada.

  El helper existente
  `frontend/src/hub/strategy-orbit/strategy-recorded-corrections.ts` NO es el
  contrato TS: sigue siendo helper y no se cuenta como path de contrato.
  Gates: focales + typecheck real + lint, revisión personal; después suite
  frontend completa y build antes de aceptar E. Registrar logs, exit codes y
  deuda heredada separadamente; sin abrir app ni añadir dependencias.
- **T12f — cliente TS (2 paths).**
  `frontend/src/strategy/analysis-client.ts` + `analysis-client.test.ts`
  incorporan `classifications?: readonly AnalysisClassificationCorrection[]`
  al mismo `AnalysisSaveRequest`. Omisión = cliente desconocedor; `[]` = retiro
  explícito. `null` se rechaza en TS como ya sucede con familias; clasificación
  explícita exige familias explícitas. Validar forma y cuota total de los tres
  arrays antes de recorrer peticiones; reusar parsers de E con la base exacta.
  No normalizar el payload enviado ni convertir grupos omitidos en vacíos.

  Save y Resolve conservan íntegros petición, comando, señal y cancelación
  existentes. Ante revisión encontrada, comparar todos los campos de comando
  y las decisiones de clasificación mediante el comparador semántico de E:
  orden equivalente aceptado, ausencia/extra/cambio de campo, base, original,
  reemplazo, motivo o procedencia rechazados. Mantener guards familiares,
  revisionId y base existentes. Replay de comando antiguo puede devolver
  revisión antigua + cabeza actual; no exigir igualdad entre ambas ni adoptar
  cabeza. Resolver ausencia no guarda ni reintenta. El cliente sigue sin estado;
  la conservación del comando incierto en el editor corresponde a G1/G2.

  Tests de transporte: class-only/tres grupos, retiro a v1/v2, legacy intacto,
  ningún dispatch para petición inválida/cuota/grupo incoherente, rechazo de
  respuesta discrepante y conservación de payload ante cancelación/error sin
  retry automático. Usar fixtures frescos y positivos antes de adulteraciones;
  no confundir falta de contexto en el fixture con un bug de producto.
  Focales con `pnpm --dir frontend run test --maxWorkers=2
  src/strategy/analysis-client.test.ts`, typecheck real y lint; revisión personal
  antes de suite frontend completa/build y commit. Sin Go nuevo ni abrir app.
- **T12g1 — helpers de conjunto completo (4 paths).**
  `frontend/src/hub/strategy-orbit/strategy-recorded-corrections.ts` +
  `strategy-recorded-corrections.test.ts`, y
  `frontend/src/strategy/analysis-contract.ts` + `analysis-contract.test.ts`.
  El contrato exporta un resolvedor pequeño de clave de metadato al campo
  cerrado SessionType/WeatherConditions, reutilizando TrimSpace y minúscula
  simple existentes. No duplicar normalización Unicode en el helper ni
  introducir un normalizador general; otra clave no se vuelve corregible.
  Cubrir mayúsculas, espacios NEL/NBSP, U+0130 y rechazo de FEFF prefijo.

  `recordedCorrectionSave` añade como último argumento el conjunto de
  clasificaciones, por defecto las peticiones del snapshot cargado. Todos
  los llamadores antiguos conservan decisiones; retirada/restauración aporta
  explícitamente el conjunto deseado (incluido []). Cuota conjunta de los
  tres grupos antes de parsear elementos, base exacta y revisión vigente
  requeridas para guardar; mantener detección de solapes escalares/familiares.
  Salida separada por clonación completa, apta para conservar un comando
  incierto sin que cambios posteriores de inputs lo modifiquen.

  `recordedClassificationCorrection` recibe sesión abierta, revisión cargada,
  campo, reemplazo y motivo. La precondición sale del metadato ORIGINAL de
  esa sesión, nunca del valor efectivo de una revisión. Exigir base exacta,
  una sola clave equivalente, presencia, calidad válida, no sensible ni
  redactado y valor string. Reusar parser de E para validez semántica/UTF-8
  y procedencia manual; no recortar original, motivo ni reemplazo enviados.
  Otro metadato ausente no bloquea este campo. La puerta local es orientativa:
  Save nativo mantiene toda la revalidación y autorización.

  Helpers de sustituir/retirar decisión por campo conservan el resto,
  rechazan campos/sets inválidos y bases mezcladas, sin mutar ni compartir
  entradas. Sin proyectar, adoptar, guardar o leer por su cuenta; sin hashes,
  nuevo lector, reglas físicas, UI ni cambios del contrato de coche/circuito.
  RED previo con el helper existente: guardar una revisión que contiene
  clasificación debe conservar ese grupo. Después cubrir tres grupos,
  sustitución individual, retiro/restauración explícitos, cuota 256/257
  antes de recorrer, original exacto/duplicados/calidad/base y no-alias.

  Gates: focales de los dos módulos + typecheck real + lint; revisión
  personal antes de commit local. La suite frontend completa y build se
  ejecutan después de G2, que conecta estos helpers al controlador, antes
  de considerar integrado el comportamiento del editor. Ningún gate de
  fixtures representa banco DuckDB real ni Wails.
- **T12g2 — controlador del editor (2 paths).**
  `frontend/src/hub/strategy-orbit/use-recorded-corrections.ts` +
  `use-recorded-corrections.test.tsx`. Añadir clasificaciones al estado Editor
  y a cada transición: carga de revisión exacta, edición/sustitución/retirada
  por campo mediante G1, descarte, guardado duradero, resolución encontrada
  o ausente, reintento explícito y restauración de un antepasado.
  `change` cuenta los tres grupos en la misma cuota 256 antes de publicar
  estado; rechazo conserva la propuesta previa completa.

  Guardar siempre aporta explícitamente los tres conjuntos del editor.
  Restaurar carga la cabeza anunciada, pero manda los tres conjuntos de la
  revisión que el usuario ha elegido restaurar, incluidos grupos vacíos:
  nunca heredar clasificaciones de la cabeza por el valor por defecto de G1.
  El comando incierto conserva exactamente base, tres grupos e identidad;
  bloquea toda edición, descarte y navegación que ya bloqueaban las familias.
  Resolve ausente conserva propuesta y causa de conflicto; no rebasa ni
  adopta cabeza. Resolve encontrado puede recuperar revisión antigua con
  cabeza avanzada. Guardado duradero se conserva aunque falle la proyección;
  repetir proyección no repite Save, y la adopción sigue siendo explícita.

  RED previo con API existente: restaurar un antepasado v1 ante una cabeza
  con clasificación debe enviar clasificaciones vacías. Cubrir además
  clasificación como único cambio pendiente, tres grupos, vuelta al guardado
  por descarte, sustitución frente al original intacto, guardado incierto con
  bloqueo y cancelación tardía, Resolve found/absent, restauración v3/v2/v1,
  cuota 256/257 y proyección fallida. Fixtures completos y frescos; las
  respuestas guardadas contienen los tres grupos solicitados y sus versiones
  coherentes. No alterar estado del dueño de handles ni UI/plan/catálogo.
  Focales + typecheck real + lint; revisión personal, después suite frontend
  completa y build para aceptar G1/G2 conectados. Sin Go nuevo, app ni LMU.
- **T12g3a — identidad de inspección en preparación (4 paths).**
  `internal/app/telemetry_analysis_corrections.go` +
  `telemetry_analysis_preparation_identity_test.go`, y
  `frontend/src/strategy/analysis-contract.ts` + `analysis-contract.test.ts`.
  PrepareCorrections expone además baseDigest calculado por SourceAnalysisRef.Digest
  dentro de la autorización/bloqueo existentes, incluso si falta metadata.
  No abre un lector extra ni consulta un catálogo. Error de digest se propaga
  por el mapeo público; conserva revisión inicial y combinación/causa.
  TS acepta baseDigest opcional para la compatibilidad de la ruta proyectada
  existente, pero valida formato digest si está presente (null/blank no válidos).
  La futura apertura sólo para inspección lo exigirá: no computar hashes en
  frontend ni fabricar una StrategyAnalysisRevisionRef a partir de IDs ajenos.
  Tests native completo/parcial verifican digest exacto y wire, repetición
  estable/identidad de fuente; TS legado/intacto y nuevo válido/inválido.
  Gates focales, global Go -p 1, vet de alcance, focal TS/typecheck/lint.
  Es requisito de G3b, no cierra por sí solo el acceso a Datos/Revisiones.

- **T12g3b — apertura exacta para inspección (4 paths).**
  `frontend/src/hub/strategy-orbit/strategy-recorded-session.ts` y test,
  `strategy-recorded-proposals.ts` y test. RecordedSession admite falta de
  combinationId y causa explícita projectionUnavailableReason=metadata_unavailable.
  Sólo la respuesta explícita de Prepare activa esta ruta, con baseDigest
  nativo obligatorio. Cargar revisión inicial o referencia esperada exacta,
  comprobar base/revisión/snapshot y digest esperado antes de conservar handle.
  En esta ruta, Session.ID abierto debe coincidir con Base.SessionID preparado;
  reusar el parser de preparación para validar formato, sin otro validador de
  digest. Revisión y snapshot salen del Load real, no del head ni de suposiciones.
  No usar la combinación seleccionada del borrador como identidad de la fuente,
  no llamar a Project ni derivar/hashar valores en frontend en esta ruta.
  Fallos de autorización, fuente, cancelación, contrato o cleanup conservan
  su tratamiento, sin catch general que los convierta en inspección válida.
  La ruta proyectada previa conserva compatibilidad si Prepare antiguo no
  aporta baseDigest/causa. La propuesta rechaza cualquier sesión sin proyección/
  combinación; no filtra silenciosamente una parte de la selección abierta.
  Fixtures de contrato exacto, referencia histórica/head nueva, fuente ajena,
  causa ausente, digest ausente/inválido, errores tardíos y cierre de handles.

- **T12g3c — dueño de sesiones y entrada al editor (4 paths).**
  `frontend/src/hub/strategy-orbit/use-recorded-sessions.ts` y test,
  `use-recorded-workflow.ts` y test. El dueño rechaza Apply/Adopt de una sesión
  no proyectable y conserva max4, duplicados, cancelación, exclusión mutua,
  bloqueo por ediciones/comando incierto y cierre de handles.
  Workflow expone acción explícita de inspección sobre una sesión ya poseída;
  reutiliza corrections.load y abre la vista editor sin crear/guardar un
  borrador, seleccionar revisiones ni calcular. Permite acceso sin combinación
  ni repositorio de carreras todavía disponible. Mantener los bloqueos actuales;
  nunca abrir un segundo handle ni duplicar controlador.

  El dueño expone inspect(session): boolean como aceptación de la acción, no
  como éxito de Load. Resuelve la fuente poseída por handle; rechaza fuente
  ajena, operación de sesiones pendiente, corrections.isBusy() o cambios/
  comando sin resolver antes de actuar. clear() debe aceptar antes de iniciar
  el mismo corrections.load: una lectura fallida no muestra datos anteriores.
  Load captura sus errores y establece su exclusión mutua sincrónicamente;
  no basta consultar el busy de React del render anterior. Workflow cambia a
  editor sólo si inspect fue aceptado y no hay escritura de carrera pendiente.
  Los formularios sin aplicar los protege el montaje Workflow en G3f.
  Tests en el mismo ciclo: operación de fuente pendiente impide inspección;
  inspección pendiente impide Close/Apply/cambiar de fuente; fallo conserva
  causa y deja el editor sin datos de la fuente anterior. Apply y onRevision
  rechazan fuentes no proyectables, aunque traigan un ID; ningún acceso al
  inspector adopta una revisión del plan. Focales, typecheck y lint por corte.

- **T12g3d — textos del acceso y selección (4 paths).**
  `frontend/src/i18n/locales/strategy-orbit/es.ts`, `en.ts`, `it.ts`, `pt.ts`.
  Etiquetas de inspeccionar, volver al asistente, datos insuficientes para calcular y fuente no
  utilizada por la carrera. Causa legible, sin IDs internos ni instrucciones
  de implementación. No anunciar resultado calculado ni lectura física validada.

  Copia española fijada por el orquestador (equivalentes en los otros idiomas):
  - strategy.recorded.inspect: Inspeccionar.
  - strategy.recorded.inspectionOnly: Solo inspección.
  - strategy.recorded.metadataUnavailable: Hay datos de identificación o
    clasificación que no se pueden verificar. Puedes revisar la sesión y
    guardar correcciones; aún no puede utilizarse para calcular la carrera.
  - strategy.recorded.notSelected: Esta sesión no se utiliza en la carrera.
    Puedes revisar sus datos y guardar correcciones.
  - strategy.recorded.backToWizard: Volver al asistente.
  Actualizar textos existentes open/prepared/busy/hint/revision para decir
  Abrir sesión/Sesiones abiertas/Buscando o abriendo la sesión…/Revisión abierta,
  sin prometer que todo lo abierto está preparado o fijado en la carrera.
  data.title/source y history.chooseSourceHint deben admitir inspección previa
  a la configuración de carrera. Conservar claves y otros textos ajenos.
  Auditoría i18n, typecheck y lint; si las cinco claves aún no consumidas
  producen huérfanas en este corte intermedio, registrar exactamente ese
  resultado y cerrarlo con E/F, sin falsos usos ni silenciar el auditor.

- **T12g3e — estado real de selección en Datos/Revisiones (4 paths).**
  `frontend/src/hub/strategy-orbit/StrategyRecordedData.tsx` y test,
  `StrategyRecordedRevisions.tsx` y test. Recibir referencias realmente
  seleccionadas por la carrera (ausencia equivale a [] durante compatibilidad
  de montaje). Pin requiere baseDigest/revisionId/snapshotId y sesión exactos;
  la revisión abierta no implica "Usada por esta carrera". Datos y Revisiones
  pueden inspeccionar fuentes no seleccionadas; preparar/adoptar para carrera
  requiere selección y proyección válidas. Revisar el pin carga la referencia
  del plan, no una cabeza o referencia de inspección. Mostrar causa de bloqueo,
  conservar edición/restauración local donde el campo sea válido.

  Resolver selectedRef por sesión y baseDigest del editor; pinned requiere
  también revisionId y snapshotId de current.revision. ReviewPinned desactivado
  sin referencia; si existe carga una copia de editor.session con revision igual
  a selectedRef, sin modificar el objeto ni suplantar la selección por head.
  No seleccionada: notSelected; no proyectable: metadataUnavailable, incluso
  con ID adherido. Las dos causas pueden coexistir. Los botones de carrera
  requieren fuente seleccionada y proyectable; guardar/restaurar local no.
  Tests de coincidencia exacta y diferencias de fuente/base/revisión/snapshot,
  referencia del borrador distinta de la inspeccionada y ausencia de selección.
  Los fixtures de carrera existentes reciben sus referencias explícitas;
  los nuevos de inspección reciben []. No ampliar CSS/lectores/motor.

- **T12g3e2 — guardado de inspección sin preparación automática (2 paths).**
  Hallazgo del orquestador al revisar el recorrido: retainSaved conserva el
  guardado pero llama siempre a Project; una fuente explícitamente no
  proyectable termina con error de preparación después de guardar correctamente.
  `frontend/src/hub/strategy-orbit/use-recorded-corrections.ts` y su test.
  Mantener la publicación de saved/current/tres grupos y resolución del comando;
  sólo ejecutar la proyección automática posterior si la sesión tiene
  combinationId y carece de projectionUnavailableReason. No ocultar errores
  inesperados de fuentes proyectables, errores de Save ni cancelación incierta.
  No cambiar Project explícito, Adopt, dueño o UI: G3e ya bloquea sus botones y
  las guardas existentes siguen revalidando. El cambio no crea otra ruta Save.

  RED antes de código: fuente parcial con SessionType/Weather válidos, corrección
  de campo existente y respuesta v3 completa validada; guardar conserva revisión
  exacta sin llamar a Project ni mostrar error espurio. Cubrir también el camino
  de Resolve o Restore que reutiliza retainSaved y ausencia de adopción implícita.
  Reusar savedAfter/sessionWithMetadata/openMetadata del test, no snapshots con
  padres incoherentes ni señales inventadas. Focal hook y dueño G3c, typecheck,
  lint; global frontend/build/auditor completo se mantienen en G3f.

- **T12g3f — conexión del recorrido único (4 paths).**
  `frontend/src/hub/strategy-orbit/StrategyRecordedWorkflow.tsx` y test,
  `StrategyRecordedSessions.tsx` y test. La biblioteca existente ofrece
  Inspeccionar en sesiones abiertas. Workflow cierra el drawer, llama inspect
  y muestra el mismo panel A4 Datos; pasa todas las sesiones abiertas y las
  referencias reales del borrador a Datos/Revisiones. No duplica pantalla ni
  añade una tercera ruta de persistencia. Usar selección rechaza fuentes
  no proyectables, sin aceptar un subconjunto oculto. Volver al asistente
  reutiliza flow.prepare, ofrece acción visible desde inspección y conserva
  lo pendiente; los formularios/comandos inciertos bloquean también esa salida.
  Prueba de recorrido: sin combinación ni carrera guardada, abrir fuente
  parcial -> Datos -> corrección válida -> guardado local -> causa de cálculo
  bloqueado -> historial -> volver al asistente; sin SaveDraft/Apply/Calculate
  implícitos. Bloqueos de formularios y comando incierto protegen la navegación.

  onInspect es callback opcional de SessionsView, separado del controlador
  legacy. El montaje comprueba formPending y sólo si flow.inspect acepta cierra
  biblioteca y abre Datos. Un Load fallido mantiene el error visible sin datos
  de la fuente anterior. La vuelta al asistente comprueba tanto en botón como
  en callback busy/formPending/unresolved; llama prepare sin recrear el draft.
  Mantener pestañas montadas conserva formularios; bloquear salidas que cambien
  fuente o desmonten el editor cuando estén pendientes. La biblioteca explica
  la causa y desactiva Use si alguna fuente no es proyectable; el dueño revalida.
  Nombres de fuentes parciales desde candidato o unnamed, sin combinación
  inventada; errores del acceso nuevo se traducen, sin mostrar códigos internos.
  Tras G3e2, el guardado local de una fuente de inspección no llama a Project;
  la prueba de recorrido verifica esa ausencia y el guardado confirmado.
  El botón de vuelta queda fuera de role=tablist, conservando Arrow/Home/End
  y foco de las pestañas. La biblioteca recibe busy de flow completo (incluye
  escritura de carrera), además del bloqueo de formularios. Reutilizar Button
  y estilos existentes; no bloquear todas las pestañas ni desmontar formularios
  al navegar entre ellas, porque ese comportamiento ya conserva lo pendiente.

  G3: focales/typecheck/lint por corte; global Go/vet para A. Suite frontend
  completa y build después de F antes de aceptar el montaje. G3A aislado
  no cierra acceso al editor. Revisión visual A4 y Wails se registran aparte.
  No nuevos lectores, custodias, autorizaciones sintéticas, dependencias,
  señales físicas ni campos de coche/circuito.
- **T12ha — consulta del original y normalización compartidas (4 paths).**
  `frontend/src/strategy/analysis-contract.ts` y su test;
  `frontend/src/hub/strategy-orbit/strategy-recorded-corrections.ts` y su test.
  La UI necesita conocer si cada campo es editable antes de proponer una
  corrección. Extraer de la validación existente
  `parseAnalysisClassificationOriginal(field, value)`: valida campo cerrado,
  string Unicode válido y Go-nonempty; SessionType debe pertenecer al enum.
  Devuelve el original RAW, sin recortarlo ni imponer un límite nuevo. El
  parser de peticiones lo reutiliza sin cambiar wire, errores o semántica.
  Exportar el enum existente como `analysisSessionTypes` y su normalización
  como `analysisCanonicalSessionType`; no duplicar Go TrimSpace/ToLower en UI.

  Extraer `recordedClassificationOriginal(session, current, field)` de las
  comprobaciones existentes de base, clave única, presencia, calidad y
  privacidad. Usar la validación anterior y reutilizarlo en el constructor
  `recordedClassificationCorrection`. No crear una corrección ni un motivo
  ficticios para comprobar disponibilidad; no API/capacidad nativa nueva.
  Native Save sigue siendo la autoridad. Identificar y ejecutar tests
  existentes antes del refactor; añadir paridad original/builder, original
  distinto del efectivo guardado, metadata parcial, duplicados, privacidad,
  Unicode NEL/FEFF/U+0130, enum desconocido y ausencia de mutación.
  Gates: focales de ambos módulos, typecheck producto y lint.

- **T12hb — textos de clasificación en cuatro idiomas (4 paths).**
  `frontend/src/i18n/locales/strategy-orbit/{es,en,it,pt}.ts`.
  El orquestador fija las doce claves/copias españolas siguientes, y el
  ejecutor traduce manteniendo el significado. Bajo `strategy.classification`:
  `tab` Clasificación; `field.SessionType` Tipo de sesión;
  `field.WeatherConditions` Etiqueta climática;
  `type.practice` Práctica; `type.qualify` Clasificación;
  `type.race` Carrera; `chooseField` Elige un dato para revisarlo.;
  `unavailable` No se puede corregir este dato porque su valor original no
  está disponible o no se puede verificar.;
  `restoreOriginal` Usar el valor original;
  `correctValue` Corregir este dato;
  `weatherHint` Cambiar esta etiqueta no modifica las temperaturas, la lluvia
  ni otras señales registradas.; `manual` Decisión manual.
  Reutilizar textos existentes de original, revisión guardada, propuesta,
  motivo y acciones. Auditor i18n con --list, typecheck y lint: las doce claves
  pueden ser huérfanas sólo durante este corte dependiente; conservar EXIT1
  como estado intermedio y consumirlas en Hc/Hd, sin whitelist ni falsos usos.

- **T12hc — clasificación en el mismo panel A4 Datos (4 paths).**
  `frontend/src/hub/strategy-orbit/StrategyRecordedClassification.tsx` y test
  nuevos, más `StrategyRecordedData.tsx` y su test. Dos vistas pequeñas de
  lista/detalle, como RecordedLaps, con los estilos existentes; no editor,
  controlador ni persistencia alternativos. La sección de clasificación se
  abre junto a vueltas y muestras avanzadas. Dos filas del conjunto cerrado.
  El helper Ha decide disponibilidad; fila no editable con causa, sin mostrar
  valores sensibles/redactados, y otro campo válido continúa editable.

  Mostrar original exacto de la sesión abierta, guardado confirmado desde
  current.snapshot y propuesta pendiente desde editor.classifications. Sólo
  presentar propuesta si difiere semánticamente de la petición guardada:
  usar sameAnalysisClassificationCorrections. La retirada de una corrección
  guardada muestra el original propuesto; no confundirla con confirmación.
  El selector SessionType usa el enum/localización y normalización compartidos;
  el valor original sigue raw. WeatherConditions es texto opaco con aviso.

  Data mantiene un solo formulario activo (escalar, familia o clasificación)
  y limpia los tres con clearForm. El formulario de clasificación ofrece
  corregir o usar el original, valor y motivo obligatorio. Aplicar llama
  editClassification/removeClassification, conserva motivo para la revisión
  y sólo limpia si el controlador acepta. Restaurar el original se prepara
  como retirada, no Save automático. La elección usa el select existente del
  formulario familiar, no radios afectados por los estilos globales de input;
  las celdas son texto y el detalle conserva output para el original.
  WeatherConditions se abre con el valor activo/guardado/original ya visible.
  Discard/Save/Resolve/Restore siguen en
  el controlador existente con tres grupos. El contador incluye los tres.
  Busy, formulario pendiente y comando incierto bloquean cambio de campo,
  vista o fuente; cambiar pestaña externa conserva el formulario montado.
  Nunca generar valor normalizado efectivo ni certeza física en React.

  Tests de los componentes y montaje con controlador real y respuestas
  contractuales válidas: ambos campos, motivo, retirada pendiente frente a
  guardada, original intacto, campo no disponible mientras otro sí, privacidad,
  tres grupos al guardar, rechazo sin perder formulario y comando incierto.
  Mantener el recorrido de muestras/vueltas y selección real de G3. Gates:
  focales clasificación/Datos/Revisiones/Workflow, typecheck y lint; auditor
  de claves para identificar exactamente lo pendiente de Hd.

- **T12hc2 — conservar la vista elegida al avanzar revisión (4 paths).**
  Hallazgo del orquestador al revisar el montaje Hc: Workflow remonta Data
  con `handle:revision`; el estado local vuelve a vueltas tras Save. Un test
  de Data aislado no demuestra la continuidad del recorrido productivo.
  Paths: `StrategyRecordedWorkflow.tsx`, `StrategyRecordedWorkflow.test.tsx`,
  `StrategyRecordedData.tsx` y `StrategyRecordedData.test.tsx`, todos bajo
  `frontend/src/hub/strategy-orbit`. Reproducir primero el salto en Workflow
  con respuestas válidas y luego corregirlo; no atribuir RED a Hc anterior.

  Elevar únicamente la vista seleccionada a Workflow, con tipo
  `RecordedDataView` y props obligatorias `view`/`onViewChange` en Data.
  Una sola fuente de estado: inicio en vueltas y conservación de la elección
  del usuario al guardar/cambiar revisión o fuente. Mantener revisionKey y
  el reinicio de formularios, sin persistencia nueva, estado duplicado ni
  inferencia de la vista a partir de clasificaciones en el snapshot.

  Prueba real de montaje: inspección → clasificación → editar con motivo →
  aplicar → Save explícito → revisión confirmada distinta, misma vista y
  clasificación confirmada visible. Sin adoptar/recalcular ni recrear draft.
  Adaptar los tests Data con un host mínimo de estado para las props
  controladas y conservar aserciones previas. Gates: focales
  Workflow/Data/Classification/Revisions, typecheck y lint; auditor puede
  conservar sólo `strategy.classification.manual` hasta Hd. Sin nuevo CSS,
  lector, Go o gate global; suite/build siguen después de Hd.

- **T12hd — decisiones de clasificación en Revisiones (2 paths).**
  `frontend/src/hub/strategy-orbit/StrategyRecordedRevisions.tsx` y su test.
  Contar/renderizar classifications del snapshot consultado, con campo,
  original, valor efectivo confirmado, motivo y procedencia manual. Para
  etiqueta climática conservar la distinción de señales físicas. No mostrar
  propuestas locales como guardadas ni cabeza como pin; v1/v2 sin cambios.
  El helper Ha se reutiliza como guarda de disponibilidad/privacidad del
  campo contra la fuente abierta y base actual. Si lo rechaza, mostrar sólo
  campo y causa; no original/corregido/motivo guardados. El otro campo válido
  sigue visible. El helper no sustituye valores del snapshot histórico ni
  autentica criptográficamente un historial local completamente falsificado.
  Restore sigue enviando tres grupos por el controlador ya probado.
  Tests de snapshot sólo clasificación, mezcla de tres grupos, revisión
  histórica exacta, privacidad con otro campo disponible y ausencia v1/v2.
  Tras revisión personal: focales,
  typecheck/lint, auditor i18n sin huérfanas/ausentes, suite frontend completa
  y build. Este gate es funcional local; paridad visual >9 y Wails aparte.
- **T12i — banco real opt-in y contraste (evidencia, sin paths nuevos en Analysis).**
  Dos paths de test: `internal/app/strategy_recorded_real_integration_test.go`
  y nuevo `internal/app/strategy_recorded_real_classification_test.go`.
  Reutiliza servicio/parser/trust/custodia/authorizer controlado/hash original
  del banco existente, con t.TempDir y opt-in Imola/Monza ya autorizados.
  Ningún nuevo lector o archivo de banco dentro de Analysis.

  Insertar helper antes del banco familiar, que cierra/reabre su handle.
  Recibir opened real/base/cabeza/candidato y devolver handle realmente
  reabierto + cabeza restaurada para que el banco familiar use ambos valores
  nuevos. No cambiar el helper familiar ni reutilizar un handle ya cerrado.
  Consultar los originales reales; no fabricar vueltas/señales/clasificación.

  Proyección base → decisión manual de etiqueta climática de validación →
  Save v3/Resolve/replay exacto → segunda revisión que conserva clima y
  cambia a otro tipo de sesión cerrado → retirada explícita de clasificaciones
  y familias como nueva revisión. Comprobar tipo/etiqueta y elegibilidad
  preliminar observed_strategy, no una derivación física nueva. Reemplazos
  del test son decisiones de validación, no diagnósticos reales de carrera.

  Comparar todas las familias físicas: validez, fuel/VE, ritmo por bucket,
  ClassPace, curvas combinada/separables, neumáticos, pit, SavingCost, clima
  y segmentos temporales. Puede compararse copia completa de la proyección
  omitiendo únicamente GeneratedAt/SourceRevisions y los campos de
  clasificación intencionalmente cambiados, verificados por separado:
  etiqueta climática y, al cambiar tipo, SessionType/UsableForFamilies.
  No omitir toda SessionClassification ni excluir familias
  para obtener PASS ni simular el reloj. Ausencia conservada no prueba
  utilidad de señal.

  Tras avanzar cabeza, Resolve/replay inicial devuelven revisión inicial
  del comando y cabeza avanzada. Cerrar/reabrir: Load/Project históricos
  exactos, cabeza restaurada y metadatos originales intactos. Hash de bytes
  fuente idéntico mediante el control del banco ya existente. Si faltan
  condiciones del archivo, exponer el límite; no fabricar datos ni cambiar
  de fuente silenciosamente.

  Gates: gofmt/focal app, global Go -p 1 ./... y vet de alcance, con build
  frontend Hd disponible para embed. Banco por fuente nombrada con
  ISA1088_REAL_SOURCE/ISA1088_RUNTIME_APP existentes;
  ISA1088_EXPORT_CATALOG vacío. Sin abrir reserva/held-out, exportar catálogo,
  app/LMU ni Wails. Logs `frontend/.tmp/isa1104-t12i-*.log` con EXIT real y
  reintentos conservados. Evidencia por root en `evidence/isa-1104/README.md`
  si se crea. Contraste Wails pendiente del runtime (T11i sin resolver);
  no atribuir precisión estadística ni aceptación nativa a este banco.

- **T12j1 — preparación pura de identidad canónica (4 paths).**
  `internal/telemetryanalysis/classification_corrections.go`, su test actual,
  nuevo `classification_identity.go` y `classification_identity_test.go`
  en el mismo paquete. Sólo tipos/preparación: sin wire nativo, snapshot,
  custodia, catálogo, UI, lector, nuevas dependencias ni delegación.

  Añadir los cuatro campos de identidad y canonicalCombinationId opcional
  en ClassificationCorrection (omitempty, preservando JSON/digests antiguos).
  Nueva PrepareCanonicalClassificationCorrectionSet(base, session, requests,
  target *CombinationIdentity): preparación pura, atómica, mismo orden/cuota.
  Los constructores anteriores conservan firmas y delegan sin target; siguen
  rechazando los nuevos campos hasta que su llamador nativo se conecte en
  los cortes posteriores. No aceptar strings canónicos sólo por su formato.

  Reutilizar el validador por campo/original/base/reason/provenance y extraer
  únicamente lo necesario para no duplicar el camino actual. Los dos campos
  antiguos prohíben referencia de combinación. Con identidad activa exigir
  un target completo LMU, consistente con el algoritmo Go existente, y una
  referencia común en todos los cambios. El target puro no prueba autorización:
  la obtendrá el Save nativo del catálogo en otro corte. Sin identidad activa
  no permitir target inerte y conservar resultados anteriores exactos.

  Aplicar reglas §5 sin convertir identidad a minúsculas ni rellenar
  metadatos. Precondición RAW exacta, replacement UTF8 de hasta1024 bytes
  brutos, recortado igual al valor target. Campos no corregidos utilizables
  deben concordar; no utilizables quedan intactos y bloquean clasificación
  global, no la preparación de otro campo válido. Atómico ante target/ID
  incorrecto, divergente, campo duplicado, expected distinto y cuota.

  Tests significativos: cuatro campos y combinación coherente, nombres
  con mayúsculas/Unicode/espacios según algoritmo actual, ID forjado o de
  otro tuple, falta de target y referencia en campo antiguo, conflicto de
  campo no corregido utilizable, otro campo ausente/privado/duplicado, no
  mutación y JSON/resultados anteriores conservados. No llamar a un fixture
  autorización real ni al fallo de compilación RED de producto.

  Gates: gofmt, focal de clasificación/identidad, global Go -p1 ./... y
  vet de alcance. Root revisa el diff antes del gate global; logs nuevos
  frontend/.tmp/isa1104-t12j1-*.log con EXIT y fallos conservados. Sin banco,
  app/LMU ni Wails. Próximo corte snapshot/decoder v4 aún no se delega;
  root declarará sus paths al aceptar éste.

- **T12j2 — snapshot y lectura de identidad v4 (5 paths).**
  `internal/telemetryanalysis/correction_snapshot.go`,
  `internal/telemetryanalysis/corrections_document.go`,
  `internal/telemetryanalysis/classification_identity.go`, nuevos
  `internal/telemetryanalysis/correction_snapshot_identity_test.go` y
  `internal/telemetryanalysis/corrections_document_identity_test.go`.
  Sin store/servicio/catálogo/UI/reader ni activación de escritura nativa.

  Antes de cambiar producción, capturar en el nuevo test los valores
  deterministas de v3 usando los constructores/fixtures actuales (sólo
  clasificaciones y mezcla de tres grupos). Registrar SnapshotID, digest
  de comando y SHA256 de JSON en un log baseline literal y fijarlos como
  vectores esperados. No regenerarlos después del cambio. Mantener goldens
  v1/v2 existentes y comprobar los mismos resultados serializados sin target.

  PreparedSampleCorrectionSnapshot añade canonicalCombination opcional
  como *CombinationIdentity, omitempty. Constructor canónico nuevo recibe
  los inputs actuales más target resuelto; el anterior conserva firma
  y delega sin target. Preparación via J1 contra originales actuales,
  misma cuota de tres grupos. Combinar con identidad requiere target,
  copia separada del tuple y tag analysis.mixed-snapshot.v4; el digest
  v4 cubre base, todos los grupos y target. Sin identidad, target debe
  faltar y se conserva exactamente la representación/digest v1/v2/v3.
  Los constructores antiguos no emiten identidad v3 por accidente.

  Lectura de documento recalcula snapshot/command/revision/chain mediante
  los validadores actuales y el target persistido. La preparación de
  representación guardada puede reconstruir el mínimo de originales
  esperados como hace hoy; no es autorización ni observación nueva.
  Validar target/IDs/campos/original/corregido; rechazar target ausente/
  divergente, identidad inerte, tag falso, cuota y conjunto incoherente.
  v4 requiere target no nulo. En v1/v2/v3 se rechaza la presencia del campo
  canonicalCombination, incluso null; omisión es la representación antigua.
  Puede hacerse una comprobación acotada de presencia con RawMessage en
  el decoder existente, conservando DisallowUnknownFields y el límite8MiB;
  no crear otro parser/pipeline genérico ni cambiar el formato documental1.

  El digest de comando con identidad no consulta catálogo ni requiere
  target resuelto: valida representación de peticiones (base exacta, campo
  cerrado, referencia común lmu:64hex, esperado RAW UTF8/no vacío,
  reemplazo bruto1024bytesUTF8/no vacío, motivo/manual, duplicados/cuota),
  ordena una copia y usa dominio analysis.mixed-command.v4. Reutilizar
  la validación común J1 cuando resulte claro. Los dos campos antiguos
  sin referencia conservan la ruta/domain v3 y sus bytes. No fabricar
  un tuple desde texto del cliente y llamarlo canónico. La validación
  contra target de catálogo ocurre al preparar una escritura nueva
  bajo lease en J3, después del replay. Resolve no dependerá del catálogo.

  Tests de v4 sólo identidad y mixto, orden estable, no mutación del target,
  cuota conjunta con cada grupo, referencias/targets divergentes, v4 inerte,
  formatos anteriores con target incluso null, manipulación de campos/
  digests y chain v1/v2/v3/v4→restauración legacy. Integridad local no es
  autenticación de una falsificación completamente coherente: no prometer
  que los hashes detectan esa situación. Conservar pruebas existentes.

  Gates: baseline previo, gofmt/focal snapshot/document/clasificación;
  root revisa diffs/logs antes de global Go -p1 ./... y vet de alcance.
  Logs nuevos frontend/.tmp/isa1104-t12j2-*.log, salida literal/EXIT inmediato
  y ningún archivo sobrescrito. No banco/GUI/LMU ni escritura de v4 mediante
  la app aún. Siguiente J3 de custodia/callback y luego vista/proyección,
  catálogo/montaje nativo y cliente/UI, con paths cerrados antes de asignar.

- **T12j3 — custodia de identidad y resolución diferida (2 paths).**
  `internal/telemetryanalysis/corrections_store.go` y nuevo
  `internal/telemetryanalysis/corrections_store_identity_test.go`.
  No catálogo, servicio, montaje nativo, proyección, cliente o UI.

  ObservationCorrectionInput añade sólo callback nativo opcional
  ResolveCanonicalCombination func(context.Context, string) (CombinationIdentity, error).
  No es DTO ni parte de digests. CorrectionStore no almacena catálogo.
  validatedMixedCommandDigest usa correctionCommandDigestCanonicalMixed de J2
  tanto para Save como Resolve; sin identidad mantiene la ruta anterior exacta.
  Reutilizar la referencia común ya validada por ese digest; no derivar
  un tuple desde texto del cliente. Para escritura nueva con identidad,
  resolver exactamente una vez con contexto e ID, dentro del lease y
  después de replay, cabeza, guardas de grupos desconocidos y cuota de
  revisiones. Sin identidad no invocar callback, aunque exista.
  Si falta callback con identidad, ErrCorrectionTarget sin escribir.
  Propagar error del callback con contexto/%w; comprobar ctx.Err después
  de resolver, incluso si el callback ignoró cancelación. El constructor
  canónico J2 valida referencia/tuple y originales; sin identidad conserva
  v1/v2/v3 exactos. No relajar ApplyLapFamilyCorrections ni validación
  de base, límites, comando y documento actuales.

  Replay idéntico y ResolveMixedCommand devuelven revisión inicial y
  cabeza actual sin resolver catálogo, incluso callback ausente/que fallaría.
  Mismo CommandID con payload distinto falla por conflicto antes de resolver.
  Reabrir/Load usa el target histórico persistido. Restaurar con grupos
  explícitos crea v1/v2/v3 según las decisiones restantes y conserva v4.
  Ni el test del callback ni la custodia prueban autorización física:
  cada operación nativa seguirá verificando fuente abierta/base en su capa.

  Tests contra t.TempDir y custodia real: sólo identidad y tres grupos,
  reabrir/Load completo; callback una vez y lease retenido; no resolver
  ante replay/Resolve/conflicto/cuota/cancelación/grupos omitidos ni
  escrituras sin identidad; rechazo de nil/error/target incorrecto,
  precondición discordante/campo corregido no verificable y cancelación
  durante callback sin writes; otra identidad ausente sigue permitiendo
  guardar el campo válido según J1, sin rellenar la ausencia;
  restauración e historial exacto; commit incierto en backup/primario y
  recuperación/replay sin catálogo. Contar writes y comprobar cabeza
  íntegra tras rechazos. Una cuota de256revisiones se prepara como
  documento/chain válidos, no insertando un estado corrupto que falle
  por otra razón. Mantener todos los tests anteriores.

  Gates gofmt/focales store/document/identidad; root revisa diff/logs antes
  de global Go -p1 ./... y vet de alcance. Logs nuevos literales
  frontend/.tmp/isa1104-t12j3-*.log con EXIT inmediato, sin sobrescribir.
  No banco/frontend/UI/Wails ni callback conectado a la app todavía.

Cada corte declara sus paths y evidencia antes de editar. El orquestador es
dueño de este plan, del handoff y de la issue. Desde el relevo autorizado por
Isaac el 2026-09-11, Devin MCP SWE-2 Max implementa, prueba y revisa los
cortes asignados. Root conserva dirección y aceptación basada en evidencia;
las menciones anteriores a Muse/revisión personal describen los cortes previos.
No cerrar T12 por validación pura ni fixtures: faltan montaje, banco real
y recorrido. Sin nuevos umbrales, dependencias ni arquitectura.

## Continuación cerrada por root — J4

Se ejecuta tras aceptar y guardar J3. No amplía el alcance público de T12.

- **T12j4 — vista efectiva y proyección de identidad (4 paths).**
  Producción: internal/telemetryanalysis/corrections_view.go.
  Nuevos tests: corrections_identity_view_test.go,
  corrections_identity_derivation_test.go y corrections_identity_projection_test.go
  en internal/telemetryanalysis. No catálogo, montaje nativo ni UI.

  ApplyMixedCorrectionSnapshot reconstruye el conjunto canónico J1 con el
  target persistido y el snapshot J2; valida igualdad completa antes de
  aplicar. Reutiliza identityTargetField para las cuatro identidades y
  classificationCorrectionKey para los campos anteriores. Copia metadata
  y cambia sólo campos explícitos: no añade ausencias ni muta fuentes,
  requests, páginas o target. Mantiene integridad v1/v2/v3 y rechaza target
  inerte. No añade target al EffectiveView ni otro pipeline.
  La derivación existente ya reclasifica metadata efectiva; no se prevén
  cambios productivos fuera de la vista. Si hacen falta, traer reproducción
  a root antes de ampliar paths.

  Primero RED conductual: snapshot v4 válido construido con J2 debe aplicar
  identidad en ApplyMixedCorrectionSnapshot; conservar rechazo actual y
  test antes del cambio. Nada de error de compilación como RED.
  Cubrir identidad sola/cuatro campos/tres grupos, original intacto,
  calidad/privacidad/duplicados, target/ref/prepared/snapshotID manipulados
  sin aplicación parcial. Otra metadata ausente conserva vista parcial,
  pero clasificación/derivación global bloqueadas. Compatibilidad anterior.
  Derivación verifica tuple e ID efectivos, original intacto e IDs de
  consumo/curvas/parada; compara magnitudes físicas manteniendo idénticas
  decisiones escalares/familias/tipo/clima y variando sólo identidad.
  Normalizar únicamente IDs comprobados, no retirar familias enteras.
  Custodia t.TempDir J3: guardar v4, avanzar/restaurar cabeza, reabrir y
  derivar revisión antigua exacta; comparar SessionID/BaseDigest/RevisionID/
  SnapshotID y combinación. Restauración usa original; mutar resultado no
  altera lectura posterior. No cambiar el rechazo vigente a originales
  no clasificables ni fabricar ClassifiedSession parcial.

  Gates: gofmt, focales, revisión técnica Devin, global Go -p1 ./... y vet
  de alcance. Logs nuevos isa1104-t12j4-* con salida literal y EXIT, nunca
  sobrescribir. Fixtures de contrato no prueban banco real, Wails ni Adopt.
  Root mantiene plan/aceptación; ejecutor implementa, prueba y revisa.

## Continuación cerrada por root — J5

Después de J4 aceptado, resolución real en el catálogo Analysis existente.
Dos paths: internal/telemetryanalysis/sessioncatalog.go y nuevo
internal/telemetryanalysis/sessioncatalog_identity_test.go. Sin servicio,
montaje, frontend, nuevos lectores ni otra caché/owner.

Añadir SessionCatalog.ResolveCanonicalCombination(ctx, id)
(CombinationIdentity, error), compatible con el callback J3. Validar
cancelación antes de I/O y después de ListSessionCombinations, aunque el
source ignore cancelación. Una consulta al listado existente, reutilizando
su autorización/clasificación/exclusiones; ningún hash calculado desde
texto del cliente acredita pertenencia. Comparación exacta de ID, sin
normalizar ni aceptar casefold/espacios. Devolver tuple por valor.
Catálogo nil/source nil: error sentinel ErrCanonicalCombinationUnavailable;
listado disponible sin coincidencia: ErrCanonicalCombinationUnknown.
Errores de lectura propagados con contexto/%w; prioridad cancelación
comprobada. No cambiar el estado vacío honesto de ListSessionCombinations
ni sus exclusiones. No depender de que haya vueltas completadas: pertenencia
canónica y disponibilidad para estrategia son decisiones distintas.

Tests: resolución exacta conocida, tuple/caso preservados y separado del
resultado; lista disponible vacía/desconocida, hash coherente de combinación
no presente, ID alterado, source nil/catalog nil, error I/O con errors.Is,
cancelación antes y durante listado, una llamada con mismo contexto,
modelo sin autorización/provenance discordante/metadata no clasificable
excluido. Reutilizar catalogModel y el catálogo real; sin DuckDB nuevo.
No test que falle sólo por no existir el método se presenta como RED.
Gofmt/focal catálogo y clasificación, revisión Devin, globalGo/vet.
Logs nuevos isa1104-t12j5-* sin sobrescribir, informe final completo local.
Montaje del callback y errores públicos serán un corte posterior.

## Continuación cerrada por root — J6

Tras J5 aceptado, conectar el catálogo a comandos nativos sin montaje Wails.
Tres paths: internal/app/telemetry_analysis_service.go,
internal/app/telemetry_analysis_correction_commands.go y nuevo
internal/app/telemetry_analysis_correction_identity_test.go.

TelemetryAnalysisConfig añade SessionCatalog *telemetryanalysis.SessionCatalog,
opcional, suministrado sólo por composición nativa. No nueva dependencia de
disponibilidad para iniciar Analysis, campo duplicado en service, DTO público
de configuración ni otro catálogo. SaveCorrections pasa el método
ResolveCanonicalCombination de esa instancia en ObservationCorrectionInput.
J5 admite receiver nil y lo traduce a no disponible si realmente se invoca.
No consulta previa: J3 decide bajo lease después de replay/cabeza/cuota.
Sin identidad las operaciones actuales siguen funcionando sin catálogo.

Load/Resolve/Project conservan historial sin catálogo; withCorrectionInput
sigue reautorizando fuente/base en TODAS las operaciones, incluido replay.
No adoptar plan ni sustituir referencia exacta con cabeza. Errores públicos:
ErrCanonicalCombinationUnknown -> ErrTelemetryAnalysisInvalidRequest;
ErrCanonicalCombinationUnavailable -> nuevo sentinel público
ErrTelemetryAnalysisCanonicalCombinationUnavailable con texto fijo
'the canonical combination catalog is unavailable'. Cancelación conserva
su error; I/O arbitrario se sanitiza mediante el mapping existente.
No filtrar rutas, IDs privados ni mensajes internos a frontend.

Tests de flujo nativo con reader controlado y catálogo existente con modelos
obtenidos por autorización de fixtures (no hash/tuple marcado confiable a
mano): save v4 positivo y Project con combinación exacta; fuente original
intacta; nil catálogo/desconocida/IO sanitizado; fallo de autorización/base
antes de consultar catálogo y sin revisión nueva; replay/Resolve/Load/Project
después de retirar destino del source siguen leyendo revisión persistida
si la fuente continúa autorizada. Revocar autorización de fuente bloquea
también esas operaciones históricas. Restauración conserva revisión v4 y
proyección antigua; no adopta nada en Strategy. Usar helpers nativos existentes
y un helper de fixture local al test nuevo; no cambiar tests antiguos.
Capturar RED conductual previo del guardado de identidad con configuración
de catálogo conectable cuando sea posible; no contar fallo de compilación
por el campo nuevo como RED. Un único nuevo test file debe bastar.

Gofmt, focales comandos/identidad/error público, revisión Devin, global Go
-p1 ./... y vet de alcance. Logs nuevos isa1104-t12j6-*, nunca sobrescribir.
Fixtures no prueban lectura DuckDB física, login, Wails ni adopción. No montar
la instancia en cmd/vantare en este corte; J7 posterior comparte la misma
instancia con Strategy. No ejecutar J6 antes de aceptar J5.

## Continuación cerrada por root — J7

Después de J6, composición de una única instancia nativa compartida.
Un path: cmd/vantare/main.go. Sin helpers/factories nuevos ni cambios a
strategyTelemetrySources, catálogo, servicio, reglas de licencia o frontend.

Mover únicamente la apertura del repositorio Strategy y la llamada existente
a strategyTelemetrySources a antes de construir TelemetryAnalysisService,
después de que licenseSvc esté disponible. Conservar las mismas guardas:
si strategyRootErr o Open del repositorio falla, no abrir fuentes y mantener
bridge indisponible; no introducir lectura de authorized-sessions.json
en esa ruta de error. Conservar logs y semántica cold-start existentes.
Variables locales con tipos existentes Repository[json.RawMessage],
*SessionCatalog y *coldstart.Service bastan; imports internos necesarios
no son dependencia externa nueva. No nuevos singletons.

Pasar el mismo puntero SessionCatalog a TelemetryAnalysisConfig.SessionCatalog
y app.NewStrategyRevisionCatalog. Construir Analysis y su frontera de licencia
antes del servicio Strategy que consume revisiones. Instancia creada una sola
vez; sin catálogo nativo si no pudo abrirse repo, J6 sigue disponible para
operaciones que no requieren resolver identidad. No reconstruir fuentes
para cada comando ni recuperar un catálogo desde UI.

Verificar por diff el puntero compartido, orden y rutas de error. No crear
tests que sólo busquen texto en main ni extraer una fábrica para poder probar
un cableado de una línea: se ejercitan tests existentes de configuración y
cold-start (TestResolveTelemetryAnalysisBackendConfig* y
TestStrategyTelemetryStartup*), junto a J6 para comportamiento del servicio.
Esta comprobación de composición/compilación NO certifica arranque Wails.
Gofmt, focales de cmd/vantare, revisión Devin, global Go y vet de alcance.
Logs nuevos isa1104-t12j7-* e informe local completo, sin sobrescribir.
No ejecutar la aplicación, LMU o build de escritorio; nada de fuentes
reales/secretos/perfiles ni promoción. Frontend v4 sigue siendo corte posterior.

## Continuación cerrada por root — J8a

Tras J7, contrato TypeScript v4 con fixture contrastada contra Go.
Cinco paths máximos declarados:
- frontend/src/strategy/analysis-contract.ts
- frontend/src/strategy/analysis-contract-identity.test.ts (nuevo)
- frontend/src/strategy/testdata/analysis-identity-snapshot-v4.json (nuevo)
- internal/telemetryanalysis/correction_identity_wire_test.go (nuevo)
- frontend/src/hub/strategy-orbit/StrategyRecordedClassification.tsx

Separar listas legacy (SessionType/WeatherConditions) e identidad (cuatro
campos); unión completa de campos wire. El listado de edición actual usa
explícitamente la lista legacy hasta que llegue su selector de catálogo,
para no exponer por accidente cuatro inputs de texto sin referencia.
No rediseño visual en este corte.

Clasificación: canonicalCombinationId requerido para identidad, prohibido
para legacy (incluido null/cadena vacía si está presente), referencia lmu:64hex
y común al conjunto. Reutilizar validación Unicode y goTrim existentes:
original RAW no vacío y sin límite de longitud inventado; reemplazo de
identidad máximo1024bytesUTF8 bruto, goTrim no vacío, sin casefold ni límites
del Weather. Prepared.original == RAW esperado y corrected == goTrim del
reemplazo. sameAnalysisClassificationCorrections compara también referencia.
Sin duplicados ni cambio a cuota conjunta256/grupos omitidos vs explícitos.

Snapshot v4 requiere actividad de identidad y canonicalCombination completo
{id,simId,trackName,trackLayout,carName,carClass}, simLMU, IDcanónico con forma
correcta y campos Unicode válidos, ya recortados/no vacíos. No límites
arbitrarios a campos no corregidos. Cada referencia coincide con target.id
y cada identidad corregida coincide con su campo del target. Legacy v1-v3
rechaza presencia de target incluso null; v4 sin identidad/target se rechaza.
No calcular hashes canónicos en JS ni llamar autorización a validación de
forma: pertenencia/digests completos/fuente continúan siendo autoridad Go.

Fixture JSON de snapshot v4 construida mediante J2 y comprobada en Go con
los helpers de contrato existentes. El test Go compara la fixture comprometida
con la salida real del constructor; no inventar IDs ni llamarla banco real.
Sin generador/pipeline productivo, SQL/lector en React, nuevas dependencias o
ediciones en otros tests. Puede mostrar JSON esperado al generar la fixture;
un fallo por archivo inicialmente ausente no es RED de producto.
Test TS positivo con esa fixture antes del cambio (rechazo v4 actual) como
RED conductual; después cubrir forma/target/ref/base/prepared/cuota/Unicode
y compatibilidad legacy. Si se usa wrapper de revision de prueba, distinguir
snapshot contrastado de wrapper, que no prueba autoridad ni custodia nativa.

Gates: fixture Go, focales de contrato y UI legacy, typecheck/lint/i18n,
suite frontend y build, global Go/vet por test Go añadido. Mantener logs
literales nuevos isa1104-t12j8a-*, nunca sobrescribir. No GUI/app/LMU.
Cliente/correlación v4 J8b y selector atómico de identidad serán posteriores.
