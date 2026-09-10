# T12 — microplan de evolución: correcciones tipadas de clasificación

ISA-1104, hija de #1091 y #1033; continúa #1099 (capacidad y banco T11 PASS;
T11i visual/nativo pendiente, sin certificar recorrido/capturas).
SDD R08/R07, aceptación A08/A09. Continúa ADR 0010 y
[corrections-contract-v1](../corrections-contract-v1.md) operación 2
`set_classification` (implementación parcial descrita aquí); no crea otra custodia,
lector, formato, motor ni dependencia. Este documento fija el contrato
implementable y los microcortes. T12a, T12b1, T12b2, T12c1, T12c2, T12d1, T12d2 y T12e están implementados y
revisados localmente; no cierran T12 ni los gates visual/nativo/empírico.

## 1. Conjunto cerrado de campos y tipos

Solo estos campos de la clasificación nativa admiten corrección:

| Campo | Tipo | Valores |
|---|---|---|
| `SessionType` | enum | `practice`, `qualify`, `race` (cerrado; otro valor se rechaza) |
| `WeatherConditions` | etiqueta opaca | texto recortado no vacío, máx. 64 caracteres; sin lista canónica (LMU varía); NO es señal física |
| `TrackName`, `TrackLayout`, `CarName`, `CarClass` | texto + referencia canónica resuelta por el servidor (§5) | no vacíos; corte posterior tras cerrar el contrato de resolución, fuera de T12a |

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

## 5. Referencia canónica y cambio de combinación (diseño pendiente de cerrar; fuera de T12a)

Flujos reales existentes, sin lookup inventado:

- Preparación clasifica ESA fuente abierta:
  `internal/app/telemetry_analysis_corrections.go:108-115` llama a
  `ClassifyHistoricalSession(input.Session)` bajo autorización y bloqueo de
  Analysis. Lo prueba
  `internal/app/telemetry_analysis_preparation_identity_test.go:11-72`
  (`TestPreparationOffersCanonicalCombinationWithoutPriorStrategyCatalog`):
  la identidad canónica existe sin ningún catálogo previo de Strategy, y el
  metadato ausente queda explícito (`metadata_unavailable`) sin bloquear la
  preparación. Esto NO equivale a consultar el catálogo de sesiones.
- Catálogo nativo separado: `internal/telemetryanalysis/sessioncatalog.go:76-84`
  `ListSessionCombinations` sobre `ListAuthorizedSessions`, y `:158-183`
  `ListAuthorizedSessionCombinations`, que solo agrupa modelos con token de
  autorización no falsificable. Analysis hoy NO puentea preparación↔catálogo
  para correcciones.

Diseño a cerrar: el cambio de coche/circuito propone valores legibles y el
cliente sí puede adjuntar la referencia/ID canónico explícito
(`combinationID` `lmu:sha256…` con clave de longitudes, solo en Go); el
servidor resuelve y valida esa referencia contra la fuente autorizada
existente (los modelos autorizados de esa base vía
`ListAuthorizedSessionCombinations`). Un ID inventado, una combinación
inexistente o un hash calculado sobre texto del cliente que no resuelva a
una entrada autorizada se rechaza como `unknown_combination`. Nunca se
acepta texto arbitrario del cliente como identidad canónica, nunca se
hashea texto del cliente llamándolo canónico y no se crea un catálogo
paralelo. Hasta cerrar ese contrato no se implementan los campos de
combinación (fuera de T12a).

Un cambio efectivo de coche/circuito deja obsoleta la selección de combinación
del plan afectado: el plan conserva su revisión anterior (R16), no rebasea, no
adopta cabeza y no recalcula silenciosamente; la UI exige re-adopción explícita
del usuario. Cambiar solo `SessionType` o `WeatherConditions` no invalida la
combinación; las familias afectadas se recalculan sobre vista separada.

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

- **T12g3d — textos del acceso y selección (4 paths).**
  `frontend/src/i18n/locales/strategy-orbit/es.ts`, `en.ts`, `it.ts`, `pt.ts`.
  Etiquetas de inspeccionar, volver al asistente, datos insuficientes para calcular y fuente no
  utilizada por la carrera. Causa legible, sin IDs internos ni instrucciones
  de implementación. No anunciar resultado calculado ni lectura física validada.

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

  G3: focales/typecheck/lint por corte; global Go/vet para A. Suite frontend
  completa y build después de F antes de aceptar el montaje. G3A aislado
  no cierra acceso al editor. Revisión visual A4 y Wails se registran aparte.
  No nuevos lectores, custodias, autorizaciones sintéticas, dependencias,
  señales físicas ni campos de coche/circuito.
- **T12h — UI Datos y Revisiones (4 paths).**
  `frontend/src/hub/strategy-orbit/StrategyRecordedData.tsx` +
  `StrategyRecordedData.test.tsx` (edición de SessionType/clima con causa);
  `frontend/src/hub/strategy-orbit/StrategyRecordedRevisions.tsx` +
  `StrategyRecordedRevisions.test.tsx` (historial de decisiones de
  clasificación). Gates: focales + typecheck + lint + build.
- **T12i — banco real opt-in y contraste (evidencia, sin paths nuevos en Analysis).**
  Reutiliza el banco nativo real existente en `internal/app`
  (patrones de `strategy_recorded_real_family_test.go` y
  `strategy_recorded_real_integration_test.go`: Imola/Monza autorizados,
  corrección, replay, restauración, hashes originales intactos); NO se crea un
  lector paralelo ni un `classification_bank_test.go` nuevo en Analysis.
  Evidencia en `evidence/isa-1104/README.md` si se crea. Contraste Wails
  pendiente del runtime (T11i sin resolver); documentar límites sin simular.

Cada corte declara sus paths y evidencia antes de editar. El orquestador es
dueño de este plan, del handoff y de la issue; Muse implementa únicamente
código/tests asignados y devuelve evidencia para revisión antes de gates/commit.
No cerrar T12 por validación pura ni fixtures: faltan montaje, banco real
y recorrido. Sin nuevos umbrales, dependencias ni arquitectura.
