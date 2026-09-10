# T12 — microplan de evolución: correcciones tipadas de clasificación

ISA-1104, hija de #1091 y #1033; continúa #1099 (T11 cerrado).
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
| `TrackName`, `TrackLayout`, `CarName`, `CarClass` | texto + identidad canónica | no vacíos; el cambio exige ID canónico explícito del catálogo nativo (§5) |

No admiten corrección: `SessionID`, `Status`/`Families` (derivados),
`SimID` (fijo `lmu`), hashes, parser, reloj, unidades ni canales. La
procedencia de cada decisión es manual con motivo obligatorio; corregir la
clasificación no declara una medición física verificada ni concede autorización.

## 2. Precondición original, presencia, calidad y ausencia

La precondición es el original clasificado por `ClassifyHistoricalSession`
sobre la base exacta: cada campo corregido debe existir en
`HistoricalMetadata` con `Present=true`, `Sensitive=false`,
`Redacted=false`, `Quality==QualityValid` y valor no vacío, sin duplicados
(mismas puertas que `classificationMetadata`). El valor esperado debe coincidir
con ese original; si difiere → `original_mismatch`, sin escritura parcial.

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

## 5. Canonicalización y cambio de combinación

El cliente nunca envía IDs: envía valores de campo y, para coche/circuito, la
selección debe corresponder a una entrada del catálogo nativo
(`SessionCatalog.ListSessionCombinations`, expuesta en preparación vía
`PrepareCorrections.Combination`, bajo autorización y bloqueo de Analysis). El
servidor recalcula `combinationID` (dominio `lmu:sha256` con clave de
longitudes, solo en Go) y lo compara con el catálogo; un ID inventado o una
combinación inexistente se rechaza como `unknown_combination`. No se acepta
texto arbitrario del cliente como identidad canónica ni se crea un catálogo
paralelo.

Un cambio efectivo de coche/circuito deja obsoleta la selección de combinación
del plan afectado: el plan conserva su revisión anterior (R16), no rebasea, no
adopta cabeza y no recalcula silenciosamente; la UI exige re-adopción explícita
del usuario. Cambiar solo `SessionType` o `WeatherConditions` no invalida la
combinación pero sí recalcula las familias afectadas sobre vista separada.

## 6. Consumo, derivación y permisos

Analysis aplica las decisiones sobre una vista separada de páginas/segmentación
base; catálogo observado y archivos intactos. Se recalculan únicamente familias
afectadas y dependientes (p. ej. `observed_strategy` al pasar a `race`,
`climate_buckets` ante nueva etiqueta); la clave de cada derivado incluye
fuente, parser/análisis, revisión y versión de criterio. `set_classification`
no cambia hash, autorización, origen temporal, parser, reloj ni unidades; la
base se revalida igual que en T11 y cada operación reatraviesa
`withCorrectionInput` (autorización + bloqueo + reintento idempotente).

## 7. Clima separado de señales físicas y de #1030

`WeatherConditions` corregida es una etiqueta de clasificación para
`climate_buckets`; no sustituye ni crea señales físicas de temperatura/humedad
de los canales, no fija umbrales y no toca los criterios empíricos de #1030.
Si una familia necesita canales/relojes/unidades ausentes, permanece no
calculable con causa. La inspección distingue etiqueta climática de
disponibilidad de señal.

## 8. Microcortes de ejecución (máx. 5 paths lógica/tests cada uno)

- **T12a — validación pura + tests (2 paths).** `internal/telemetryanalysis/classification_corrections.go`:
  tipo `ClassificationCorrection` (campo cerrado, original esperado, reemplazo,
  motivo), validación de conjunto/tipos/precondición/canonicalización de sesión
  y clima, errores tipados (`unknown_session_type`, `unknown_combination`,
  `original_mismatch`, `overlapping`); `classification_corrections_test.go`:
  table-driven por campo, duplicados, ausencias, calidad no válida, motivo
  vacío, ID inventado. Gates: `go test -p 1` focal + vet de alcance. Sin
  custodia ni wire.
- **T12b — snapshot v3 y custodia mixta (4 paths).**
  `correction_snapshot.go` + `correction_snapshot_test.go` (v3, digest
  conjunto, orden canónico, roundtrip v1→v2→v3, guard legacy extendido, cuota
  conjunta); `corrections_store.go` + `corrections_store_test.go` (persistencia
  v3, revalidación, 8 MiB, restauración). Gates: focales + global Go `-p 1` +
  vet de alcance.
- **T12c — vista, derivación y obsolescencia (4 paths).**
  `corrections_view.go` + `corrections_view_test.go` (aplicación sobre vista
  separada, sin mutar originales, precondición reclasificada);
  `corrections_derivation.go` + `corrections_derivation_test.go` (recompute de
  familias afectadas, señal de combinación obsoleta, reloj/parser intactos).
  Gates: focales + global Go + vet.
- **T12d — inspección y contrato TS (5 paths).**
  `corrections_inspection.go` + `corrections_inspection_test.go` (consulta de
  decisiones de clasificación por revisión exacta, paginación existente);
  `frontend/src/hub/strategy-orbit/strategy-recorded-corrections.ts` +
  `.test.ts` + `use-recorded-corrections.ts` (cliente tipado, preserva
  ausencia/unknown). Gates: focales + typecheck + lint + build. UI Datos y
  Revisiones en microcorte aparte si supera 5 paths
  (`StrategyRecordedData.tsx`, `StrategyRecordedRevisions.tsx` + tests).
- **T12e — banco real opt-in y contraste (2 paths + evidencia).**
  Nuevo `internal/telemetryanalysis/classification_bank_test.go` (opt-in:
  Imola/Monza autorizados, corrección de `SessionType`/clima, replay,
  restauración, hashes originales intactos); evidencia en
  `evidence/isa-1104/README.md` si se crea. Contraste Wails pendiente del
  runtime (T11i sin resolver); documentar límites sin simular.

Cada corte declara sus paths y evidencia antes de editar. No cerrar T12 por
validación pura ni fixtures: faltan custodia, derivación, montaje, banco real
y recorrido. Sin nuevos umbrales, dependencias ni arquitectura.
