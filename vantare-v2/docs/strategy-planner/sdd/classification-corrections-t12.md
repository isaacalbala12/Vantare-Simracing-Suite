# T12 — microplan de evolución: correcciones tipadas de clasificación

ISA-1104, hija de #1091 y #1033; continúa #1099 (capacidad y banco T11 PASS;
T11i visual/nativo pendiente, sin certificar recorrido/capturas).
SDD R08/R07, aceptación A08/A09. Continúa ADR 0010 y
[corrections-contract-v1](../corrections-contract-v1.md) operación 2
`set_classification` (propuesta, sin implementar); no crea otra custodia,
lector, formato, motor ni dependencia. Este documento fija el contrato
implementable y los microcortes; la ejecución empieza en T12a.

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
  T12a, digest conjunto, orden canónico, roundtrip v1→v2→v3, guard legacy
  extendido, cuota conjunta). Vacío canónico en v3: grupos ausentes son nil
  (misma digest viva/almacenada y JSON roundtrip directo sin reparación;
  v1/v2 intactos). Gates: focales + global Go `-p 1` + vet.
- **T12b2 — decoder, store y digests + tests (4 paths).**
  `corrections_document.go` + `corrections_document_test.go` (nuevo;
  decode/encode v3 y validación) + `corrections_store.go` +
  `corrections_store_test.go` (persistencia v3, revalidación de digests,
  8 MiB, restauración). El decoder REQUIERE edición para v3: revisarlo sin
  tocarlo no basta. Gates: focales + global Go `-p 1` + vet de alcance.
- **T12c — vista, derivación y obsolescencia (4 paths).**
  `corrections_view.go` + `corrections_view_test.go` (aplicación sobre vista
  separada, sin mutar originales, precondición reclasificada);
  `corrections_derivation.go` + `corrections_derivation_test.go` (recompute de
  familias afectadas con funciones existentes, señal de combinación obsoleta,
  reloj/parser intactos; sin recompute físico de clima, §7).
  Gates: focales + global Go + vet.
- **T12d — comandos nativos e inspección (4 paths).**
  `internal/app/telemetry_analysis_correction_commands.go` +
  `telemetry_analysis_correction_commands_test.go` (Save/Resolve aceptan
  decisiones de clasificación, reusan `withCorrectionInput`: autorización +
  bloqueo + reintento idempotente);
  `internal/telemetryanalysis/corrections_inspection.go` +
  `corrections_inspection_test.go` (consulta de decisiones de clasificación
  por revisión exacta, paginación existente). Gates: focales + global Go +
  vet de alcance.
- **T12e — contrato TS (2 paths).**
  `frontend/src/strategy/analysis-contract.ts` + `analysis-contract.test.ts`
  (tipos `set_classification`, validación de campo/precondición/motivo,
  preserva ausencia/unknown). El helper existente
  `frontend/src/hub/strategy-orbit/strategy-recorded-corrections.ts` NO es el
  contrato TS: sigue siendo helper y no se cuenta como path de contrato.
  Gates: focales + typecheck + lint.
- **T12f — cliente TS (2 paths).**
  `frontend/src/strategy/analysis-client.ts` + `analysis-client.test.ts`
  (llamadas tipadas, cancelación nativa, conserva calidad/presencia, rechaza
  revisiones ajenas). Gates: focales + typecheck + lint.
- **T12g — hook (2 paths).**
  `frontend/src/hub/strategy-orbit/use-recorded-corrections.ts` +
  `use-recorded-corrections.test.tsx` (controlador: staging de decisiones de
  clasificación, guardado duradero, comando incierto, sin adopción automática
  de cabeza). Gates: focales + typecheck + lint.
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

Cada corte declara sus paths y evidencia antes de editar. No cerrar T12 por
validación pura ni fixtures: faltan custodia, derivación, montaje, banco real
y recorrido. Sin nuevos umbrales, dependencias ni arquitectura.
